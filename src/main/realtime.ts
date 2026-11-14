/**
 * Realtime Ramon — main-process ephemeral-token mint (card rt-1, Phase 1).
 *
 * The voice orchestrator (OpenAI `gpt-realtime-2`, speech-to-speech over WebRTC)
 * connects from the RENDERER. The renderer must NEVER hold the real OpenAI key, so
 * MAIN owns it: the BYOK key is stored encrypted at rest in `integration-secrets.json`
 * under `apikey:openai` (the same write-only broker the CLI engines use — set via the
 * `providerKey:*` IPC, materialized main-only, never echoed back). On demand MAIN
 * decrypts it ONCE to mint a SHORT-LIVED EPHEMERAL client secret; only that token +
 * a minimal session config cross IPC to the renderer's `RealtimeSession`. The real
 * key is never returned over IPC, never logged.
 *
 * Phase 1 is read-only — this module ONLY mints (no action tools; that's rt-5).
 *
 * Branch feat/realtime-michael. See board.md "🎙 REALTIME MICHAEL".
 */
import { ipcMain } from 'electron';
import { getSecret, hasSecret } from './integrations';

/** Mirrors `providerKeyRef('openai')` in src/main/index.ts (BACKEND_KEY_ENV maps
 *  openai→OPENAI_API_KEY). Inlined as a local const so this module needs no new
 *  export added to index.ts — keeping the index.ts edit to a single registration
 *  line (rt-1 COORD: Oscar also edits index.ts). */
const OPENAI_KEY_REF = 'apikey:openai';

/** GA speech-to-speech model for the voice orchestrator (v0.3.4: bumped to the
 *  July 2026 gpt-realtime-2.1 — 25% p95 latency cut, better interruption handling).
 *  Defined in shared/ and re-exported here: Settings names this model in copy the
 *  user reads, so main and the UI must not be able to disagree about it. */
export { REALTIME_MODEL } from '../shared/realtimePricing';
import { REALTIME_MODEL } from '../shared/realtimePricing';
import { GEMINI_LIVE_MODEL, GEMINI_TOKEN_URL, geminiErrorMessage } from '../shared/geminiLive';

/** Google AI Studio key — the same broker slot Agents & Models writes for the
 *  google backend (`providerKeyRef('google')` in index.ts). */
const GOOGLE_KEY_REF = 'apikey:google';
/** Token lifetime: long enough for a call (sessionResumption is not used, so a
 *  session lives until it closes); a new session must start within a minute. */
const GEMINI_TOKEN_TTL_MS = 30 * 60_000;
const GEMINI_NEW_SESSION_MS = 60_000;

/** GA ephemeral-secret mint endpoint. If an account/tier still answers the legacy
 *  beta shape, we fall back to /v1/realtime/sessions on a 404 and normalize both
 *  response shapes below. (Live verification is pending the user's real key.) */
const CLIENT_SECRETS_URL = 'https://api.openai.com/v1/realtime/client_secrets';
const LEGACY_SESSIONS_URL = 'https://api.openai.com/v1/realtime/sessions';

const MINT_TIMEOUT_MS = 15_000;

export type MintResult =
  | { ok: true; token: string; expiresAt: number | null; sessionConfig: { model: string } }
  | { ok: false; error: string; code?: string };

/** Whether a BYOK OpenAI key is stored (presence only — no decryption). Gates the
 *  Realtime Ramon voice toggle in the renderer, the way `hasGroqKey` gates the
 *  Free Flow mic button. */
export function hasOpenAiKey(): boolean {
  return hasSecret(OPENAI_KEY_REF);
}

/** Mint a short-lived ephemeral client secret for a realtime WebRTC session. The
 *  real OpenAI key is decrypted MAIN-ONLY here and is NEVER part of the result. */
export async function mintRealtimeToken(model: string = REALTIME_MODEL): Promise<MintResult> {
  const key = getSecret(OPENAI_KEY_REF);
  if (!key) {
    return { ok: false, error: 'no OpenAI API key set — add one in Settings → Voice', code: 'no_key' };
  }

  const post = async (url: string, body: unknown) => {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), MINT_TIMEOUT_MS);
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ac.signal
      });
      const text = await r.text();
      let json: Record<string, unknown> | undefined;
      try { json = text ? (JSON.parse(text) as Record<string, unknown>) : undefined; } catch { /* non-JSON body */ }
      return { status: r.status, ok: r.ok, json, text };
    } finally {
      clearTimeout(timer);
    }
  };

  try {
    // GA shape first: { session: { type, model } } → { value, expires_at, ... }.
    let res = await post(CLIENT_SECRETS_URL, { session: { type: 'realtime', model } });
    // Older accounts: fall back to the legacy sessions endpoint shape.
    if (res.status === 404) res = await post(LEGACY_SESSIONS_URL, { model });

    if (!res.ok) {
      const errObj = res.json?.error as { message?: unknown } | undefined;
      const msg =
        (typeof errObj?.message === 'string' && errObj.message) ||
        (res.text ? res.text.slice(0, 200) : `HTTP ${res.status}`);
      return { ok: false, error: `token mint failed (${res.status}): ${msg}`, code: 'mint_failed' };
    }

    // Normalize across GA ({ value }) and legacy ({ client_secret: { value } }) shapes.
    const clientSecret = res.json?.client_secret as { value?: unknown; expires_at?: unknown } | undefined;
    const token =
      (typeof res.json?.value === 'string' && (res.json.value as string)) ||
      (typeof clientSecret?.value === 'string' && clientSecret.value) ||
      '';
    if (!token) return { ok: false, error: 'mint returned no ephemeral token', code: 'no_token' };

    const expRaw = res.json?.expires_at ?? clientSecret?.expires_at;
    const expiresAt = typeof expRaw === 'number' ? expRaw : null;

    return { ok: true, token, expiresAt, sessionConfig: { model } };
  } catch (e) {
    const err =
      e instanceof Error ? (e.name === 'AbortError' ? 'token mint timed out' : e.message) : String(e);
    return { ok: false, error: err, code: 'network' };
  }
}

export type GeminiMintResult =
  | { ok: true; token: string; expiresAt: number | null; model: string }
  | { ok: false; error: string; code?: string };

export function hasGoogleKey(): boolean {
  return hasSecret(GOOGLE_KEY_REF);
}

/** Mint a single-use Gemini Live ephemeral token (v1beta auth_tokens). The real
 *  Google key is decrypted main-only and is never part of the result. */
export async function mintGeminiLiveToken(now: number = Date.now()): Promise<GeminiMintResult> {
  const key = getSecret(GOOGLE_KEY_REF);
  if (!key) {
    return { ok: false, error: 'no Google AI Studio key set — add one in Settings → Voice', code: 'no_key' };
  }
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), MINT_TIMEOUT_MS);
  try {
    const expireMs = now + GEMINI_TOKEN_TTL_MS;
    const r = await fetch(GEMINI_TOKEN_URL, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(expireMs).toISOString(),
        newSessionExpireTime: new Date(now + GEMINI_NEW_SESSION_MS).toISOString()
      }),
      signal: ac.signal
    });
    const text = await r.text();
    if (!r.ok) {
      const code = r.status === 429 ? 'quota' : r.status === 400 || r.status === 401 || r.status === 403 ? 'bad_key' : 'mint_failed';
      return { ok: false, error: geminiErrorMessage(r.status, text), code };
    }
    let json: { name?: unknown } | undefined;
    try { json = JSON.parse(text) as { name?: unknown }; } catch { /* non-JSON */ }
    const token = typeof json?.name === 'string' ? json.name : '';
    if (!token) return { ok: false, error: 'Google returned no ephemeral token', code: 'no_token' };
    return { ok: true, token, expiresAt: Math.floor(expireMs / 1000), model: GEMINI_LIVE_MODEL };
  } catch (e) {
    const err = e instanceof Error ? (e.name === 'AbortError' ? 'Gemini token mint timed out' : e.message) : String(e);
    return { ok: false, error: err, code: 'network' };
  } finally {
    clearTimeout(timer);
  }
}

/** Register the renderer-facing realtime IPC. A SINGLE call from index.ts (rather
 *  than per-handler `ipcMain.handle` lines there) keeps the index.ts footprint to
 *  one line — rt-1 COORD note (Oscar also edits index.ts). Neither handler ever
 *  returns the real OpenAI key. */
export function registerRealtimeIpc(): void {
  // Boolean presence only — gates the voice toggle.
  ipcMain.handle('realtime:hasKey', () => hasOpenAiKey());
  // Mint an ephemeral token; returns { token, sessionConfig } only.
  ipcMain.handle('realtime:mintToken', async (_evt, payload: unknown) => {
    const p = (payload ?? {}) as { model?: unknown };
    const model = typeof p.model === 'string' && p.model.trim() ? p.model.trim() : REALTIME_MODEL;
    return mintRealtimeToken(model);
  });
  ipcMain.handle('geminiLive:hasKey', () => hasGoogleKey());
  ipcMain.handle('geminiLive:mintToken', () => mintGeminiLiveToken());
}
