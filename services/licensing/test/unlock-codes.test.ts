import test from 'node:test';
import assert from 'node:assert/strict';
import { API, AUTH, harness } from './harness.js';
import { generateUnlockCode, hashUnlockCode, normalizeUnlockCode } from '../src/codes.js';

const DAY = 86_400_000;
type H = Awaited<ReturnType<typeof harness>>;

async function mint(h: H, opts: { label?: string; expiresAt?: Date } = {}) {
  const code = generateUnlockCode();
  await h.store.createUnlockCodes([hashUnlockCode(normalizeUnlockCode(code)!)], opts.label ?? null, opts.expiresAt ?? null);
  return code;
}

async function redeemApi(h: H, access: string, code: string) {
  const res = await h.app.request(`${API}/v1/redeem`, {
    method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' }, body: JSON.stringify({ code })
  });
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
}

test('codes: 100-bit Crockford format; typing mistakes are forgiven; junk is rejected', () => {
  const c = generateUnlockCode();
  assert.match(c, /^ATMT(-[0-9A-HJKMNP-TV-Z]{5}){4}$/);
  const n = normalizeUnlockCode(c)!;
  assert.equal(normalizeUnlockCode(` ${c.toLowerCase().replace(/-/g, ' ')} `), n, 'case and spaces');
  assert.equal(normalizeUnlockCode(c.slice(5)), n, 'without the ATMT- prefix');
  assert.equal(normalizeUnlockCode('ATMT-0000O-1111I-LLLL1-00000'), '00000111111111100000', 'O→0, I/L→1');
  assert.equal(normalizeUnlockCode('ATMT-ABCDE'), null);
  assert.equal(normalizeUnlockCode('ATMT-UUUUU-UUUUU-UUUUU-UUUUU'), null, 'U is not in the alphabet');
  assert.notEqual(generateUnlockCode(), generateUnlockCode());
});

test('desktop: a code turns an unlicensed account into a PERPETUAL lifetime license, no card', async () => {
  const h = await harness();
  const code = await mint(h, { label: 'Beta: Ana' });
  const s = await h.desktopSignIn('ana@example.com');
  assert.equal((await h.license(s.access_token)).claims!.status, 'none');
  const r = await redeemApi(h, s.access_token, code);
  assert.deepEqual([r.status, r.body.ok], [200, true]);
  const l = await h.license(s.access_token);
  assert.equal(l.claims!.status, 'active');
  assert.equal(l.claims!.perpetual, true);
  assert.equal(l.claims!.exp, undefined, 'stamped forever, like a paid license');
  const row = await h.licenseRow((await h.accountIdFor('ana@example.com'))!);
  assert.deepEqual([row.source, row.amount], ['unlock_code', 0]);
  assert.equal(h.stripeLog.sessions.length + h.stripeLog.paymentIntents.length, 0, 'Stripe never involved');
  // The database never holds the code itself.
  const stored = await h.db.query(`SELECT * FROM unlock_codes`);
  assert.doesNotMatch(JSON.stringify(stored.rows), new RegExp(normalizeUnlockCode(code)!));
});

test('single use: a second account cannot reuse a code, even concurrently', async () => {
  const h = await harness();
  const code = await mint(h);
  const a = await h.desktopSignIn('a@example.com');
  const b = await h.desktopSignIn('b@example.com');
  const [ra, rb] = await Promise.all([redeemApi(h, a.access_token, code), redeemApi(h, b.access_token, code)]);
  const results = [ra, rb].map((r) => r.body.ok === true ? 'ok' : r.body.error).sort();
  assert.deepEqual(results, ['code_used', 'ok']);
  const statuses = await h.db.query(`SELECT status FROM licenses ORDER BY status`);
  assert.deepEqual(statuses.rows.map((r: any) => r.status), ['active', 'none']);
});

test('already licensed: the code is NOT spent, so it can be passed on', async () => {
  const h = await harness();
  const first = await mint(h);
  const second = await mint(h);
  const s = await h.desktopSignIn('twice@example.com');
  assert.equal((await redeemApi(h, s.access_token, first)).status, 200);
  const again = await redeemApi(h, s.access_token, second);
  assert.deepEqual([again.status, again.body.error], [409, 'already_licensed']);
  const other = await h.desktopSignIn('friend@example.com');
  assert.equal((await redeemApi(h, other.access_token, second)).status, 200, 'the unspent code still works for someone else');
});

test('invalid, expired and revoked codes are refused with a clear reason', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('x@example.com');
  assert.deepEqual((await redeemApi(h, s.access_token, 'ATMT-NOT-A-CODE')).body.error, 'code_invalid');
  assert.deepEqual((await redeemApi(h, s.access_token, generateUnlockCode())).body.error, 'code_invalid', 'well-formed but never minted');
  const soon = await mint(h, { expiresAt: new Date(h.clock.now + DAY) });
  h.clock.now += 2 * DAY;
  await h.renew(s);
  assert.deepEqual((await redeemApi(h, s.access_token, soon)).body.error, 'code_expired');
  const voided = await mint(h);
  assert.equal(await h.store.revokeUnlockCode(hashUnlockCode(normalizeUnlockCode(voided)!)), true);
  assert.deepEqual((await redeemApi(h, s.access_token, voided)).body.error, 'code_invalid');
  assert.equal((await h.licenseRow((await h.accountIdFor('x@example.com'))!)).status, 'none');
  const noAuth = await h.app.request(`${API}/v1/redeem`, { method: 'POST', body: '{}' });
  assert.equal(noAuth.status, 401);
});

test('mid-trial: redeeming ends the trial and the day-7 charge never happens', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('trialer@example.com');
  await h.app.request(`${API}/v1/billing/checkout`, { method: 'POST', headers: { authorization: `Bearer ${s.access_token}` } });
  const accountId = (await h.accountIdFor('trialer@example.com'))!;
  await h.completeTrialCheckout(accountId, (await h.licenseRow(accountId)).stripe_customer_id!, 'fp-trialer');
  assert.equal((await h.licenseRow(accountId)).status, 'trialing');
  assert.equal((await redeemApi(h, s.access_token, await mint(h))).status, 200);
  h.clock.now += 8 * DAY;
  await h.app.request(`${API}/api/cron/charge-trials`, { headers: { authorization: `Bearer ${h.cfg.cronSecret}` } });
  await h.renew(s);
  assert.equal((await h.license(s.access_token)).claims!.status, 'active');
  assert.equal(h.stripeLog.paymentIntents.length, 0, 'card never charged');
});

test('payment_required: a pending 3-D Secure charge is cancelled when a code is redeemed', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('sca@example.com');
  const accountId = (await h.accountIdFor('sca@example.com'))!;
  await h.store.updateLicense(accountId, { status: 'payment_required', payment_intent_id: 'pi_waiting_3ds' });
  assert.equal((await redeemApi(h, s.access_token, await mint(h))).status, 200);
  assert.deepEqual(h.stripeLog.cancelled, ['pi_waiting_3ds']);
});

test('a late refund webhook for an OLD charge does not revoke a code-granted license', async () => {
  const h = await harness();
  const s = await h.desktopSignIn('late@example.com');
  const accountId = (await h.accountIdFor('late@example.com'))!;
  await h.store.updateLicense(accountId, { stripe_customer_id: 'cus_old', status: 'canceled' });
  assert.equal((await redeemApi(h, s.access_token, await mint(h))).status, 200);
  await h.webhook({ id: h.nextEventId(), type: 'charge.refunded', data: { object: { refunded: true, customer: 'cus_old' } } });
  assert.equal((await h.licenseRow(accountId)).status, 'active');
});

test('web: /redeem?code= signs in first, pre-fills (never redeems on GET), then the form redeems', async () => {
  const h = await harness();
  const code = await mint(h);
  const anon = h.browser();
  const r0 = await anon.req(`${AUTH}/redeem?code=${code}`);
  assert.equal(r0.status, 302);
  assert.match(decodeURIComponent(r0.headers.get('location')!), new RegExp(`next=/redeem\\?code=${code}`));
  const web = await h.webSignIn('web@example.com');
  const page = await (await web.req(`${AUTH}/redeem?code=${code}`)).text();
  assert.match(page, new RegExp(`value="${code}"`));
  assert.match(page, /<details open>/);
  const accountId = (await h.accountIdFor('web@example.com'))!;
  assert.equal((await h.licenseRow(accountId)).status, 'none', 'GET did not spend the code');
  const form = { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `code=${code}` };
  assert.equal((await web.req(`${AUTH}/account/redeem`, form)).status, 403, 'CSRF: needs our Origin');
  const ok = await web.req(`${AUTH}/account/redeem`, { ...form, headers: { ...form.headers, origin: AUTH } });
  assert.equal(ok.status, 303);
  assert.match(ok.headers.get('location')!, /ok=1/);
  const after = await (await web.req(`${AUTH}${ok.headers.get('location')}`)).text();
  assert.match(after, /Unlocked with a code/);
  assert.match(after, /class="ok"/);
  assert.doesNotMatch(after, /Have an unlock code/, 'no redeem form once licensed');
  assert.doesNotMatch(after, /Receipts/, 'no Stripe receipts for a free license');
});

test('account page offers the redeem form to anyone not yet licensed', async () => {
  const h = await harness();
  const web = await h.webSignIn('new@example.com');
  const body = await (await web.req(`${AUTH}/account`)).text();
  assert.match(body, /Have an unlock code\?/);
  assert.match(body, /action="\/account\/redeem"/);
  const bad = await web.req(`${AUTH}/account/redeem`, {
    method: 'POST', headers: { origin: AUTH, 'content-type': 'application/x-www-form-urlencoded' }, body: 'code=nope'
  });
  assert.match(decodeURIComponent(bad.headers.get('location')!), /isn't valid/);
});
