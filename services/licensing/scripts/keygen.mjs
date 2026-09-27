// Fill the generated secrets in .env.local (creating it from .env.example if
// needed). Never overwrites a value that is already set — rotating the license
// key is a deliberate act (see docs/licensing/DESIGN.md → key rotation).
import { copyFileSync, existsSync } from 'node:fs';
import { createPublicKey, generateKeyPairSync, randomBytes } from 'node:crypto';
import { ENV_FILE, readEnv, writeEnv } from './env.mjs';

if (!existsSync(ENV_FILE)) copyFileSync(new URL('../.env.example', import.meta.url), ENV_FILE);
const env = readEnv();
const set = {};
const secret = () => randomBytes(32).toString('base64url');
for (const k of ['SESSION_SECRET', 'ACCESS_TOKEN_SECRET', 'CRON_SECRET']) if (!env[k]) set[k] = secret();

let privatePem = env.LICENSE_SIGNING_KEY?.replace(/\\n/g, '\n');
let kid = env.LICENSE_SIGNING_KID;
if (!privatePem) {
  const { privateKey } = generateKeyPairSync('ed25519');
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  kid = `k${new Date().toISOString().slice(0, 10).replace(/-/g, '')}`;
  set.LICENSE_SIGNING_KEY = privatePem.trim().replace(/\n/g, '\\n');
  set.LICENSE_SIGNING_KID = kid;
}
writeEnv(set);

const publicPem = createPublicKey(privatePem).export({ type: 'spki', format: 'pem' }).toString().trim();
console.log(Object.keys(set).length ? `Wrote to .env.local: ${Object.keys(set).join(', ')}` : '.env.local already has every generated secret.');
console.log(`\nPaste into src/shared/brand.ts → LICENSING.publicKeys, then set enabled: true:\n`);
console.log(`  publicKeys: {\n    ${kid}: \`${publicPem}\`\n  } as Record<string, string>\n`);
