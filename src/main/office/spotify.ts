// Office jukebox (ported from Claw3D's soundclaw). All Spotify calls happen here:
// the renderer CSP blocks external fetches and tokens never leave main.
// Sign-in is Authorization Code + PKCE through a one-shot loopback server.
import { ipcMain, shell } from 'electron';
import { createServer, type Server } from 'node:http';
import { randomBytes } from 'node:crypto';
import { getSecret, setSecret, deleteSecret } from '../integrations';
import {
  SPOTIFY_LOOPBACK_PORT,
  SPOTIFY_REDIRECT_URI,
  buildAuthorizeUrl,
  isValidClientId,
  parseCallback,
  parsePlayback,
  parseSearch,
  parseTokenResponse,
  pkceChallenge,
  spotifyErrorMessage,
  spotifyUriKind,
  type SpotifyTokens
} from '../../shared/office/spotify';

const CLIENT_ID_REF = 'office:spotify:clientId';
const TOKENS_REF = 'office:spotify:tokens';
const API = 'https://api.spotify.com/v1';
const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const HTTP_TIMEOUT_MS = 10_000;
const SIGN_IN_TIMEOUT_MS = 3 * 60_000;

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : String(e)
});

async function timedFetch(url: string, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(HTTP_TIMEOUT_MS) });
  } catch {
    throw new Error('Could not reach Spotify. Check your internet connection.');
  }
}

function readTokens(): SpotifyTokens | null {
  try {
    const raw = getSecret(TOKENS_REF);
    return raw ? (JSON.parse(raw) as SpotifyTokens) : null;
  } catch {
    return null;
  }
}

function saveTokens(t: SpotifyTokens): void {
  const r = setSecret(TOKENS_REF, JSON.stringify(t));
  if (!r.ok) throw new Error(r.error ?? 'Could not save the Spotify sign-in.');
}

async function tokenRequest(body: Record<string, string>, prevRefresh = ''): Promise<SpotifyTokens> {
  const res = await timedFetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body)
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    // invalid_grant: the refresh token was revoked or expired. Start over.
    if (res.status === 400) deleteSecret(TOKENS_REF);
    throw new Error('Spotify sign-in failed. Connect again.');
  }
  const t = parseTokenResponse(json, Date.now(), prevRefresh);
  saveTokens(t);
  return t;
}

/** One refresh at a time. Spotify rotates the refresh token, so a second
 *  concurrent refresh sends the stale one, gets a 400, and tokenRequest then
 *  deletes the fresh tokens the first refresh just saved. */
let refreshing: Promise<SpotifyTokens> | null = null;

async function accessToken(forceRefresh = false): Promise<string> {
  const t = readTokens();
  const clientId = getSecret(CLIENT_ID_REF);
  if (!t || !clientId) throw new Error('Spotify is not connected. Click Connect first.');
  if (!forceRefresh && t.expiresAt - 60_000 > Date.now()) return t.accessToken;
  refreshing ??= tokenRequest(
    { grant_type: 'refresh_token', refresh_token: t.refreshToken, client_id: clientId },
    t.refreshToken
  ).finally(() => { refreshing = null; });
  const next = await refreshing;
  return next.accessToken;
}

/** Web API call with one refresh-and-retry on 401. Returns parsed JSON or null (204/empty). */
async function api(method: string, path: string, body?: unknown, retried = false): Promise<unknown> {
  const token = await accessToken(retried);
  const res = await timedFetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  if (res.status === 401 && !retried) return api(method, path, body, true);
  const text = await res.text();
  let json: unknown = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* player endpoints may send empty/plain bodies */ }
  if (!res.ok) throw new Error(spotifyErrorMessage(res.status, json));
  return json;
}

// ─── Sign-in ────────────────────────────────────────────────────────────────
let pending: { server: Server; timer: NodeJS.Timeout; reject: (e: Error) => void } | null = null;

function stopPending(reason?: string): void {
  if (!pending) return;
  const p = pending;
  pending = null;
  clearTimeout(p.timer);
  p.server.close();
  if (reason) p.reject(new Error(reason));
}

/** Opens the system browser and waits for one callback on 127.0.0.1. Resolves the auth code. */
function waitForCode(clientId: string, state: string, challenge: string): Promise<string> {
  stopPending('A new Spotify sign-in was started.');
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const r = parseCallback(req.url ?? '/', state);
      if (!r) { res.writeHead(404).end(); return; }
      const msg = 'error' in r ? r.error : 'DevLabs is connected to Spotify. You can close this tab.';
      res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', Connection: 'close' }).end(msg);
      stopPending();
      if ('error' in r) reject(new Error(r.error)); else resolve(r.code);
    });
    const timer = setTimeout(() => stopPending('Spotify sign-in timed out. Try again.'), SIGN_IN_TIMEOUT_MS);
    pending = { server, timer, reject };
    server.on('error', (e: NodeJS.ErrnoException) => {
      stopPending();
      reject(new Error(e.code === 'EADDRINUSE'
        ? `Port ${SPOTIFY_LOOPBACK_PORT} is busy. Close the app using it and try again.`
        : 'Could not start the Spotify sign-in.'));
    });
    server.listen(SPOTIFY_LOOPBACK_PORT, '127.0.0.1', () => {
      shell.openExternal(buildAuthorizeUrl(clientId, state, challenge)).catch(() => {
        stopPending('Could not open your browser for the Spotify sign-in.');
      });
    });
  });
}

async function connect(): Promise<Result> {
  try {
    const clientId = getSecret(CLIENT_ID_REF);
    if (!clientId) return { ok: false, error: 'Add your Spotify Client ID first.' };
    const verifier = randomBytes(48).toString('base64url');
    const state = randomBytes(24).toString('base64url');
    const code = await waitForCode(clientId, state, pkceChallenge(verifier));
    await tokenRequest({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT_URI,
      client_id: clientId,
      code_verifier: verifier
    });
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

const wrap = <T extends object>(fn: () => Promise<T>) => async (): Promise<Result<T>> => {
  try { return { ok: true, ...(await fn()) }; } catch (e) { return fail(e); }
};

export function registerSpotifyIpc(): void {
  ipcMain.handle('spotify:status', () => ({
    hasClientId: !!getSecret(CLIENT_ID_REF),
    connected: !!readTokens(),
    redirectUri: SPOTIFY_REDIRECT_URI
  }));

  ipcMain.handle('spotify:setClientId', (_e, id: unknown): Result => {
    const clean = typeof id === 'string' ? id.trim() : '';
    if (!isValidClientId(clean)) return { ok: false, error: 'That does not look like a Spotify Client ID (32 letters and numbers).' };
    const r = setSecret(CLIENT_ID_REF, clean);
    if (!r.ok) return { ok: false, error: r.error ?? 'Could not save the Client ID.' };
    deleteSecret(TOKENS_REF); // tokens belong to the old app
    return { ok: true };
  });

  ipcMain.handle('spotify:connect', () => connect());

  ipcMain.handle('spotify:disconnect', (): Result => {
    stopPending('Spotify sign-in was cancelled.');
    deleteSecret(TOKENS_REF);
    return { ok: true };
  });

  ipcMain.handle('spotify:search', (_e, query: unknown) => {
    const q = typeof query === 'string' ? query.trim() : '';
    if (!q || q.length > 200) return { ok: false, error: 'Type 1 to 200 characters to search.' };
    return wrap(async () => ({
      tracks: parseSearch(await api('GET', `/search?${new URLSearchParams({ q, type: 'track', limit: '10' })}`))
    }))();
  });

  // No uri: resume. A track uri plays that track; album/playlist/artist/show plays it as a context.
  ipcMain.handle('spotify:play', (_e, uri?: unknown) => {
    const kind = uri == null ? 'resume' : spotifyUriKind(uri);
    if (!kind) return { ok: false, error: 'That is not a Spotify link DevLabs can play.' };
    const body = kind === 'resume' ? undefined
      : kind === 'track' || kind === 'episode' ? { uris: [uri] }
      : { context_uri: uri };
    return wrap(async () => { await api('PUT', '/me/player/play', body); return {}; })();
  });

  ipcMain.handle('spotify:pause', wrap(async () => { await api('PUT', '/me/player/pause'); return {}; }));
  ipcMain.handle('spotify:next', wrap(async () => { await api('POST', '/me/player/next'); return {}; }));
  ipcMain.handle('spotify:previous', wrap(async () => { await api('POST', '/me/player/previous'); return {}; }));

  ipcMain.handle('spotify:queue', (_e, uri: unknown) => {
    const kind = spotifyUriKind(uri);
    if (kind !== 'track' && kind !== 'episode') return { ok: false, error: 'Only songs can be added to the queue.' };
    return wrap(async () => {
      await api('POST', `/me/player/queue?${new URLSearchParams({ uri: uri as string })}`);
      return {};
    })();
  });

  ipcMain.handle('spotify:playback', wrap(async () => ({ playback: parsePlayback(await api('GET', '/me/player')) })));
}
