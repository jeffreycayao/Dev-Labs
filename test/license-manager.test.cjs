'use strict';

// LicenseManager end to end against a fake auth.labs.atmt.dev + api.labs.atmt.dev:
// browser sign-in with PKCE, refresh-token rotation, offline behaviour,
// existing perpetual activations, and sign-out. No network, no electron.

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

/** A fake account backend with just enough state to exercise every path. */
function backend(clock) {
  const s = {
    status: 'free',
    offline: false,
    codes: new Map(),          // code -> challenge
    refresh: new Set(['rt-0']),
    rotations: 0,
    access: new Set(),
    revoked: [],
    released: [],
    failLicenseOnce401: false,
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
        s.exchangeRedirect = form.redirect_uri;
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
        did: s.deviceOverride ?? body.device_id, plan: 'free', status: s.status, iat: now
      };
      // Simulate an old machine-bound paid token alongside current free tokens.
      const claims = s.status === 'active'
        ? { ...base, perpetual: true, paid_at: now }
        : { ...base, exp: now + 86400 };
      return json(200, { license: mint(claims) });
    }
    if (u.pathname.startsWith('/v1/devices/')) { s.released.push(decodeURIComponent(u.pathname.split('/').pop())); return json(204, {}); }
    return json(404, { error: 'not_found' });
  };
  return s;
}

function harness({ enforced = true, keys = { k1: PEM }, stored = {}, machine = 'machine-A', loopback } = {}) {
  const clock = { now: T0 };
  const api = backend(clock);
  const disk = { data: { ...stored } };
  const opened = [];
  const timers = [];
  const m = new LicenseManager({
    ...(loopback ? { listenLoopback: loopback } : {}),
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
  assert.equal(s.purchase, 'free');
  assert.equal(s.email, 'jo@example.com');
  assert.equal(h.m.allowsAgents(), true);
  assert.equal(h.disk.data.refreshToken, 'rt-1');
  assert.ok(h.disk.data.license);
  assert.equal(new URL(h.opened[0]).searchParams.get('screen_hint'), 'signup');
  assert.deepEqual(seen.slice(0, 1), ['signing_in']);
  assert.equal(seen.at(-1), 'licensed');
});

// ── RFC 8252 loopback sign-in ────────────────────────────────────────────────

/** A fake loopback listener: records the callback handler and closes. */
function fakeLoopback(port = 50123) {
  const l = { handler: null, closed: 0, started: 0 };
  l.listen = async (onCallback) => {
    l.started++;
    l.handler = onCallback;
    return { redirectUri: `http://127.0.0.1:${port}/callback`, close: () => { l.closed++; } };
  };
  return l;
}

test('loopback sign-in: authorize + exchange use the 127.0.0.1 redirect, listener closes', async () => {
  const lb = fakeLoopback();
  const h = harness({ loopback: lb.listen });
  h.m.init();
  await h.m.beginSignIn();
  const auth = new URL(h.opened.at(-1));
  assert.equal(auth.searchParams.get('redirect_uri'), 'http://127.0.0.1:50123/callback');
  h.api.codes.set('code-1', auth.searchParams.get('code_challenge'));
  const status = await lb.handler(`http://127.0.0.1:50123/callback?code=code-1&state=${auth.searchParams.get('state')}`);
  assert.equal(status.state, 'licensed');
  assert.equal(h.api.exchangeRedirect, 'http://127.0.0.1:50123/callback', 'the code is redeemed with the URI it was issued for');
  assert.equal(lb.closed, 1);
});

test('loopback listener failing to start falls back to atmtlabs://', async () => {
  const h = harness({ loopback: async () => { throw new Error('EACCES'); } });
  h.m.init();
  assert.equal(await signIn(h), true);
  assert.equal(new URL(h.opened[0]).searchParams.get('redirect_uri'), 'atmtlabs://auth/callback');
  assert.equal(h.api.exchangeRedirect, 'atmtlabs://auth/callback');
  assert.equal(h.m.getStatus().state, 'licensed');
});

test('loopback: a wrong-state request is dropped and the listener stays open', async () => {
  const lb = fakeLoopback();
  const h = harness({ loopback: lb.listen });
  h.m.init();
  await h.m.beginSignIn();
  const status = await lb.handler('http://127.0.0.1:50123/callback?code=x&state=forged');
  assert.equal(status.state, 'signing_in');
  assert.equal(lb.closed, 0);
  assert.equal(h.api.calls.length, 0, 'a forged callback must not reach the token endpoint');
});

test('loopback: cancel, restart and timeout all close the listener', async () => {
  const lb = fakeLoopback();
  const h = harness({ loopback: lb.listen });
  h.m.init();
  await h.m.beginSignIn();
  h.m.cancelSignIn();
  assert.equal(lb.closed, 1);
  await h.m.beginSignIn();
  await h.m.beginSignIn(); // pressing Sign in again replaces the first listener
  assert.equal(lb.closed, 2);
  await h.runTimers(T0 + SIGN_IN_TIMEOUT_MS + 1);
  assert.equal(lb.closed, 3);
  assert.equal(h.m.getStatus().error, 'sign_in_timeout');
});

test('loopback: the old atmtlabs:// link still completes a loopback sign-in only with the right state', async () => {
  const lb = fakeLoopback();
  const h = harness({ loopback: lb.listen });
  h.m.init();
  await h.m.beginSignIn();
  const auth = new URL(h.opened.at(-1));
  h.api.codes.set('code-1', auth.searchParams.get('code_challenge'));
  // The server only ever sends this sign-in's code to the loopback URI; a
  // scheme callback with the right state is still exchanged with that URI.
  await h.m.handleCallback(`atmtlabs://auth/callback?code=code-1&state=${auth.searchParams.get('state')}`);
  assert.equal(h.api.exchangeRedirect, 'http://127.0.0.1:50123/callback');
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
  h.clock.now = T0 + 12 * 3600_000;
  await h.m.tick();
  assert.equal(h.m.getStatus().state, 'licensed');
  h.clock.now = T0 + 25 * 3600_000;
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

test('account page opens without a purchase flow', async () => {
  const h = harness();
  h.m.init();
  await h.m.openAccount();
  assert.equal(h.opened.at(-1), 'https://auth.test/account');
});

test('sign-out removes the computer, revokes the session and forgets it', async () => {
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

test('an existing paid stamp keeps its offline grant until sign-out', async () => {
  const h = harness();
  h.m.init();
  h.api.status = 'active';
  await signIn(h);
  assert.equal(h.m.getStatus().state, 'licensed');
  assert.equal(h.m.allowsAgents(), true);
  assert.equal(h.m.canRefresh(), false);
  h.api.offline = true;
  await h.m.tick();
  assert.equal(h.m.allowsAgents(), true);
  await h.m.signOut();
  assert.equal(h.m.allowsAgents(), false);
});

test('an existing paid stamp on disk works offline without a refresh session', () => {
  const h = harness({ stored: { deviceId: 'machine-A', license: mint({
    iss: 'https://api.test', aud: 'atmt-labs-desktop', sub: 'usr_1',
    did: 'machine-A', plan: 'lifetime', status: 'active', perpetual: true,
    iat: Math.floor(T0 / 1000)
  }) } });
  assert.equal(h.m.init().state, 'licensed');
  assert.equal(h.m.allowsAgents(), true);
  assert.equal(h.m.canRefresh(), false);
});

test('a stored token without a refresh session cannot unlock agents', () => {
  const h = harness({ stored: { deviceId: 'machine-A', license: mint({
    iss: 'https://api.test', aud: 'atmt-labs-desktop', sub: 'usr_1',
    did: 'machine-A', plan: 'free', status: 'free', iat: Math.floor(T0 / 1000),
    exp: Math.floor(T0 / 1000) + 86400
  }) } });
  assert.equal(h.m.init().state, 'signed_out');
  assert.equal(h.m.allowsAgents(), false);
});
