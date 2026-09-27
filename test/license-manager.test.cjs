'use strict';

// LicenseManager end to end against a fake auth.labs.atmt.dev + api.labs.atmt.dev:
// browser sign-in with PKCE, refresh-token rotation, offline behaviour, Stripe
// checkout/portal hand-off, and sign-out. No network, no electron.

const test = require('node:test');
const assert = require('node:assert/strict');
const { generateKeyPairSync, sign, createHash } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

const { LicenseManager, SIGN_IN_TIMEOUT_MS } = loadTs('src/main/licenseManager.ts');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const T0 = Date.UTC(2026, 8, 27, 12, 0, 0);
const b64u = (b) => Buffer.from(b).toString('base64url');

function mint(claims) {
  const h = b64u(JSON.stringify({ alg: 'EdDSA', kid: 'k1', typ: 'JWT' }));
  const p = b64u(JSON.stringify(claims));
  return `${h}.${p}.${b64u(sign(null, Buffer.from(`${h}.${p}`), privateKey))}`;
}

/** A fake licensing backend with just enough state to exercise every path. */
function backend(clock) {
  const s = {
    status: 'trialing',
    offline: false,
    codes: new Map(),          // code -> challenge
    refresh: new Set(['rt-0']),
    rotations: 0,
    access: new Set(),
    revoked: [],
    released: [],
    failLicenseOnce401: false,
    billingUrl: 'https://checkout.stripe.com/c/pay/cs_test_1',
    deviceOverride: null,
    calls: []
  };
  const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
  const issue = () => {
    s.rotations++;
    const rt = `rt-${s.rotations}`;
    const at = `at-${s.rotations}`;
    s.refresh.add(rt);
    s.access.add(at);
    return json(200, { access_token: at, refresh_token: rt, expires_in: 900, token_type: 'Bearer' });
  };
  s.fetch = async (url, init = {}) => {
    s.calls.push(`${init.method ?? 'GET'} ${url}`);
    if (s.offline) throw new TypeError('fetch failed');
    const u = new URL(url);
    const form = init.body && init.headers?.['content-type']?.includes('urlencoded')
      ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    const authz = init.headers?.authorization?.replace(/^Bearer /, '');
    if (u.href === 'https://auth.test/oauth/token') {
      if (form.grant_type === 'authorization_code') {
        const challenge = s.codes.get(form.code);
        s.codes.delete(form.code);
        const ok = challenge && createHash('sha256').update(form.code_verifier).digest('base64url') === challenge;
        return ok ? issue() : json(400, { error: 'invalid_grant' });
      }
      if (form.grant_type === 'refresh_token') {
        if (!s.refresh.has(form.refresh_token)) return json(400, { error: 'invalid_grant' });
        s.refresh.delete(form.refresh_token); // rotation: old token is single-use
        return issue();
      }
    }
    if (u.href === 'https://auth.test/oauth/revoke') { s.revoked.push(form.token); s.refresh.delete(form.token); return json(200, {}); }
    if (!s.access.has(authz)) return json(401, { error: 'invalid_token' });
    if (u.href === 'https://api.test/v1/licenses') {
      if (s.failLicenseOnce401) { s.failLicenseOnce401 = false; s.access.delete(authz); return json(401, {}); }
      const body = JSON.parse(init.body);
      const now = Math.floor(clock.now / 1000);
      const base = {
        iss: 'https://api.test', aud: 'atmt-labs-desktop', sub: 'usr_1', email: 'jo@example.com',
        did: s.deviceOverride ?? body.device_id, plan: 'lifetime', status: s.status, iat: now
      };
      // Mirrors services/licensing/src/tokens.ts: paid = perpetual, no exp.
      const claims = s.status === 'active'
        ? { ...base, perpetual: true, paid_at: now }
        : { ...base, exp: now + 7 * 86400, trial_end: now + 7 * 86400 };
      return json(200, { license: mint(claims) });
    }
    if (u.pathname.startsWith('/v1/devices/')) { s.released.push(decodeURIComponent(u.pathname.split('/').pop())); return json(204, {}); }
    if (u.href === 'https://api.test/v1/billing/checkout' || u.href === 'https://api.test/v1/billing/portal') {
      return json(200, { url: s.billingUrl });
    }
    return json(404, { error: 'not_found' });
  };
  return s;
}

function harness({ enforced = true, keys = { k1: PEM }, stored = {}, machine = 'machine-A' } = {}) {
  const clock = { now: T0 };
  const api = backend(clock);
  const disk = { data: { ...stored } };
  const opened = [];
  const timers = [];
  const m = new LicenseManager({
    enforced,
    endpoints: {
      siteOrigin: 'https://site.test', authOrigin: 'https://auth.test', apiOrigin: 'https://api.test',
      clientId: 'atmt-labs-desktop', redirectUri: 'atmtlabs://auth/callback'
    },
    verify: { issuer: 'https://api.test', audience: 'atmt-labs-desktop', publicKeys: keys },
    store: { load: () => ({ ...disk.data }), save: (d) => { disk.data = { ...d }; } },
    fetch: api.fetch,
    openExternal: (u) => { opened.push(u); },
    device: { deviceName: 'box', platform: 'linux', appVersion: '1.0.0' },
    machineId: () => machine,
    newDeviceId: () => 'random-fallback',
    now: () => clock.now,
    setTimer: (fn, ms) => { const t = { fn, at: clock.now + ms, live: true, cancel() { t.live = false; } }; timers.push(t); return t; }
  });
  const runTimers = async (untilMs) => {
    clock.now = untilMs;
    for (const t of timers.filter((x) => x.live && x.at <= untilMs)) { t.live = false; await t.fn(); }
  };
  return { m, api, disk, opened, clock, timers, runTimers };
}

/** Walk the browser half of the flow the way auth.labs.atmt.dev would. */
async function signIn(h, hint) {
  await h.m.beginSignIn(hint);
  const auth = new URL(h.opened.at(-1));
  h.api.codes.set('code-1', auth.searchParams.get('code_challenge'));
  return h.m.handleCallback(`atmtlabs://auth/callback?code=code-1&state=${auth.searchParams.get('state')}`);
}

test('gate off: disabled, allows agents, never touches the network', async () => {
  const h = harness({ enforced: false });
  assert.equal(h.m.init().state, 'disabled');
  assert.equal(h.m.allowsAgents(), true);
  await h.m.refresh();
  await h.m.tick();
  assert.deepEqual(h.api.calls, []);
});

test('gate on without a public key is an error that blocks, not an open door', () => {
  const h = harness({ keys: {} });
  const s = h.m.init();
  assert.deepEqual([s.state, s.error], ['error', 'misconfigured']);
  assert.equal(h.m.allowsAgents(), false);
});

test('fresh install: signed out, device id minted, agents blocked', () => {
  const h = harness();
  assert.equal(h.m.init().state, 'signed_out');
  assert.equal(h.disk.data.deviceId, 'machine-A', 'device id comes from the hardware');
  assert.equal(h.m.allowsAgents(), false);
});

test('browser sign-in with PKCE ends licensed with the refresh token persisted', async () => {
  const h = harness();
  h.m.init();
  const seen = [];
  h.m.onChange((s) => seen.push(s.state));
  assert.equal(await signIn(h, 'signup'), true);
  const s = h.m.getStatus();
  assert.equal(s.state, 'licensed');
  assert.equal(s.purchase, 'trialing');
  assert.equal(s.email, 'jo@example.com');
  assert.equal(h.m.allowsAgents(), true);
  assert.equal(h.disk.data.refreshToken, 'rt-1');
  assert.ok(h.disk.data.license);
  assert.equal(new URL(h.opened[0]).searchParams.get('screen_hint'), 'signup');
  assert.deepEqual(seen.slice(0, 1), ['signing_in']);
  assert.equal(seen.at(-1), 'licensed');
});

test('a callback with the wrong state is dropped and the sign-in keeps waiting', async () => {
  const h = harness();
  h.m.init();
  await h.m.beginSignIn();
  assert.equal(await h.m.handleCallback('atmtlabs://auth/callback?code=x&state=forged'), true);
  assert.equal(h.m.getStatus().state, 'signing_in');
  assert.equal(h.api.calls.length, 0, 'a forged callback must not reach the token endpoint');
});

test('an unsolicited callback while signed out is reported, not exchanged', async () => {
  const h = harness();
  h.m.init();
  await h.m.handleCallback('atmtlabs://auth/callback?code=x&state=y');
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['signed_out', 'state_mismatch']);
  assert.equal(h.api.calls.length, 0);
});

test('a hire link is not the manager\'s', async () => {
  const h = harness();
  h.m.init();
  assert.equal(await h.m.handleCallback('atmtlabs://hire?url=https://x'), false);
});

test('user cancels on the consent screen', async () => {
  const h = harness();
  h.m.init();
  await h.m.beginSignIn();
  const state = new URL(h.opened[0]).searchParams.get('state');
  await h.m.handleCallback(`atmtlabs://auth/callback?error=access_denied&state=${state}`);
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['signed_out', 'sign_in_cancelled']);
});

test('an abandoned browser sign-in times out', async () => {
  const h = harness();
  h.m.init();
  await h.m.beginSignIn();
  await h.runTimers(T0 + SIGN_IN_TIMEOUT_MS + 1);
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['signed_out', 'sign_in_timeout']);
});

test('refresh rotates the refresh token every time', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  await h.m.refresh();
  assert.equal(h.disk.data.refreshToken, 'rt-2');
  assert.equal(h.api.refresh.has('rt-1'), false, 'the old refresh token is spent');
  assert.equal(h.m.getStatus().state, 'licensed');
});

test('concurrent refreshes share one round trip (no double rotation)', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  const before = h.api.rotations;
  await Promise.all([h.m.refresh(), h.m.refresh(), h.m.refresh()]);
  assert.equal(h.api.rotations, before + 1);
});

test('a revoked session signs the user out and forgets the tokens', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  h.api.refresh.clear();
  await h.m.refresh();
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['signed_out', 'session_expired']);
  assert.equal(h.disk.data.refreshToken, undefined);
  assert.equal(h.disk.data.license, undefined);
  assert.equal(h.disk.data.deviceId, 'machine-A', 'the device id survives sign-out');
});

test('offline with a valid license stays licensed; offline past expiry blocks', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  h.api.offline = true;
  h.clock.now = T0 + 5 * 86400_000;
  await h.m.tick();
  assert.equal(h.m.getStatus().state, 'licensed');
  h.clock.now = T0 + 8 * 86400_000;
  await h.m.tick();
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['offline_expired', 'network']);
  assert.equal(h.m.allowsAgents(), false);
  h.api.offline = false;
  await h.m.tick();
  assert.equal(h.m.getStatus().state, 'licensed', 'back online renews');
});

test('a canceled trial shows as inactive and blocks', async () => {
  const h = harness();
  h.m.init();
  h.api.status = 'canceled';
  await signIn(h);
  assert.equal(h.m.getStatus().state, 'inactive');
  assert.equal(h.m.allowsAgents(), false);
});

test('a license minted for another device is refused', async () => {
  const h = harness();
  h.m.init();
  h.api.deviceOverride = 'dev-OTHER';
  await signIn(h);
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().error], ['error', 'device_mismatch']);
  assert.equal(h.m.allowsAgents(), false);
});

test('an expired access token is refreshed and the call retried once', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  h.api.failLicenseOnce401 = true;
  h.clock.now = T0 + 4 * 86400_000;
  await h.m.tick();
  assert.equal(h.m.getStatus().state, 'licensed');
});

test('a restart reads the stored license offline, then renews', async () => {
  const first = harness();
  first.m.init();
  await signIn(first);
  const h = harness({ stored: first.disk.data });
  h.api.refresh.add(first.disk.data.refreshToken);
  h.api.offline = true;
  assert.equal(h.m.init().state, 'licensed', 'no network needed to open the app');
  h.api.offline = false;
  assert.equal(h.m.canRefresh(), true);
  await h.m.refresh();
  assert.equal(h.m.getStatus().state, 'licensed');
});

test('a tampered stored license is dropped', () => {
  const first = harness();
  const bad = { deviceId: 'machine-A', license: 'eyJhbGciOiJFZERTQSIsImtpZCI6ImsxIn0.e30.AAAA' };
  const h = harness({ stored: bad });
  const s = h.m.init();
  assert.deepEqual([s.state, s.error], ['signed_out', 'invalid_token']);
  assert.equal(h.disk.data.license, undefined);
  void first;
});

test('start trial opens Stripe Checkout, then polls until the webhook lands', async () => {
  const h = harness();
  h.m.init();
  h.api.status = 'none';
  await signIn(h);
  assert.equal(h.m.getStatus().state, 'inactive');
  const r = await h.m.openBilling('checkout');
  assert.equal(r.ok, true);
  assert.equal(h.opened.at(-1), 'https://checkout.stripe.com/c/pay/cs_test_1');
  // Webhook arrives; the next poll tick picks it up.
  h.api.status = 'trialing';
  await h.runTimers(h.clock.now + 10_000);
  assert.equal(h.m.getStatus().state, 'licensed');
});

test('billing falls back to the public page when signed out or the URL is not allowed', async () => {
  const h = harness();
  h.m.init();
  await h.m.openBilling('checkout');
  assert.equal(h.opened.at(-1), 'https://site.test/pricing');
  await signIn(h);
  h.api.billingUrl = 'https://evil.example/phish';
  await h.m.openBilling('portal');
  assert.equal(h.opened.at(-1), 'https://auth.test/account');
});

test('sign-out frees the device seat, revokes the session and forgets it', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  const s = await h.m.signOut();
  assert.equal(s.state, 'signed_out');
  assert.deepEqual(h.api.released, ['machine-A']);
  assert.equal(h.api.revoked.length, 1);
  assert.equal(h.disk.data.refreshToken, undefined);
  assert.equal(h.m.allowsAgents(), false);
});

test('sign-out works offline', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  h.api.offline = true;
  assert.equal((await h.m.signOut()).state, 'signed_out');
});

// ── lifetime license: stamped to the machine, never checked again ────────────

async function buyLifetime(h) {
  h.m.init();
  h.api.status = 'active';
  await signIn(h);
  assert.equal(h.m.getStatus().state, 'licensed');
  assert.equal(h.m.getStatus().perpetual, true);
}

test('a paid machine is stamped: no network on restart, on tick, or on refresh — even years later', async () => {
  const first = harness();
  await buyLifetime(first);
  const h = harness({ stored: first.disk.data });
  h.api.offline = true; // would throw if anything tried the network
  assert.equal(h.m.init().state, 'licensed');
  assert.equal(h.m.canRefresh(), false);
  h.clock.now = T0 + 5 * 365 * 86400_000;
  await h.m.tick();
  await h.m.refresh();
  assert.equal(h.m.getStatus().state, 'licensed');
  assert.deepEqual(h.api.calls, [], 'zero calls to the licensing server');
  assert.equal(h.m.allowsAgents(), true);
});

test('the stamp does not travel: the same license file on another computer is not licensed', async () => {
  const first = harness();
  await buyLifetime(first);
  const other = harness({ stored: first.disk.data, machine: 'machine-B' });
  const s = other.m.init();
  assert.deepEqual([s.state, s.error], ['signed_out', 'device_mismatch']);
  assert.equal(other.m.allowsAgents(), false);
});

test('when the OS will not give a machine id, a random per-install id is used and kept', () => {
  const h = harness({ machine: '' });
  h.m.init();
  assert.equal(h.disk.data.deviceId, 'random-fallback');
});

test('a trial that converts on day 7 becomes a stamped lifetime license', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  assert.equal(h.m.getStatus().purchase, 'trialing');
  h.api.status = 'active';
  h.clock.now = T0 + 7 * 86400_000 + 1000;
  await h.m.tick();
  assert.equal(h.m.getStatus().perpetual, true);
  const calls = h.api.calls.length;
  h.clock.now += 400 * 86400_000;
  await h.m.tick();
  assert.equal(h.api.calls.length, calls, 'no more calls once stamped');
});

test('a failed day-7 payment shows payment_required and blocks', async () => {
  const h = harness();
  h.m.init();
  await signIn(h);
  h.api.status = 'payment_required';
  h.clock.now = T0 + 7 * 86400_000 + 1000;
  await h.m.tick();
  assert.deepEqual([h.m.getStatus().state, h.m.getStatus().purchase], ['inactive', 'payment_required']);
  assert.equal(h.m.allowsAgents(), false);
});
