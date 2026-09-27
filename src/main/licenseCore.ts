/**
 * Licensing core (main process) — the parts that need node:crypto or the
 * network but NOT electron, so they are unit-testable under plain node:
 *
 *   - PKCE (RFC 7636) + the /oauth/authorize URL (RFC 8252 native-app flow)
 *   - parsing the atmtlabs://auth/callback deep link
 *   - verifying a license token: a compact JWS signed EdDSA/Ed25519 by the
 *     licensing API, checked offline against public keys baked into the build
 *   - the HTTP client for auth.labs.atmt.dev (/oauth/*) and api.labs.atmt.dev
 *
 * Security notes:
 *   - The app is a PUBLIC OAuth client. There is no client secret to leak;
 *     PKCE is what stops another app that registers atmtlabs:// from redeeming
 *     an intercepted code.
 *   - Only the refresh token is a secret. It is never logged and never crosses
 *     IPC; license.ts keeps it encrypted at rest with safeStorage.
 *   - A license token is signed, not secret. Tampering with it breaks the
 *     signature; copying it to another machine fails the `did` check.
 *
 * Contract: docs/licensing/API.md.
 */
import { createHash, createPublicKey, randomBytes, verify as cryptoVerify, type KeyObject } from 'node:crypto';
import { CLOCK_SKEW_MS, type LicenseClaims, type LicenseErrorCode } from '../shared/license';

export interface LicensingEndpoints {
  authOrigin: string;
  apiOrigin: string;
  clientId: string;
  redirectUri: string;
}

export interface TokenVerifyConfig {
  issuer: string;
  audience: string;
  /** kid → SPKI PEM (Ed25519). */
  publicKeys: Readonly<Record<string, string>>;
}

// ─── base64url ──────────────────────────────────────────────────────────────

export function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

export function b64urlDecode(s: string): Buffer {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('not base64url');
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// ─── PKCE + authorize URL ───────────────────────────────────────────────────

/** S256 challenge for a verifier (RFC 7636 §4.2). */
export function pkceChallenge(verifier: string): string {
  return b64url(createHash('sha256').update(verifier, 'ascii').digest());
}

/** 32 random bytes → a 43-char verifier, the RFC's recommended size. */
export function createPkce(): { verifier: string; challenge: string } {
  const verifier = b64url(randomBytes(32));
  return { verifier, challenge: pkceChallenge(verifier) };
}

export function randomState(): string {
  return b64url(randomBytes(24));
}

export interface AuthorizeParams {
  challenge: string;
  state: string;
  /** 'signup' asks the auth server to open on the create-account screen. */
  screenHint?: 'signin' | 'signup';
}

export function buildAuthorizeUrl(ep: LicensingEndpoints, p: AuthorizeParams): string {
  const u = new URL('/oauth/authorize', ep.authOrigin);
  u.searchParams.set('response_type', 'code');
  u.searchParams.set('client_id', ep.clientId);
  u.searchParams.set('redirect_uri', ep.redirectUri);
  u.searchParams.set('scope', 'openid email profile offline_access');
  u.searchParams.set('code_challenge', p.challenge);
  u.searchParams.set('code_challenge_method', 'S256');
  u.searchParams.set('state', p.state);
  if (p.screenHint) u.searchParams.set('screen_hint', p.screenHint);
  return u.toString();
}

// ─── the atmtlabs://auth/callback deep link ─────────────────────────────────

function sameEndpoint(a: URL, b: URL): boolean {
  return a.protocol === b.protocol && a.host === b.host && a.pathname.replace(/\/+$/, '') === b.pathname.replace(/\/+$/, '');
}

/** Is this deep link the OAuth callback (vs. a shareable-hire link)? */
export function isAuthCallback(url: string, redirectUri: string): boolean {
  try {
    return sameEndpoint(new URL(url), new URL(redirectUri));
  } catch {
    return false;
  }
}

export type AuthCallback =
  | { kind: 'code'; code: string; state: string }
  | { kind: 'error'; error: string; state?: string };

/** Parse the callback. null = not the callback at all. */
export function parseAuthCallback(url: string, redirectUri: string): AuthCallback | null {
  if (!isAuthCallback(url, redirectUri)) return null;
  const q = new URL(url).searchParams;
  const state = q.get('state') ?? undefined;
  const error = q.get('error');
  if (error) return { kind: 'error', error: error.slice(0, 64), state };
  const code = q.get('code');
  if (!code || !state) return { kind: 'error', error: 'invalid_request', state };
  return { kind: 'code', code, state };
}

// ─── license token verification ─────────────────────────────────────────────

export type VerifyResult =
  | { ok: true; claims: LicenseClaims }
  | { ok: false; reason: string };

const keyCache = new Map<string, KeyObject | null>();

function ed25519Key(pem: string): KeyObject | null {
  if (keyCache.has(pem)) return keyCache.get(pem) ?? null;
  let key: KeyObject | null = null;
  try {
    const k = createPublicKey(pem);
    key = k.asymmetricKeyType === 'ed25519' ? k : null;
  } catch {
    key = null;
  }
  keyCache.set(pem, key);
  return key;
}

function isStr(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

/**
 * Verify signature, issuer, audience and shape. Deliberately does NOT reject
 * an expired token — the caller still wants its claims to say "your license
 * expired while offline, signed in as x@y" — see evaluateClaims().
 */
export function verifyLicenseToken(token: string, cfg: TokenVerifyConfig, now: number): VerifyResult {
  if (typeof token !== 'string' || token.length > 16_384) return { ok: false, reason: 'malformed' };
  const parts = token.split('.');
  if (parts.length !== 3) return { ok: false, reason: 'malformed' };
  const [h, p, s] = parts;

  let header: Record<string, unknown>;
  let payload: Record<string, unknown>;
  let sig: Buffer;
  try {
    header = JSON.parse(b64urlDecode(h).toString('utf8'));
    payload = JSON.parse(b64urlDecode(p).toString('utf8'));
    sig = b64urlDecode(s);
  } catch {
    return { ok: false, reason: 'malformed' };
  }
  if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
    return { ok: false, reason: 'malformed' };
  }
  // Pin the algorithm. Never let the token pick it (alg=none / HS256 confusion).
  if (header.alg !== 'EdDSA') return { ok: false, reason: 'bad_alg' };
  const kid = header.kid;
  if (!isStr(kid) || !Object.prototype.hasOwnProperty.call(cfg.publicKeys, kid)) {
    return { ok: false, reason: 'unknown_kid' };
  }
  const key = ed25519Key(cfg.publicKeys[kid]);
  if (!key) return { ok: false, reason: 'bad_key' };
  let valid = false;
  try {
    valid = cryptoVerify(null, Buffer.from(`${h}.${p}`, 'ascii'), key, sig);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: 'bad_signature' };

  if (payload.iss !== cfg.issuer) return { ok: false, reason: 'bad_issuer' };
  const aud = payload.aud;
  const audOk = Array.isArray(aud) ? aud.includes(cfg.audience) : aud === cfg.audience;
  if (!audOk) return { ok: false, reason: 'bad_audience' };
  if (!isStr(payload.sub) || !isStr(payload.did) || !isStr(payload.plan) || !isStr(payload.status)) {
    return { ok: false, reason: 'bad_claims' };
  }
  if (!isNum(payload.iat) || !isNum(payload.exp) || payload.exp <= payload.iat) {
    return { ok: false, reason: 'bad_claims' };
  }
  const notBefore = isNum(payload.nbf) ? payload.nbf : payload.iat;
  if (notBefore * 1000 > now + CLOCK_SKEW_MS) return { ok: false, reason: 'not_yet_valid' };
  if (payload.features !== undefined && !(Array.isArray(payload.features) && payload.features.every(isStr))) {
    return { ok: false, reason: 'bad_claims' };
  }
  for (const k of ['trial_end', 'period_end'] as const) {
    if (payload[k] !== undefined && payload[k] !== null && !isNum(payload[k])) return { ok: false, reason: 'bad_claims' };
  }
  return { ok: true, claims: payload as unknown as LicenseClaims };
}

// ─── HTTP client ────────────────────────────────────────────────────────────

export type FetchLike = (input: string, init?: {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

/** `unauthorized` is internal: the ACCESS token was rejected, so the caller
 *  refreshes and retries once. It never reaches the user. */
export type LicenseApiErrorCode = LicenseErrorCode | 'unauthorized';

export class LicenseApiError extends Error {
  constructor(readonly code: LicenseApiErrorCode, readonly httpStatus = 0) {
    super(code);
    this.name = 'LicenseApiError';
  }
}

const TIMEOUT_MS = 15_000;

async function call(
  fetchImpl: FetchLike,
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string }
): Promise<Record<string, unknown>> {
  let res: Awaited<ReturnType<FetchLike>>;
  try {
    res = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  } catch {
    throw new LicenseApiError('network');
  }
  let body: unknown = null;
  try { body = await res.json(); } catch { body = null; }
  const obj = body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (!res.ok) {
    const err = typeof obj.error === 'string' ? obj.error : '';
    // OAuth: a dead/rotated/revoked refresh token or a spent code. Only the
    // token endpoint says invalid_grant; that is the one "you are signed out".
    if (err === 'invalid_grant') throw new LicenseApiError('session_expired', res.status);
    if (err === 'device_limit') throw new LicenseApiError('device_limit', res.status);
    if (res.status === 401) throw new LicenseApiError('unauthorized', res.status);
    throw new LicenseApiError('server_error', res.status);
  }
  return obj;
}

export interface OAuthTokens {
  accessToken: string;
  /** Rotated on every refresh — always persist the newest one. */
  refreshToken: string;
  /** Epoch ms. */
  accessExpiresAt: number;
}

function parseTokens(obj: Record<string, unknown>, now: number, previousRefresh?: string): OAuthTokens {
  const access = obj.access_token;
  const refresh = obj.refresh_token ?? previousRefresh;
  const expiresIn = isNum(obj.expires_in) ? obj.expires_in : 900;
  if (!isStr(access) || !isStr(refresh)) throw new LicenseApiError('server_error');
  return { accessToken: access, refreshToken: refresh, accessExpiresAt: now + expiresIn * 1000 };
}

function form(fields: Record<string, string>): string {
  return new URLSearchParams(fields).toString();
}

const FORM = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };

/** authorization_code grant (RFC 6749 §4.1.3 + PKCE). */
export async function exchangeCode(
  fetchImpl: FetchLike, ep: LicensingEndpoints, code: string, verifier: string, now: number
): Promise<OAuthTokens> {
  const obj = await call(fetchImpl, new URL('/oauth/token', ep.authOrigin).toString(), {
    method: 'POST',
    headers: FORM,
    body: form({
      grant_type: 'authorization_code',
      code,
      code_verifier: verifier,
      redirect_uri: ep.redirectUri,
      client_id: ep.clientId
    })
  });
  return parseTokens(obj, now);
}

/** refresh_token grant. The server rotates the refresh token (reuse = revoke all). */
export async function refreshTokens(
  fetchImpl: FetchLike, ep: LicensingEndpoints, refreshToken: string, now: number
): Promise<OAuthTokens> {
  const obj = await call(fetchImpl, new URL('/oauth/token', ep.authOrigin).toString(), {
    method: 'POST',
    headers: FORM,
    body: form({ grant_type: 'refresh_token', refresh_token: refreshToken, client_id: ep.clientId })
  });
  return parseTokens(obj, now, refreshToken);
}

/** RFC 7009 revocation. Best effort — sign-out never waits on it succeeding. */
export async function revokeToken(fetchImpl: FetchLike, ep: LicensingEndpoints, refreshToken: string): Promise<void> {
  await call(fetchImpl, new URL('/oauth/revoke', ep.authOrigin).toString(), {
    method: 'POST',
    headers: FORM,
    body: form({ token: refreshToken, token_type_hint: 'refresh_token', client_id: ep.clientId })
  });
}

export interface DeviceInfo {
  deviceId: string;
  deviceName: string;
  platform: string;
  appVersion: string;
}

function bearer(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json', accept: 'application/json' };
}

/** Activate this device (idempotent) and get a fresh signed license token. */
export async function fetchLicense(
  fetchImpl: FetchLike, ep: LicensingEndpoints, accessToken: string, device: DeviceInfo
): Promise<string> {
  const obj = await call(fetchImpl, new URL('/v1/licenses', ep.apiOrigin).toString(), {
    method: 'POST',
    headers: bearer(accessToken),
    body: JSON.stringify({
      device_id: device.deviceId,
      device_name: device.deviceName,
      platform: device.platform,
      app_version: device.appVersion
    })
  });
  if (!isStr(obj.license)) throw new LicenseApiError('server_error');
  return obj.license;
}

/** Free this device's seat (sign-out). Best effort. */
export async function releaseDevice(
  fetchImpl: FetchLike, ep: LicensingEndpoints, accessToken: string, deviceId: string
): Promise<void> {
  await call(fetchImpl, new URL(`/v1/devices/${encodeURIComponent(deviceId)}`, ep.apiOrigin).toString(), {
    method: 'DELETE',
    headers: bearer(accessToken)
  });
}

/**
 * A one-time Stripe URL: 'checkout' starts the 7-day card-required trial,
 * 'portal' is the Stripe customer portal (card, invoices, cancel).
 * Only https URLs on stripe.com or our own domains are accepted, so a
 * compromised API response cannot make the app open an arbitrary page.
 */
export async function createBillingSession(
  fetchImpl: FetchLike, ep: LicensingEndpoints, accessToken: string, kind: 'checkout' | 'portal'
): Promise<string> {
  const obj = await call(fetchImpl, new URL(`/v1/billing/${kind}`, ep.apiOrigin).toString(), {
    method: 'POST',
    headers: bearer(accessToken),
    body: '{}'
  });
  const url = obj.url;
  if (!isStr(url) || !isAllowedBillingUrl(url)) throw new LicenseApiError('server_error');
  return url;
}

export function isAllowedBillingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:') return false;
    const h = u.hostname;
    return h === 'checkout.stripe.com' || h === 'billing.stripe.com' || h === 'atmt.dev' || h.endsWith('.atmt.dev');
  } catch {
    return false;
  }
}
