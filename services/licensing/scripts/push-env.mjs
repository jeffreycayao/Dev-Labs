// Upload .env.local to the linked Vercel project (run `vercel link` first).
//   npm run env:push                     → production
//   npm run env:push -- --target=preview
//   npm run env:push -- --force          → replace values that already exist
//   npm run env:push -- --dry-run
// DATABASE_URL / POSTGRES_* are skipped: the Neon integration manages them.
import { spawnSync } from 'node:child_process';
import { readEnv } from './env.mjs';

const args = process.argv.slice(2);
const target = args.find((a) => a.startsWith('--target='))?.split('=')[1] ?? 'production';
const force = args.includes('--force');
const dry = args.includes('--dry-run');
const managed = /^(DATABASE_URL|POSTGRES_|PG|NEON_)/;

const env = readEnv();
const keys = Object.keys(env).filter((k) => env[k] && !managed.test(k));
if (!keys.length) {
  console.error('.env.local has nothing to push. Run `npm run keygen` and fill in the rest.');
  process.exit(1);
}
const vercel = (argv, input) => spawnSync('vercel', argv, { input, encoding: 'utf8', shell: process.platform === 'win32' });
for (const k of keys) {
  if (dry) { console.log(`would set ${k} (${target})`); continue; }
  if (force) vercel(['env', 'rm', k, target, '--yes']);
  const r = vercel(['env', 'add', k, target], env[k]);
  const out = `${r.stdout}${r.stderr}`;
  if (r.status === 0) console.log(`✓ ${k}`);
  else if (/already exists/i.test(out)) console.log(`= ${k} already set (use --force to replace)`);
  else { console.error(`✗ ${k}: ${out.trim().split('\n').pop()}`); process.exitCode = 1; }
}
