// Unlock codes (free lifetime licenses) — run on YOUR computer, never deployed.
//
//   npm run codes -- create --count 5 --label "Beta testers" [--expires 2026-12-31]
//   npm run codes -- list
//   npm run codes -- revoke ATMT-XXXXX-XXXXX-XXXXX-XXXXX
//
// Codes are printed ONCE, when created. Only their hash is stored, so a lost
// code can't be looked up again — revoke it and make a new one.
import { neon } from '@neondatabase/serverless';
import { readEnv } from './env.mjs';
import { Store } from '../src/store.js';
import { hashUnlockCode, mintUnlockCodes, normalizeUnlockCode, unlockCodeState } from '../src/codes.js';

const env = { ...readEnv(), ...process.env } as Record<string, string | undefined>;
const url = env.DATABASE_URL || env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL missing. Run `vercel env pull .env.local` first.');
  process.exit(1);
}
const sql = neon(url);
const store = new Store((text, params) => sql.query(text, params ?? []) as Promise<Record<string, any>[]>);
const authOrigin = (env.AUTH_ORIGIN || 'https://auth.labs.atmt.dev').replace(/\/$/, '');

const [cmd, ...rest] = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
}
const day = (d: Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : '');

if (cmd === 'create') {
  const count = Number(flag('count') ?? '1');
  if (!Number.isInteger(count) || count < 1 || count > 500) throw new Error('--count must be 1..500');
  const label = flag('label')?.slice(0, 120) ?? null;
  const exp = flag('expires');
  const expiresAt = exp ? new Date(`${exp}T23:59:59Z`) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) throw new Error('--expires must be YYYY-MM-DD');
  const codes = await mintUnlockCodes(store, count, label, expiresAt);
  console.log(`Created ${count} unlock code(s)${label ? ` for "${label}"` : ''}${expiresAt ? `, valid until ${exp}` : ''}.`);
  console.log('Save them now — they are not shown again.\n');
  for (const c of codes) console.log(`${c}    ${authOrigin}/redeem?code=${c}`);
} else if (cmd === 'list') {
  const rows = await store.listUnlockCodes();
  if (!rows.length) console.log('No unlock codes yet.');
  for (const r of rows) {
    const state = unlockCodeState(r, new Date()).text;
    console.log(`${day(r.created_at)}  ${r.code_hash.slice(0, 10)}…  ${(r.label ?? '').padEnd(28).slice(0, 28)}  ${state}`);
  }
} else if (cmd === 'revoke') {
  const n = normalizeUnlockCode(rest[0] ?? '');
  if (!n) throw new Error('Pass the full code: npm run codes -- revoke ATMT-XXXXX-…');
  console.log((await store.revokeUnlockCode(hashUnlockCode(n))) ? 'Revoked.' : 'Not revoked: unknown code, or it was already used/revoked.');
} else {
  console.log('Usage:\n  npm run codes -- create --count 5 --label "Beta testers" [--expires YYYY-MM-DD]\n  npm run codes -- list\n  npm run codes -- revoke ATMT-XXXXX-XXXXX-XXXXX-XXXXX');
}
