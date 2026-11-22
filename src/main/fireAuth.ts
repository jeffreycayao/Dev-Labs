/**
 * Who wrote a fire-request? Every agent can write the hive root, so the file
 * itself proves nothing, and the orchestrator's hook token must never be written
 * to disk (any agent could read it and speak as him). The `cth-fire.cjs` shim
 * main writes into hive-internal/bin (read-only to agents) signs the request
 * instead: HMAC-SHA256(token, `${id}\n${ts}\n${nonce}`). A copied file can only
 * re-fire the same agent, and is refused once its nonce is used or it is older
 * than FIRE_MAX_AGE_MS — so a fire the human undid cannot be replayed.
 *
 * Spawn-requests (which run a command) are signed the same way by `cth-spawn`,
 * over `spawn\n${ts}\n${nonce}\n${body}`: the extra field and the hex-only
 * nonce keep a fire signature from ever verifying as a spawn, or the reverse.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const FIRE_MAX_AGE_MS = 5 * 60_000;

/** The shim's signature, exported so tests and the shim agree on one format. */
export function fireSignature(token: string, id: string, ts: number, nonce: string): string {
  return createHmac('sha256', token).update(`${id}\n${ts}\n${nonce}`).digest('hex');
}

/** The cth-spawn shim's signature over the request JSON exactly as written. */
export function spawnSignature(token: string, body: string, ts: number, nonce: string): string {
  return createHmac('sha256', token).update(`spawn\n${ts}\n${nonce}\n${body}`).digest('hex');
}

type Signed = { ts?: unknown; nonce?: unknown; sig?: unknown };

/** Shared checks: well-formed, fresh, unused, and `sign(ts, nonce)` matches. */
function verifySigned(
  r: Signed,
  now: number,
  seen: Map<string, number>,
  sign: (ts: number, nonce: string) => string
): { ok: true } | { ok: false; reason: string } {
  if (typeof r.nonce !== 'string' || typeof r.sig !== 'string' || typeof r.ts !== 'number') {
    return { ok: false, reason: 'malformed signature' };
  }
  if (!/^[0-9a-f]{8,64}$/.test(r.nonce) || !/^[0-9a-f]{64}$/.test(r.sig)) return { ok: false, reason: 'malformed signature' };
  if (Math.abs(now - r.ts) > FIRE_MAX_AGE_MS) return { ok: false, reason: 'request expired' };
  if (seen.has(r.nonce)) return { ok: false, reason: 'request already used' };
  const want = Buffer.from(sign(r.ts, r.nonce), 'hex');
  if (!timingSafeEqual(want, Buffer.from(r.sig, 'hex'))) return { ok: false, reason: 'bad signature (not from the orchestrator)' };
  seen.set(r.nonce, now);
  return { ok: true };
}

function prune(seen: Map<string, number>, now: number): void {
  for (const [n, t] of seen) if (now - t > FIRE_MAX_AGE_MS) seen.delete(n);
}

/** Verify a signed fire-request against the orchestrator's live token. `seen`
 *  maps used nonces to their time; entries past FIRE_MAX_AGE_MS are pruned. */
export function verifyFireRequest(
  raw: unknown,
  token: string | undefined,
  now: number,
  seen: Map<string, number>
): { ok: true; id: string } | { ok: false; reason: string } {
  prune(seen, now);
  if (!token) return { ok: false, reason: 'the orchestrator is not running' };
  const r = (raw && typeof raw === 'object' ? raw : {}) as Signed & { id?: unknown };
  if (typeof r.id !== 'string' || typeof r.nonce !== 'string' || typeof r.sig !== 'string' || typeof r.ts !== 'number') {
    return { ok: false, reason: 'not a signed fire-request (use the cth-fire command)' };
  }
  const id = r.id;
  const v = verifySigned(r, now, seen, (ts, nonce) => fireSignature(token, id, ts, nonce));
  return v.ok ? { ok: true, id } : v;
}

/** Verify a signed spawn-request (`{ body, ts, nonce, sig }`, written by
 *  cth-spawn) and return the request it carries. Same token, age and nonce
 *  rules as a fire-request. */
export function verifySpawnRequest(
  raw: unknown,
  token: string | undefined,
  now: number,
  seen: Map<string, number>
): { ok: true; request: unknown } | { ok: false; reason: string } {
  prune(seen, now);
  if (!token) return { ok: false, reason: 'the orchestrator is not running' };
  const r = (raw && typeof raw === 'object' ? raw : {}) as Signed & { body?: unknown };
  if (typeof r.body !== 'string' || typeof r.nonce !== 'string' || typeof r.sig !== 'string' || typeof r.ts !== 'number') {
    return { ok: false, reason: 'not a signed spawn-request (use the cth-spawn command)' };
  }
  const body = r.body;
  const v = verifySigned(r, now, seen, (ts, nonce) => spawnSignature(token, body, ts, nonce));
  if (!v.ok) return v;
  try { return { ok: true, request: JSON.parse(body) }; }
  catch { return { ok: false, reason: 'the signed request is not valid JSON' }; }
}
