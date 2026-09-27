'use strict';

// Licensing core: PKCE, the auth callback deep link, offline verification of
// EdDSA license tokens, the entitlement decision, and the brand config guard.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { generateKeyPairSync, sign } = require('node:crypto');
const loadTs = require('./load-ts.cjs');

const core = loadTs('src/main/licenseCore.ts');
const lic = loadTs('src/shared/license.ts');
const brand = loadTs('src/shared/brand.ts');

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const PEM = publicKey.export({ type: 'spki', format: 'pem' });
const CFG = { issuer: 'https://api.labs.atmt.dev', audience: 'atmt-labs-desktop', publicKeys: { k1: PEM } };
const NOW = Date.UTC(2026, 8, 27, 12, 0, 0);
const SEC = Math.floor(NOW / 1000);

const b64 = (s) => core.b64url(Buffer.from(s));
function mint(claims, { kid = 'k1', key = privateKey, alg = 'EdDSA' } = {}) {
  const h = b64(JSON.stringify({ alg, kid, typ: 'JWT' }));
  const p = b64(JSON.stringify(claims));
  const s = core.b64url(sign(null, Buffer.from(`${h}.${p}`), key));
  return `${h}.${p}.${s}`;
}
function claims(over = {}) {
  return {
    iss: CFG.issuer, aud: CFG.audience, sub: 'usr_1', email: 'a@b.c', did: 'dev-1',
    plan: 'pro', status: 'trialing', iat: SEC, exp: SEC + 7 * 86400, trial_end: SEC + 7 * 86400,
    ...over
  };
}

// ── PKCE ─────────────────────────────────────────────────────────────────────

test('S256 challenge matches the RFC 7636 appendix B vector', () => {
  assert.equal(core.pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'),
    'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM');
});

test('createPkce makes a 43-char verifier whose challenge verifies', () => {
  const { verifier, challenge } = core.createPkce();
  assert.match(verifier, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(core.pkceChallenge(verifier), challenge);
  assert.notEqual(core.createPkce().verifier, verifier);
});

test('authorize URL carries PKCE, state and the registered redirect', () => {
  const u = new URL(core.buildAuthorizeUrl({
    authOrigin: 'https://auth.labs.atmt.dev', apiOrigin: 'x', clientId: 'atmt-labs-desktop',
    redirectUri: 'atmtlabs://auth/callback'
  }, { challenge: 'abc', state: 'st', screenHint: 'signup' }));
  assert.equal(u.origin + u.pathname, 'https://auth.labs.atmt.dev/oauth/authorize');
  assert.equal(u.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(u.searchParams.get('code_challenge'), 'abc');
  assert.equal(u.searchParams.get('state'), 'st');
  assert.equal(u.searchParams.get('redirect_uri'), 'atmtlabs://auth/callback');
  assert.equal(u.searchParams.get('response_type'), 'code');
  assert.equal(u.searchParams.get('screen_hint'), 'signup');
});

// ── callback deep link ───────────────────────────────────────────────────────

test('auth callback is told apart from a hire link', () => {
  const R = 'atmtlabs://auth/callback';
  assert.equal(core.isAuthCallback('atmtlabs://auth/callback?code=c&state=s', R), true);
  assert.equal(core.isAuthCallback('atmtlabs://auth/callback/?code=c&state=s', R), true);
  assert.equal(core.isAuthCallback('atmtlabs://hire?url=https://x', R), false);
  assert.equal(core.isAuthCallback('atmtlabs://auth/callbackX?code=c', R), false);
  assert.equal(core.isAuthCallback('https://auth/callback?code=c', R), false);
  assert.equal(core.isAuthCallback('not a url', R), false);
});

test('callback parsing: code, OAuth error, and a missing state', () => {
  const R = 'atmtlabs://auth/callback';
  assert.deepEqual(core.parseAuthCallback(`${R}?code=c1&state=s1`, R), { kind: 'code', code: 'c1', state: 's1' });
  assert.deepEqual(core.parseAuthCallback(`${R}?error=access_denied&state=s1`, R),
    { kind: 'error', error: 'access_denied', state: 's1' });
  assert.equal(core.parseAuthCallback(`${R}?code=c1`, R).kind, 'error');
  assert.equal(core.parseAuthCallback('atmtlabs://hire?x=1', R), null);
});

// ── token verification ───────────────────────────────────────────────────────

test('a well-formed token verifies and returns its claims', () => {
  const v = core.verifyLicenseToken(mint(claims()), CFG, NOW);
  assert.equal(v.ok, true);
  assert.equal(v.claims.plan, 'pro');
});

test('an expired token still verifies (expiry is a policy decision, not a forgery)', () => {
  const v = core.verifyLicenseToken(mint(claims({ iat: SEC - 10 * 86400, exp: SEC - 86400 })), CFG, NOW);
  assert.equal(v.ok, true);
});

test('tampering, wrong key, wrong alg and unknown kid are all rejected', () => {
  const good = mint(claims());
  const [h, , s] = good.split('.');
  const forgedPayload = b64(JSON.stringify(claims({ status: 'active', plan: 'enterprise' })));
  assert.equal(core.verifyLicenseToken(`${h}.${forgedPayload}.${s}`, CFG, NOW).reason, 'bad_signature');

  const other = generateKeyPairSync('ed25519').privateKey;
  assert.equal(core.verifyLicenseToken(mint(claims(), { key: other }), CFG, NOW).reason, 'bad_signature');
  assert.equal(core.verifyLicenseToken(mint(claims(), { alg: 'none' }), CFG, NOW).reason, 'bad_alg');
  assert.equal(core.verifyLicenseToken(mint(claims(), { alg: 'HS256' }), CFG, NOW).reason, 'bad_alg');
  assert.equal(core.verifyLicenseToken(mint(claims(), { kid: 'k9' }), CFG, NOW).reason, 'unknown_kid');
  assert.equal(core.verifyLicenseToken(mint(claims(), { kid: '__proto__' }), CFG, NOW).reason, 'unknown_kid');
  assert.equal(core.verifyLicenseToken('a.b', CFG, NOW).reason, 'malformed');
  assert.equal(core.verifyLicenseToken('!!.??.**', CFG, NOW).reason, 'malformed');
});

test('issuer, audience, required claims and future iat are enforced', () => {
  assert.equal(core.verifyLicenseToken(mint(claims({ iss: 'https://evil' })), CFG, NOW).reason, 'bad_issuer');
  assert.equal(core.verifyLicenseToken(mint(claims({ aud: 'other' })), CFG, NOW).reason, 'bad_audience');
  assert.equal(core.verifyLicenseToken(mint(claims({ aud: ['x', CFG.audience] })), CFG, NOW).ok, true);
  assert.equal(core.verifyLicenseToken(mint(claims({ did: undefined })), CFG, NOW).reason, 'bad_claims');
  assert.equal(core.verifyLicenseToken(mint(claims({ exp: SEC - 1 })), CFG, NOW).reason, 'bad_claims');
  assert.equal(core.verifyLicenseToken(mint(claims({ features: [1] })), CFG, NOW).reason, 'bad_claims');
  assert.equal(core.verifyLicenseToken(mint(claims({ iat: SEC + 3600, exp: SEC + 9000 })), CFG, NOW).reason, 'not_yet_valid');
  // Within the 5-minute skew allowance is fine.
  assert.equal(core.verifyLicenseToken(mint(claims({ iat: SEC + 60 })), CFG, NOW).ok, true);
});

test('a non-Ed25519 public key configured under a kid is refused', () => {
  const rsa = generateKeyPairSync('rsa', { modulusLength: 2048 }).publicKey.export({ type: 'spki', format: 'pem' });
  const v = core.verifyLicenseToken(mint(claims(), { kid: 'r' }), { ...CFG, publicKeys: { r: rsa } }, NOW);
  assert.equal(v.reason, 'bad_key');
});

// ── entitlement decision ─────────────────────────────────────────────────────

test('trialing, active and past_due unlock; everything else does not', () => {
  for (const s of ['trialing', 'active', 'past_due']) {
    assert.equal(lic.evaluateClaims(claims({ status: s }), { now: NOW, deviceId: 'dev-1' }).state, 'licensed', s);
  }
  for (const s of ['canceled', 'unpaid', 'incomplete', 'incomplete_expired', 'paused', 'none']) {
    assert.equal(lic.evaluateClaims(claims({ status: s }), { now: NOW, deviceId: 'dev-1' }).state, 'inactive', s);
  }
});

test('expired token, other device and a rolled-back clock each block', () => {
  const expired = claims({ iat: SEC - 10 * 86400, exp: SEC - 1 });
  assert.equal(lic.evaluateClaims(expired, { now: NOW, deviceId: 'dev-1' }).state, 'offline_expired');
  const other = lic.evaluateClaims(claims(), { now: NOW, deviceId: 'dev-2' });
  assert.deepEqual([other.state, other.error], ['signed_out', 'device_mismatch']);
  const rolled = lic.evaluateClaims(claims(), { now: NOW, deviceId: 'dev-1', lastSeenAt: NOW + 2 * 3600_000 });
  assert.deepEqual([rolled.state, rolled.error], ['offline_expired', 'clock_rollback']);
  // Small drift is not rollback.
  assert.equal(lic.evaluateClaims(claims(), { now: NOW, deviceId: 'dev-1', lastSeenAt: NOW + 60_000 }).state, 'licensed');
});

test('status carries trial/period dates in milliseconds for the UI', () => {
  const s = lic.evaluateClaims(claims({ period_end: SEC + 30 * 86400 }), { now: NOW, deviceId: 'dev-1' });
  assert.equal(s.trialEndsAt, (SEC + 7 * 86400) * 1000);
  assert.equal(s.periodEndsAt, (SEC + 30 * 86400) * 1000);
  assert.equal(lic.daysUntil(s.trialEndsAt, NOW), 7);
  assert.equal(lic.daysUntil(NOW - 1, NOW), 0);
});

test('renewal starts at half-life', () => {
  const c = { iat: SEC, exp: SEC + 7 * 86400 };
  assert.equal(lic.shouldRefresh(c, NOW + 3 * 86400_000), false);
  assert.equal(lic.shouldRefresh(c, NOW + 4 * 86400_000), true);
});

test('a disabled gate always allows agents; an enforced one only when licensed', () => {
  assert.equal(lic.statusAllowsAgents({ enforced: false, state: 'disabled' }), true);
  assert.equal(lic.statusAllowsAgents({ enforced: true, state: 'licensed' }), true);
  for (const state of ['signed_out', 'signing_in', 'inactive', 'offline_expired', 'error']) {
    assert.equal(lic.statusAllowsAgents({ enforced: true, state }), false, state);
  }
});

// ── billing URL allowlist ────────────────────────────────────────────────────

test('only Stripe and our own https origins may be opened from an API response', () => {
  assert.equal(core.isAllowedBillingUrl('https://checkout.stripe.com/c/pay/cs_test_1'), true);
  assert.equal(core.isAllowedBillingUrl('https://billing.stripe.com/p/session/x'), true);
  assert.equal(core.isAllowedBillingUrl('https://labs.atmt.dev/welcome'), true);
  assert.equal(core.isAllowedBillingUrl('http://checkout.stripe.com/x'), false);
  assert.equal(core.isAllowedBillingUrl('https://evil.com/?checkout.stripe.com'), false);
  assert.equal(core.isAllowedBillingUrl('https://atmt.dev.evil.com/'), false);
  assert.equal(core.isAllowedBillingUrl('file:///etc/passwd'), false);
});

// ── brand config guard ───────────────────────────────────────────────────────

test('LICENSING config is consistent with the packaged protocol and never ships a keyless gate', () => {
  const L = brand.LICENSING;
  if (L.enabled) {
    assert.ok(Object.keys(L.publicKeys).length > 0,
      'LICENSING.enabled with no publicKeys would block every user from starting agents');
  }
  for (const k of ['siteOrigin', 'authOrigin', 'apiOrigin', 'issuer']) {
    assert.match(L[k], /^https:\/\/[a-z0-9.-]+$/, `${k} must be a bare https origin`);
  }
  assert.equal(L.redirectUri, `${brand.PROTOCOL}://auth/callback`);
  const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');
  assert.match(yml, new RegExp(`schemes:\\s*\\n\\s*-\\s*${brand.PROTOCOL}\\b`), 'redirect scheme must be registered by the installer');
  for (const [kid, pem] of Object.entries(L.publicKeys)) {
    assert.match(pem, /BEGIN PUBLIC KEY/, `publicKeys.${kid} must be an SPKI PEM`);
  }
});
