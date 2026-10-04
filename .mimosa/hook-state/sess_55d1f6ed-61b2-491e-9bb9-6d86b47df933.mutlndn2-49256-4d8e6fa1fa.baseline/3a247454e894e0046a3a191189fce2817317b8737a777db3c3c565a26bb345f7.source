/**
 * Tokens:
 *   - license token   EdDSA (Ed25519) JWS, verified OFFLINE by the desktop app
 *                     against the public key in src/shared/brand.ts.
 *   - access token    HS256 JWT, 15 min, only this service verifies it.
 *   - opaque secrets  refresh tokens, auth codes, web sessions: random 256-bit,
 *                     stored as SHA-256 only.
 */
import { createHash, createPrivateKey, randomBytes, type KeyObject } from 'node:crypto';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from './config.js';

export const ACCESS_TTL_S = 15 * 60;
export const REFRESH_TTL_MS = 90 * 24 * 3600 * 1000;
export const CODE_TTL_MS = 60 * 1000;
export const SESSION_TTL_MS = 30 * 24 * 3600 * 1000;
/** A free account token may work offline for this long before renewal. */
const SHORT_LICENSE_S = 24 * 3600;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

export function pkceS256(verifier: string): string {
  return createHash('sha256').update(verifier, 'ascii').digest('base64url');
}

let cachedKey: { pem: string; key: KeyObject } | null = null;
function signingKey(pem: string): KeyObject {
  if (cachedKey?.pem === pem) return cachedKey.key;
  const key = createPrivateKey(pem);
  if (key.asymmetricKeyType !== 'ed25519') throw new Error('LICENSE_SIGNING_KEY must be an Ed25519 private key');
  cachedKey = { pem, key };
  return key;
}

export interface LicenseSubject {
  accountId: string;
  email: string;
  name?: string | null;
  deviceId: string;
}

/**
 * Mint a signed, short-lived proof of a signed-in free account for this machine.
 */
export async function mintLicense(cfg: Config, who: LicenseSubject, nowMs: number): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  const payload: Record<string, unknown> = {
    email: who.email,
    name: who.name ?? undefined,
    did: who.deviceId,
    plan: 'free',
    status: 'free',
    features: []
  };
  const exp = now + SHORT_LICENSE_S;
  let jwt = new SignJWT(payload)
    .setProtectedHeader({ alg: 'EdDSA', kid: cfg.license.kid, typ: 'JWT' })
    .setIssuer(cfg.license.issuer)
    .setAudience(cfg.license.audience)
    .setSubject(who.accountId)
    .setIssuedAt(now)
    .setJti(randomToken(12));
  jwt = jwt.setExpirationTime(exp);
  return jwt.sign(signingKey(cfg.license.privateKeyPem));
}

function accessKey(cfg: Config): Uint8Array {
  return new TextEncoder().encode(cfg.accessTokenSecret);
}

export async function mintAccessToken(cfg: Config, accountId: string, nowMs: number): Promise<string> {
  const now = Math.floor(nowMs / 1000);
  return new SignJWT({ scope: 'license' })
    .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
    .setIssuer(cfg.authOrigin)
    .setAudience(cfg.apiOrigin)
    .setSubject(accountId)
    .setIssuedAt(now)
    .setExpirationTime(now + ACCESS_TTL_S)
    .sign(accessKey(cfg));
}

/** Account id, or null for anything invalid/expired. */
export async function verifyAccessToken(cfg: Config, token: string, nowMs: number): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, accessKey(cfg), {
      algorithms: ['HS256'],
      issuer: cfg.authOrigin,
      audience: cfg.apiOrigin,
      currentDate: new Date(nowMs)
    });
    return typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}
