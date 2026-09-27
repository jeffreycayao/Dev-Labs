// Apply db/schema.sql to the Neon database in .env.local (idempotent).
import { readFileSync } from 'node:fs';
import { neon } from '@neondatabase/serverless';
import { readEnv } from './env.mjs';

const env = { ...readEnv(), ...process.env };
const url = env.DATABASE_URL || env.POSTGRES_URL;
if (!url) {
  console.error('DATABASE_URL missing. Run `vercel env pull .env.local` after connecting Neon to the project.');
  process.exit(1);
}
const sql = neon(url);
const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8')
  .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');
const statements = schema.split(/;\s*(?:\n|$)/).map((s) => s.trim()).filter(Boolean);
for (const st of statements) await sql.query(st);
const [{ region }] = await sql.query(`SELECT current_setting('neon.region', true) AS region`).catch(() => [{ region: null }]);
console.log(`Applied ${statements.length} statements.${region ? ` Neon region: ${region}` : ''}`);
