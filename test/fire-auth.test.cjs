'use strict';
// Signed fire-requests (src/main/fireAuth.ts): the orchestrator's token never
// lands on disk, and a copied request cannot fire anyone else or be replayed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const fa = loadTs(require.resolve('../src/main/fireAuth.ts'));
const TOKEN = 'god-token-DO-NOT-LEAK';
const now = 1_700_000_000_000;
const signed = (id, over = {}) => {
  const ts = over.ts ?? now;
  const nonce = over.nonce ?? 'a1b2c3d4e5f6a7b8c9d0e1f2';
  return { id, ts, nonce, sig: fa.fireSignature(over.token ?? TOKEN, id, ts, nonce) };
};

test('a request signed with the orchestrator token is accepted once', () => {
  const seen = new Map();
  assert.deepEqual(fa.verifyFireRequest(signed('pam'), TOKEN, now, seen), { ok: true, id: 'pam' });
  assert.equal(fa.verifyFireRequest(signed('pam'), TOKEN, now, seen).ok, false, 'replay refused');
  assert.ok(!JSON.stringify(signed('pam')).includes(TOKEN), 'token never in the file');
});

test('forged, retargeted, stale or token-bearing requests are refused', () => {
  const seen = new Map();
  assert.equal(fa.verifyFireRequest(signed('pam', { token: 'other-agent-token' }), TOKEN, now, seen).ok, false);
  const moved = { ...signed('pam', { nonce: 'b1b2c3d4e5f6a7b8c9d0e1f2' }), id: 'jim' };
  assert.equal(fa.verifyFireRequest(moved, TOKEN, now, seen).ok, false, 'signature is bound to the id');
  assert.equal(fa.verifyFireRequest(signed('pam', { ts: now - fa.FIRE_MAX_AGE_MS - 1, nonce: 'c1b2c3d4e5f6a7b8c9d0e1f2' }), TOKEN, now, seen).ok, false);
  assert.equal(fa.verifyFireRequest({ id: 'pam', token: TOKEN }, TOKEN, now, seen).ok, false);
  assert.equal(fa.verifyFireRequest(signed('pam', { nonce: 'd1b2c3d4e5f6a7b8c9d0e1f2' }), undefined, now, seen).ok, false, 'no orchestrator running');
});

test('used nonces are forgotten once they could no longer pass the age check', () => {
  const seen = new Map([['old', now - fa.FIRE_MAX_AGE_MS - 1]]);
  fa.verifyFireRequest(null, TOKEN, now, seen);
  assert.equal(seen.has('old'), false);
});
