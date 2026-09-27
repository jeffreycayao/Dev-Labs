/**
 * Unlock codes: single-use vouchers that grant a lifetime license for free,
 * without Stripe. The owner mints them with `npm run codes -- create`; a user
 * redeems one on the account page, at /redeem?code=…, or in the desktop app.
 *
 *   ATMT-7K2QD-M9XHF-4TNBR-WC8P6   (Crockford base32, 20 symbols = 100 bits)
 *
 * Only a SHA-256 of the normalized code is stored, so a database leak does not
 * leak usable codes. Normalizing forgives what people get wrong when typing:
 * case, spaces, dashes, and the look-alikes O→0, I/L→1.
 */
import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: no I L O U
const GROUPS = 4;
const GROUP_LEN = 5;
const BODY_LEN = GROUPS * GROUP_LEN;

export function generateUnlockCode(): string {
  const bytes = randomBytes(BODY_LEN);
  let body = '';
  for (let i = 0; i < BODY_LEN; i++) body += ALPHABET[bytes[i] & 31];
  const groups: string[] = [];
  for (let i = 0; i < BODY_LEN; i += GROUP_LEN) groups.push(body.slice(i, i + GROUP_LEN));
  return `ATMT-${groups.join('-')}`;
}

/** The canonical body (20 symbols), or null when it can't be a code. */
export function normalizeUnlockCode(input: string): string | null {
  if (typeof input !== 'string' || input.length > 64) return null;
  let s = input.toUpperCase().replace(/[\s-]/g, '');
  if (s.startsWith('ATMT')) s = s.slice(4);
  s = s.replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== BODY_LEN) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

export function hashUnlockCode(normalized: string): string {
  return createHash('sha256').update(`atmt-unlock:${normalized}`).digest('hex');
}

export type RedeemError = 'code_invalid' | 'code_used' | 'code_expired' | 'already_licensed';

export const REDEEM_MESSAGES: Record<RedeemError, string> = {
  code_invalid: "That code isn't valid. Check it and try again.",
  code_used: 'That code has already been used.',
  code_expired: 'That code has expired.',
  already_licensed: 'This account already has a lifetime license, so the code was not used. Pass it on to someone else.'
};

export interface CodeStateInput {
  created_at: Date;
  expires_at: Date | null;
  revoked_at: Date | null;
  redeemed_at: Date | null;
  redeemed_email?: string | null;
}

const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

/** One line for the owner: used by whom, revoked, expired, or still open.
 *  Shared by `npm run codes -- list` and the /admin page. */
export function unlockCodeState(r: CodeStateInput, now: Date): { state: 'used' | 'revoked' | 'expired' | 'unused'; text: string } {
  if (r.redeemed_at) return { state: 'used', text: `used ${day(r.redeemed_at)} by ${r.redeemed_email ?? '(deleted account)'}` };
  if (r.revoked_at) return { state: 'revoked', text: `revoked ${day(r.revoked_at)}` };
  if (r.expires_at && new Date(r.expires_at) <= now) return { state: 'expired', text: `expired ${day(r.expires_at)}` };
  return { state: 'unused', text: `unused${r.expires_at ? `, expires ${day(r.expires_at)}` : ''}` };
}

/** Mint `count` codes. Returns the plain codes: the only time they exist
 *  outside the recipient's hands. */
export async function mintUnlockCodes(
  store: { createUnlockCodes(hashes: string[], label: string | null, expiresAt: Date | null): Promise<void> },
  count: number, label: string | null, expiresAt: Date | null
): Promise<string[]> {
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('count must be 1..500');
  const codes = Array.from({ length: count }, generateUnlockCode);
  await store.createUnlockCodes(codes.map((c) => hashUnlockCode(normalizeUnlockCode(c)!)), label, expiresAt);
  return codes;
}
