import test from 'node:test';
import assert from 'node:assert/strict';
import { API, AUTH, harness } from './harness.js';

const OWNER = 'jeffreycayao@gmail.com';
type H = Awaited<ReturnType<typeof harness>>;

function post(b: { req: (url: string, init?: RequestInit) => Promise<Response> }, path: string, form: Record<string, string>, origin = AUTH) {
  return b.req(`${AUTH}${path}`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
  });
}

/** Codes in a page, minus the input placeholder. */
function codesIn(html: string): string[] {
  return [...new Set(html.match(/ATMT(-[0-9A-HJKMNP-TV-Z]{5}){4}/g) ?? [])].filter((c) => c !== 'ATMT-XXXXX-XXXXX-XXXXX-XXXXX');
}

async function redeemApi(h: H, access: string, code: string) {
  const res = await h.app.request(`${API}/v1/redeem`, {
    method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: JSON.stringify({ code })
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('admin: signed out → login; a non-owner gets a plain 404 and cannot post', async () => {
  const h = await harness();
  const anon = await h.browser().req(`${AUTH}/admin`);
  assert.equal(anon.status, 302);
  assert.equal(anon.headers.get('location'), '/login?next=/admin');

  const other = await h.webSignIn('someone@example.com');
  assert.equal((await other.req(`${AUTH}/admin`)).status, 404);
  assert.equal((await post(other, '/admin/codes', { count: '3' })).status, 404);
  assert.equal((await h.db.query(`SELECT * FROM unlock_codes`)).rows.length, 0);
});

test('admin: /login?next=/admin lands the owner back on /admin', async () => {
  const h = await harness();
  const b = await h.webSignIn(OWNER, { next: '/admin' });
  assert.equal(b.callback.headers.get('location'), '/admin');
  const page = await b.req(`${AUTH}/admin`);
  assert.equal(page.status, 200);
  assert.match(page.headers.get('x-robots-tag') ?? '', /noindex/);
  assert.match(await page.text(), /Unlock codes/);
});

test('admin: the owner mints codes once, they redeem, and revoke stops the unused ones', async () => {
  const h = await harness();
  const owner = await h.webSignIn(OWNER);
  const res = await post(owner, '/admin/codes', { count: '2', label: 'Beta: Ana', expires: '2026-12-31' });
  assert.equal(res.status, 200);
  const html = await res.text();
  const codes = codesIn(html);
  assert.equal(codes.length, 2, 'both codes shown in the POST response');
  assert.match(html, /\/redeem\?code=ATMT-/);
  const rows = (await h.db.query<{ label: string }>(`SELECT label FROM unlock_codes`)).rows;
  assert.deepEqual(rows.map((r) => r.label), ['Beta: Ana', 'Beta: Ana']);

  // Listing never shows the plain code again.
  const list = await (await owner.req(`${AUTH}/admin`)).text();
  for (const c of codes) assert.ok(!list.includes(c));
  assert.match(list, /<b>2<\/b>unused/);

  const ana = await h.desktopSignIn('ana@example.com');
  assert.equal((await redeemApi(h, ana.access_token, codes[0])).status, 200);

  // Revoke the other by pasting it.
  const rv = await post(owner, '/admin/codes/revoke', { code: codes[1].toLowerCase() });
  assert.equal(rv.status, 303);
  assert.match(rv.headers.get('location') ?? '', /ok=1/);
  const bob = await h.desktopSignIn('bob@example.com');
  assert.equal((await redeemApi(h, bob.access_token, codes[1])).body.error, 'code_invalid');

  const after = await (await owner.req(`${AUTH}/admin`)).text();
  assert.match(after, /used 2026-09-27 by ana@example\.com/);
  assert.match(after, /<b>1<\/b>revoked/);
});

test('admin: revoke from the list by hash; a used code cannot be revoked', async () => {
  const h = await harness();
  const owner = await h.webSignIn(OWNER);
  const [code] = codesIn(await (await post(owner, '/admin/codes', { count: '1' })).text());
  const hash = (await h.db.query<{ code_hash: string }>(`SELECT code_hash FROM unlock_codes`)).rows[0].code_hash;
  const s = await h.desktopSignIn('used@example.com');
  assert.equal((await redeemApi(h, s.access_token, code)).status, 200);
  const rv = await post(owner, '/admin/codes/revoke', { hash });
  assert.doesNotMatch(rv.headers.get('location') ?? '', /ok=1/);
  const row = (await h.db.query<{ revoked_at: Date | null }>(`SELECT revoked_at FROM unlock_codes`)).rows[0];
  assert.equal(row.revoked_at, null);
});

test('admin: forms need our Origin; bad counts and past dates are refused', async () => {
  const h = await harness();
  const owner = await h.webSignIn(OWNER);
  assert.equal((await post(owner, '/admin/codes', { count: '1' }, 'https://evil.example')).status, 403);
  assert.equal((await post(owner, '/admin/codes', { count: '0' })).status, 400);
  assert.equal((await post(owner, '/admin/codes', { count: '501' })).status, 400);
  assert.equal((await post(owner, '/admin/codes', { count: '1', expires: '2020-01-01' })).status, 400);
  assert.equal((await h.db.query(`SELECT * FROM unlock_codes`)).rows.length, 0);
});

test('admin: the owner email via Yahoo, or a session older than 12 h, is sent through Google again', async () => {
  const h = await harness();
  const viaYahoo = await h.webSignIn(OWNER, { provider: 'yahoo', emailVerified: true });
  const y = await viaYahoo.req(`${AUTH}/admin`);
  assert.equal(y.status, 302);
  assert.equal(y.headers.get('location'), '/login/google?next=/admin');
  assert.equal((await post(viaYahoo, '/admin/codes', { count: '1' })).status, 403);

  const owner = await h.webSignIn(OWNER);
  assert.equal((await owner.req(`${AUTH}/admin`)).status, 200);
  h.clock.now += 13 * 3600 * 1000;
  const stale = await owner.req(`${AUTH}/admin`);
  assert.equal(stale.headers.get('location'), '/login/google?next=/admin');
  assert.equal((await owner.req(`${AUTH}/account`)).status, 200, 'the normal account page still works');
});

test('admin: ADMIN_EMAILS replaces the default owner; /admin is not served on the API host', async () => {
  const h = await harness({ ADMIN_EMAILS: 'Boss@Example.com, ops@example.com' });
  assert.equal((await (await h.webSignIn(OWNER)).req(`${AUTH}/admin`)).status, 404);
  assert.equal((await (await h.webSignIn('boss@example.com')).req(`${AUTH}/admin`)).status, 200);
  assert.equal((await h.app.request(`${API}/admin`)).status, 404);
});

test('admin PWA: /admin links an owner-only manifest; nobody else can read it or install anything', async () => {
  const h = await harness();
  const owner = await h.webSignIn(OWNER);
  const page = await (await owner.req(`${AUTH}/admin`)).text();
  assert.match(page, /<link rel="manifest" href="\/admin\/manifest\.webmanifest" crossorigin="use-credentials">/);
  assert.match(page, /apple-mobile-web-app-capable/);
  assert.match((await owner.req(`${AUTH}/admin`)).headers.get('content-security-policy') ?? '', /manifest-src 'self'/);

  const res = await owner.req(`${AUTH}/admin/manifest.webmanifest`);
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'application/manifest+json');
  assert.match(res.headers.get('cache-control') ?? '', /private/);
  const m = (await res.json()) as Record<string, any>;
  assert.deepEqual([m.start_url, m.scope, m.display], ['/admin', '/admin', 'standalone']);
  for (const icon of m.icons) assert.equal((await h.app.request(`${AUTH}${icon.src}`)).status, 200, icon.src);

  assert.equal((await h.browser().req(`${AUTH}/admin/manifest.webmanifest`)).status, 404, 'signed out');
  assert.equal((await (await h.webSignIn('someone@example.com')).req(`${AUTH}/admin/manifest.webmanifest`)).status, 404, 'not the owner');
  const account = await (await owner.req(`${AUTH}/account`)).text();
  assert.doesNotMatch(account, /rel="manifest"/, 'the account page is not installable');
});
