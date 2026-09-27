import test from 'node:test';
import assert from 'node:assert/strict';
import { API, AUTH, REDIRECT, harness } from './harness.js';

const DAY = 86_400_000;

async function startTrial(h: Awaited<ReturnType<typeof harness>>, email: string, fingerprint = `fp-${email}`) {
  const s = await h.desktopSignIn(email);
  const res = await h.app.request(`${API}/v1/billing/checkout`, { method: 'POST', headers: { authorization: `Bearer ${s.access_token}` } });
  const { url } = (await res.json()) as { url: string };
  const accountId = (await h.accountIdFor(email))!;
  const row = await h.licenseRow(accountId);
  const wh = await h.completeTrialCheckout(accountId, row.stripe_customer_id!, fingerprint);
  assert.equal(wh.status, 200);
  return { ...s, accountId, checkoutUrl: url };
}

// ── sign-in ──────────────────────────────────────────────────────────────────

test('desktop sign-in: authorize → Google → code → tokens → license for a new account', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('Jeff@Example.com');
  assert.equal((await s.loginPage.text()).includes('Continue with Google'), true);
  assert.ok(s.access_token && s.refresh_token);
  const l = await h.license(s.access_token);
  assert.equal(l.status, 200);
  assert.equal(l.claims!.status, 'none');
  assert.equal(l.claims!.email, 'jeff@example.com', 'license is bound to the lower-cased email');
  assert.equal(l.claims!.did, 'machine-aaaaaaaa');
  assert.ok(l.claims!.exp, 'an unpaid license is short-lived');
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

// ── trial + one-time purchase ────────────────────────────────────────────────

test('trial checkout saves a card and says plainly what is charged when', async () => {
  const h = await harness();
  const t = await startTrial(h, 'trial@example.com');
  assert.match(t.checkoutUrl, /^https:\/\/checkout\.stripe\.com\//);
  const s = h.stripeLog.sessions.at(-1);
  assert.equal(s.mode, 'setup');
  assert.deepEqual(s.payment_method_types, ['card']);
  assert.match(s.custom_text.submit.message, /Nothing is charged today.*7 days.*\$49\.00 once/);
  const row = await h.licenseRow(t.accountId);
  assert.equal(row.status, 'trialing');
  assert.equal(row.trial_end!.getTime(), h.clock.now + 7 * DAY);
  const l = await h.license(t.access_token);
  assert.equal(l.claims!.status, 'trialing');
  assert.equal(l.claims!.perpetual, undefined);
  assert.ok(l.claims!.exp > l.claims!.trial_end, 'trial token outlives trial_end by a grace period');
});

test('one trial per card: a second account with the same card must pay', async () => {
  const h = await harness();
  await startTrial(h, 'first@example.com', 'fp-shared');
  const t2 = await startTrial(h, 'second@example.com', 'fp-shared');
  const row = await h.licenseRow(t2.accountId);
  assert.equal(row.status, 'payment_required');
  assert.equal(row.failure_reason, 'trial_already_used');
  const l = await h.license(t2.access_token);
  assert.equal(l.claims!.status, 'payment_required');
  const co = await h.app.request(`${API}/v1/billing/checkout`, { method: 'POST', headers: { authorization: `Bearer ${t2.access_token}` } });
  assert.equal(co.status, 200);
  assert.equal(h.stripeLog.sessions.at(-1).mode, 'payment', 'offered a normal purchase instead');
});

test('day 7: the app renewing its license triggers the one-time charge and gets a PERPETUAL license', async () => {
  const h = await harness();
  const t = await startTrial(h, 'convert@example.com');
  h.clock.now += 7 * DAY + 60_000;
  await h.renew(t);
  const l = await h.license(t.access_token);
  const pi = h.stripeLog.paymentIntents.at(-1)!;
  assert.equal(pi.params.off_session, true);
  assert.equal(pi.params.confirm, true);
  assert.equal(pi.params.amount, 4900);
  assert.match(pi.opts.idempotencyKey, /^trial-conversion-/);
  assert.equal(l.claims!.status, 'active');
  assert.equal(l.claims!.perpetual, true);
  assert.equal(l.claims!.exp, undefined, 'a paid license never expires — no further checks needed');
  assert.equal(l.claims!.did, 'machine-aaaaaaaa', 'stamped to this machine');
});

test('the daily cron converts due trials and needs the cron secret', async () => {
  const h = await harness();
  const t = await startTrial(h, 'cron@example.com');
  const cron = (auth?: string) => h.app.request(`${API}/api/cron/charge-trials`, { headers: auth ? { authorization: auth } : {} });
  assert.equal((await cron()).status, 401);
  assert.deepEqual(await (await cron(`Bearer ${h.cfg.cronSecret}`)).json(), { attempted: 0, paid: 0, failed: 0 }, 'nothing due yet');
  h.clock.now += 7 * DAY;
  assert.deepEqual(await (await cron(`Bearer ${h.cfg.cronSecret}`)).json(), { attempted: 1, paid: 1, failed: 0 });
  assert.equal((await h.licenseRow(t.accountId)).status, 'active');
  assert.deepEqual(await (await cron(`Bearer ${h.cfg.cronSecret}`)).json(), { attempted: 0, paid: 0, failed: 0 }, 'never charged twice');
});

test('a day-7 charge that needs 3-D Secure moves to payment_required and blocks', async () => {
  const h = await harness();
  const t = await startTrial(h, 'sca@example.com');
  h.stripeState.nextCharge = 'authentication_required';
  h.clock.now += 7 * DAY;
  await h.renew(t);
  const l = await h.license(t.access_token);
  assert.equal(l.claims!.status, 'payment_required');
  const row = await h.licenseRow(t.accountId);
  assert.equal(row.failure_reason, 'authentication_required');
});

test('a Stripe outage during conversion leaves the trial alone for the next attempt', async () => {
  const h = await harness();
  const t = await startTrial(h, 'outage@example.com');
  h.stripeState.nextCharge = 'network';
  h.clock.now += 7 * DAY;
  await h.renew(t);
  await h.license(t.access_token);
  assert.equal((await h.licenseRow(t.accountId)).status, 'trialing');
  h.stripeState.nextCharge = 'succeed';
  assert.equal((await h.license(t.access_token)).claims!.status, 'active');
});

test('canceling the trial means no charge, ever', async () => {
  const h = await harness();
  const t = await startTrial(h, 'cancel@example.com');
  const web = await h.webSignIn('cancel@example.com');
  const noOrigin = await web.req(`${AUTH}/account/trial/cancel`, { method: 'POST' });
  assert.equal(noOrigin.status, 403, 'CSRF: account forms require our Origin');
  const ok = await web.req(`${AUTH}/account/trial/cancel`, { method: 'POST', headers: { origin: AUTH } });
  assert.equal(ok.status, 303);
  assert.equal((await h.licenseRow(t.accountId)).status, 'canceled');
  h.clock.now += 8 * DAY;
  await h.app.request(`${API}/api/cron/charge-trials`, { headers: { authorization: `Bearer ${h.cfg.cronSecret}` } });
  assert.equal(h.stripeLog.paymentIntents.length, 0);
  // They can still buy later, but not get a second trial.
  await web.req(`${AUTH}/account/trial`, { method: 'POST', headers: { origin: AUTH } });
  assert.equal(h.stripeLog.sessions.at(-1).mode, 'payment');
});

test('buy outright: paid checkout webhook → perpetual license', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('buyer@example.com');
  const web = await h.webSignIn('buyer@example.com');
  const r = await web.req(`${AUTH}/account/buy`, { method: 'POST', headers: { origin: AUTH } });
  assert.match(r.headers.get('location')!, /checkout\.stripe\.com/);
  const sess = h.stripeLog.sessions.at(-1);
  assert.equal(sess.mode, 'payment');
  assert.deepEqual(sess.line_items, [{ price: 'price_lifetime', quantity: 1 }]);
  const accountId = (await h.accountIdFor('buyer@example.com'))!;
  await h.webhook({ id: h.nextEventId(), type: 'checkout.session.completed',
    data: { object: { mode: 'payment', payment_status: 'paid', payment_intent: 'pi_buy', amount_total: 4900, currency: 'usd', metadata: { account_id: accountId, purpose: 'purchase' } } } });
  const l = await h.license(s.access_token);
  assert.equal(l.claims!.status, 'active');
  assert.equal(l.claims!.perpetual, true);
});

test('webhooks: bad signature rejected, duplicates ignored, refund revokes for new activations', async () => {
  const h = await harness();
  const t = await startTrial(h, 'refund@example.com');
  h.clock.now += 7 * DAY;
  await h.renew(t);
  assert.equal((await h.license(t.access_token)).claims!.status, 'active');
  assert.equal((await h.webhook({ id: 'evt_x', type: 'charge.refunded', data: { object: {} } }, 'forged')).status, 400);
  const row = await h.licenseRow(t.accountId);
  const ev = { id: h.nextEventId(), type: 'charge.refunded', data: { object: { refunded: true, customer: row.stripe_customer_id } } };
  assert.equal((await h.webhook(ev)).status, 200);
  assert.equal((await (await h.webhook(ev)).json() as any).duplicate, true);
  assert.equal((await h.licenseRow(t.accountId)).status, 'refunded');
  assert.equal((await h.license(t.access_token)).claims!.status, 'refunded');
});

// ── devices ──────────────────────────────────────────────────────────────────

test('device cap: a new machine past MAX_DEVICES is refused until one is removed', async () => {
  const h = await harness({ MAX_DEVICES: '2' });
  const t = await startTrial(h, 'devices@example.com');
  assert.equal((await h.license(t.access_token, 'machine-1111111')).status, 200);
  assert.equal((await h.license(t.access_token, 'machine-2222222')).status, 200);
  assert.equal((await h.license(t.access_token, 'machine-1111111')).status, 200, 're-stamping a known machine is fine');
  const third = await h.license(t.access_token, 'machine-3333333');
  assert.deepEqual([third.status, third.body.error], [403, 'device_limit']);
  const del = await h.app.request(`${API}/v1/devices/machine-1111111`, { method: 'DELETE', headers: { authorization: `Bearer ${t.access_token}` } });
  assert.equal(del.status, 204);
  assert.equal((await h.license(t.access_token, 'machine-3333333')).status, 200);
});

test('an account without a license does not use up device seats', async () => {
  const h = await harness({ MAX_DEVICES: '1' });
  const s = await h.desktopSignIn('seatless@example.com');
  assert.equal((await h.license(s.access_token, 'machine-1111111')).status, 200);
  assert.equal((await h.license(s.access_token, 'machine-2222222')).status, 200);
});

// ── web ──────────────────────────────────────────────────────────────────────

test('the account page shows the trial end date and the one-time price', async () => {
  const h = await harness();
  await startTrial(h, 'page@example.com');
  const web = await h.webSignIn('page@example.com');
  const res = await web.req(`${AUTH}/account`);
  const body = await res.text();
  assert.equal(res.status, 200);
  assert.match(body, /Free trial/);
  assert.match(body, /\$49\.00/);
  assert.match(body, /Cancel trial/);
  assert.match(res.headers.get('content-security-policy')!, /script-src|default-src 'none'/);
  assert.doesNotMatch(body, /<script/i);
});

test('web funnel: /start sends a signed-out visitor to sign-up, then straight to Checkout', async () => {
  const h = await harness();
  const anon = await h.app.request(`${AUTH}/start?plan=trial`);
  assert.equal(anon.status, 302);
  assert.match(anon.headers.get('location')!, /^\/login\?signup=1&next=%2Fstart%3Fplan%3Dtrial$/);
  const web = await h.webSignIn('funnel@example.com', { next: '/start?plan=trial' });
  assert.equal(web.callback.headers.get('location'), '/start?plan=trial');
  const go = await web.req(`${AUTH}/start?plan=trial`);
  assert.equal(go.status, 303);
  assert.match(go.headers.get('location')!, /checkout\.stripe\.com/);
});

test('open redirects are impossible via ?next=', async () => {
  const h = await harness();
  for (const next of ['//evil.example', 'https://evil.example', '/\\evil.example', '/somewhere-else']) {
    const web = await h.webSignIn(`n${Math.random()}@example.com`, { next });
    assert.equal(web.callback.headers.get('location'), '/account', next);
  }
});

test('hosts are split: api host serves no pages, auth host serves no API', async () => {
  const h = await harness();
  assert.equal((await h.app.request(`${API}/account`)).status, 404);
  assert.equal((await h.app.request(`${AUTH}/v1/licenses`, { method: 'POST' })).status, 404);
  assert.equal((await h.app.request(`${API}/health`)).status, 200);
});
