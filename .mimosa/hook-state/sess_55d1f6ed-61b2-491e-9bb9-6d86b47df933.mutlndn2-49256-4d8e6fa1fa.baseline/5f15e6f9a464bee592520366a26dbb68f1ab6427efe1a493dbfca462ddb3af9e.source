import test from 'node:test';
import assert from 'node:assert/strict';
import { API, AUTH, REDIRECT, harness } from './harness.js';

// ── sign-in ──────────────────────────────────────────────────────────────────

test('desktop sign-in: authorize → Google → code → tokens → license for a new account', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('Jeff@Example.com');
  assert.equal((await s.loginPage.text()).includes('Continue with Google'), true);
  assert.ok(s.access_token && s.refresh_token);
  const l = await h.license(s.access_token);
  assert.equal(l.status, 200);
  assert.equal(l.claims!.status, 'free');
  assert.equal(l.claims!.plan, 'free');
  assert.equal(l.claims!.email, 'jeff@example.com', 'account is bound to the lower-cased email');
  assert.equal(l.claims!.did, 'machine-aaaaaaaa');
  assert.ok(l.claims!.exp, 'free account token expires for renewal');
  // Google got PKCE + Basic client auth; the id_token nonce was checked.
  assert.equal(h.idp.tokenCalls.at(-1)!.auth?.startsWith('Basic '), true);
  assert.match(h.idp.tokenCalls.at(-1)!.body, /code_verifier=/);
});

test('Google and Yahoo with the same email are the same account (license follows the email)', async () => {
  const h = await harness();
  await h.webSignIn('same@example.com', { provider: 'google' });
  const y = await h.webSignIn('SAME@example.com', { provider: 'yahoo' });
  assert.equal(y.callback.status, 302);
  const rows = await h.db.query(`SELECT count(*)::int AS n FROM accounts`);
  assert.equal((rows.rows[0] as any).n, 1);
  // Yahoo does not advertise PKCE here, so none was sent.
  assert.equal(y.idpAuthorizeUrl.searchParams.get('code_challenge'), null);
});

test('an unverified Google email is refused', async () => {
  const h = await harness();
  const r = await h.webSignIn('x@example.com', { emailVerified: false });
  assert.equal(r.callback.status, 400);
  assert.match(await r.callback.text(), /verified email/);
  assert.equal(await h.accountIdFor('x@example.com'), undefined);
});

test('a forged IdP callback state is rejected', async () => {
  const h = await harness();
  const b = h.browser();
  await b.req(`${AUTH}/login/google?next=/account`);
  const res = await b.req(`${AUTH}/login/google/callback?code=zzz&state=forged`);
  assert.equal(res.status, 400);
});

test('authorize never redirects to an unregistered redirect_uri', async () => {
  const h = await harness();
  const res = await h.app.request(`${AUTH}/oauth/authorize?response_type=code&client_id=atmt-labs-desktop&redirect_uri=${encodeURIComponent('https://evil.example/cb')}&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256&state=s`);
  assert.equal(res.status, 400);
  assert.equal(res.headers.get('location'), null);
});

test('loopback sign-in (RFC 8252): any 127.0.0.1 port, plain redirect, code pinned to that exact URI', async () => {
  const h = await harness();
  const LOOP = 'http://127.0.0.1:53682/callback';
  const s = await h.desktopSignIn('loop@example.com', 'google', undefined, LOOP);
  assert.equal(s.continueResponse.status, 302);
  assert.match(s.continueResponse.headers.get('location')!, /^http:\/\/127\.0\.0\.1:53682\/callback\?code=[^&]+&state=st1$/);
  assert.equal(s.tokenStatus, 200);
  assert.equal((await h.license(s.access_token)).status, 200);

  // A code issued for one loopback port cannot be redeemed with another URI.
  const other = await h.desktopSignIn('loop2@example.com', 'google', undefined, 'http://127.0.0.1:40000/callback');
  const res = await h.app.request(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: other.code, code_verifier: other.verifier, redirect_uri: LOOP, client_id: 'atmt-labs-desktop' }).toString()
  });
  assert.equal(res.status, 400);
});

test('only literal 127.0.0.1 loopback redirects on /callback are accepted', async () => {
  const h = await harness();
  for (const bad of [
    'http://localhost:53682/callback',      // name, not the literal IP
    'http://127.0.0.1/callback',            // no port
    'http://127.0.0.1:80/callback',         // privileged port
    'http://127.0.0.1:53682/other',         // wrong path
    'http://127.0.0.1:53682/callback?x=1',  // extra query
    'https://127.0.0.1:53682/callback',
    'http://127.0.0.1.evil.example:53682/callback',
    'http://[::1]:53682/callback'
  ]) {
    const res = await h.app.request(`${AUTH}/oauth/authorize?response_type=code&client_id=atmt-labs-desktop&redirect_uri=${encodeURIComponent(bad)}&code_challenge=${'a'.repeat(43)}&code_challenge_method=S256&state=s`);
    assert.equal(res.status, 400, bad);
    assert.equal(res.headers.get('location'), null, bad);
  }
});

test('authorize errors go back to the loopback redirect the app asked for', async () => {
  const h = await harness();
  const LOOP = 'http://127.0.0.1:53682/callback';
  const res = await h.app.request(`${AUTH}/oauth/authorize?response_type=code&client_id=atmt-labs-desktop&redirect_uri=${encodeURIComponent(LOOP)}&code_challenge=abc&code_challenge_method=plain&state=s`);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('location'), `${LOOP}?error=invalid_request&state=s`);
});

test('authorize requires S256 PKCE', async () => {
  const h = await harness();
  const res = await h.app.request(`${AUTH}/oauth/authorize?response_type=code&client_id=atmt-labs-desktop&redirect_uri=${encodeURIComponent(REDIRECT)}&code_challenge=abc&code_challenge_method=plain&state=s`);
  assert.equal(res.status, 302);
  assert.match(res.headers.get('location')!, /^atmtlabs:\/\/auth\/callback\?error=invalid_request&state=s$/);
});

test('code: wrong verifier and replay are invalid_grant', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('pkce@example.com');
  const post = (verifier: string) => h.app.request(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code: s.code, code_verifier: verifier, redirect_uri: REDIRECT, client_id: 'atmt-labs-desktop' }).toString()
  });
  const wrong = await h.desktopSignIn('pkce2@example.com', 'google', 'x'.repeat(43));
  assert.equal(wrong.tokenStatus, 400, 'a code redeemed with the wrong PKCE verifier is refused');
  assert.equal((wrong as any).error, 'invalid_grant');
  const replay = await post(s.verifier);
  assert.equal(replay.status, 400);
  assert.deepEqual(await replay.json(), { error: 'invalid_grant' });
});

test('refresh tokens rotate; replaying a spent one revokes the whole family', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('rot@example.com');
  const refresh = (rt: string) => h.app.request(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: rt, client_id: 'atmt-labs-desktop' }).toString()
  });
  const r1 = await refresh(s.refresh_token);
  const t1 = (await r1.json()) as { refresh_token: string };
  assert.equal(r1.status, 200);
  assert.notEqual(t1.refresh_token, s.refresh_token);
  assert.equal((await refresh(s.refresh_token)).status, 400, 'old token is spent');
  assert.equal((await refresh(t1.refresh_token)).status, 400, 'reuse revoked the family, so the newest token died too');
});

test('revoke kills the session server side', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('rev@example.com');
  await h.app.request(`${AUTH}/oauth/revoke`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ token: s.refresh_token, client_id: 'atmt-labs-desktop' }).toString()
  });
  const r = await h.app.request(`${AUTH}/oauth/token`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: 'atmt-labs-desktop' }).toString()
  });
  assert.equal(r.status, 400);
});

test('bad or missing access token → 401', async () => {
  const h = await harness();
  const r = await h.license('not-a-token');
  assert.equal(r.status, 401);
});

// ── free access and retired purchase paths ────────────────────────────────

test('every signed-in account gets free access regardless of old purchase state', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('free@example.com');
  const id = (await h.accountIdFor('free@example.com'))!;
  await h.store.updateLicense(id, { status: 'payment_required' });
  const l = await h.license(s.access_token);
  assert.equal(l.status, 200);
  assert.equal(l.claims!.status, 'free');
  assert.equal(l.claims!.plan, 'free');
  assert.equal(l.claims!.perpetual, undefined);
  assert.ok(l.claims!.exp);
});

test('free account token renews after the old purchase status changes', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('renew@example.com');
  await h.license(s.access_token);
  const id = (await h.accountIdFor('renew@example.com'))!;
  await h.store.updateLicense(id, { status: 'refunded' });
  await h.renew(s);
  assert.equal((await h.license(s.access_token)).claims!.status, 'free');
});

test('checkout, redemption and scheduled charges are retired', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('retired@example.com');
  const headers = { authorization: `Bearer ${s.access_token}` };
  for (const path of ['/v1/billing/checkout', '/v1/billing/portal', '/v1/redeem']) {
    const r = await h.app.request(`${API}${path}`, { method: 'POST', headers });
    assert.equal(r.status, 410, path);
  }
  assert.equal((await h.app.request(`${API}/api/cron/charge-trials`)).status, 410);
});

test('account page shows free access and no payment action', async () => {
  const h = await harness();
  const b = await h.webSignIn('webfree@example.com');
  const page = await (await b.req(`${AUTH}/account`)).text();
  assert.match(page, /Free account/);
  assert.doesNotMatch(page, /Checkout|Buy lifetime|Start.*trial|Redeem code/);
  assert.equal((await b.req(`${AUTH}/start?plan=buy`)).headers.get('location'), '/account');
  assert.equal((await b.req(`${AUTH}/admin`)).status, 404);
});
