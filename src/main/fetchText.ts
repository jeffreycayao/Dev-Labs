/**
 * One place that fetches text over https.
 *
 * Extracted from skills.ts when the hero payload needed the same thing: two
 * copies of redirect-following, timeout and status handling would drift, and the
 * one that drifted would be the one nobody was looking at.
 *
 * https only, by construction — every caller fetches from raw.githubusercontent
 * or a repo URL, and an http: fallback would silently downgrade content the app
 * then renders.
 */
import { request as httpsRequest } from 'node:https';

const MAX_REDIRECTS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export function getText(url: string, opts: { timeoutMs?: number } = {}, hops = 0): Promise<string> {
  const timeoutMs = opts.timeoutMs ?? 12000;
  // Empty URL = remote catalog disabled (no CATALOG_REPO in shared/brand.ts); callers fall back.
  if (!url) return Promise.reject(new Error('remote source disabled'));
  return new Promise((resolve, reject) => {
    const req = httpsRequest(url, { method: 'GET', headers: { 'user-agent': 'devlabs' } }, (res) => {
      // Follow a redirect once per hop; raw.githubusercontent does this for
      // branch aliases and the request just fails without it.
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        if (hops >= MAX_REDIRECTS) { reject(new Error('too many redirects')); return; }
        let next: string;
        try { next = new URL(res.headers.location, url).href; } catch { reject(new Error('invalid redirect')); return; }
        getText(next, opts, hops + 1).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) { res.resume(); reject(new Error(`HTTP ${res.statusCode}`)); return; }
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => {
        body += c;
        if (body.length > MAX_BYTES) req.destroy(new Error('response too large'));
      });
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timed out')));
    req.end();
  });
}
