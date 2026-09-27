import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { API, AUTH, harness } from './harness.js';
// @ts-expect-error — plain .mjs generator, no types
import { render } from '../scripts/brand-assets.mjs';

test('brand: src/brandAssets.ts matches assets/ (run `npm run brand:assets` after changing them)', () => {
  const onDisk = readFileSync(new URL('../src/brandAssets.ts', import.meta.url), 'utf8');
  assert.equal(onDisk, render());
});

test('brand: favicons, manifest, logos and fonts are served with the right types', async () => {
  const h = await harness();
  const want: Record<string, string> = {
    '/favicon.ico': 'image/x-icon',
    '/favicon-32x32.png': 'image/png',
    '/apple-touch-icon.png': 'image/png',
    '/site.webmanifest': 'application/manifest+json',
    '/brand/logo-on-light.webp': 'image/webp',
    '/brand/logo-on-dark.webp': 'image/webp',
    '/brand/fonts/poppins-latin-700-normal.woff2': 'font/woff2',
    '/brand/fonts/inter-latin-var.woff2': 'font/woff2'
  };
  for (const [path, type] of Object.entries(want)) {
    const res = await h.app.request(`${AUTH}${path}`);
    assert.equal(res.status, 200, path);
    assert.equal(res.headers.get('content-type'), type, path);
    assert.match(res.headers.get('cache-control') ?? '', /public/, path);
    assert.ok((await res.arrayBuffer()).byteLength > 100, path);
  }
  const png = new Uint8Array(await (await h.app.request(`${AUTH}/favicon-32x32.png`)).arrayBuffer());
  assert.deepEqual([...png.slice(1, 4)], [0x50, 0x4e, 0x47], 'real PNG bytes');
  const manifest = await (await h.app.request(`${AUTH}/site.webmanifest`)).json() as { name: string };
  assert.equal(manifest.name, 'ATMT Labs');
  assert.equal((await h.app.request(`${API}/favicon.ico`)).status, 404, 'the API host serves only the API');
});

test('brand: every page links the favicon set and logo, and the CSP allows our fonts and manifest', async () => {
  const h = await harness();
  const res = await h.app.request(`${AUTH}/login`);
  const html = await res.text();
  for (const s of ['/favicon.ico', '/favicon-32x32.png', '/apple-touch-icon.png', '/site.webmanifest', '/brand/logo-on-light.webp', '/brand/logo-on-dark.webp', 'Poppins', '#c7fd11']) {
    assert.ok(html.includes(s), s);
  }
  const csp = res.headers.get('content-security-policy') ?? '';
  assert.match(csp, /font-src 'self'/);
  assert.match(csp, /manifest-src 'self'/);
  assert.match(csp, /script-src|default-src 'none'/, 'still no scripts');
});
