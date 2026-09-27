// Minimal .env reader/writer for the local scripts (no dependency).
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export const ENV_FILE = new URL('../.env.local', import.meta.url);

export function readEnv(file = ENV_FILE) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/** Set keys in .env.local, keeping every other line (and comment) as is. */
export function writeEnv(values, file = ENV_FILE) {
  const lines = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/) : [];
  const left = new Map(Object.entries(values));
  const next = lines.map((line) => {
    const m = /^\s*([A-Z0-9_]+)\s*=/.exec(line);
    if (m && left.has(m[1])) {
      const v = left.get(m[1]);
      left.delete(m[1]);
      return `${m[1]}=${v}`;
    }
    return line;
  });
  for (const [k, v] of left) next.push(`${k}=${v}`);
  writeFileSync(file, next.join('\n').replace(/\n*$/, '\n'), { mode: 0o600 });
}
