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

// Spawn-requests run a command, so they need the same signature (cth-spawn).
const signedSpawn = (request, over = {}) => {
  const body = typeof request === 'string' ? request : JSON.stringify(request);
  const ts = over.ts ?? now;
  const nonce = over.nonce ?? 'e1b2c3d4e5f6a7b8c9d0e1f2';
  return { body, ts, nonce, sig: fa.spawnSignature(over.token ?? TOKEN, body, ts, nonce) };
};

test('a signed spawn-request is accepted once and returns its request', () => {
  const seen = new Map();
  const req = { objective: 'fix the build', cwd: '/repo', command: 'claude' };
  assert.deepEqual(fa.verifySpawnRequest(signedSpawn(req), TOKEN, now, seen), { ok: true, request: req });
  assert.equal(fa.verifySpawnRequest(signedSpawn(req), TOKEN, now, seen).ok, false, 'replay refused');
});

test('unsigned, forged, edited or stale spawn-requests are refused', () => {
  const seen = new Map();
  const req = { objective: 'x', cwd: '/repo' };
  assert.equal(fa.verifySpawnRequest(req, TOKEN, now, seen).ok, false, 'a plain request file');
  assert.equal(fa.verifySpawnRequest(signedSpawn(req, { token: 'other-agent-token' }), TOKEN, now, seen).ok, false);
  const edited = { ...signedSpawn(req, { nonce: 'f1b2c3d4e5f6a7b8c9d0e1f2' }), body: JSON.stringify({ ...req, command: 'bash' }) };
  assert.equal(fa.verifySpawnRequest(edited, TOKEN, now, seen).ok, false, 'signature is bound to the body');
  assert.equal(fa.verifySpawnRequest(signedSpawn(req, { ts: now - fa.FIRE_MAX_AGE_MS - 1, nonce: '01b2c3d4e5f6a7b8c9d0e1f2' }), TOKEN, now, seen).ok, false);
  assert.equal(fa.verifySpawnRequest(signedSpawn(req, { nonce: '11b2c3d4e5f6a7b8c9d0e1f2' }), undefined, now, seen).ok, false);
});

test('a fire signature never verifies as a spawn, nor the reverse', () => {
  const seen = new Map();
  const fire = signed('spawn', { nonce: '21b2c3d4e5f6a7b8c9d0e1f2' });
  assert.equal(fa.verifySpawnRequest({ ...fire, body: '' }, TOKEN, now, seen).ok, false);
  const spawn = signedSpawn('{}', { nonce: '31b2c3d4e5f6a7b8c9d0e1f2' });
  assert.equal(fa.verifyFireRequest({ ...spawn, id: 'spawn' }, TOKEN, now, seen).ok, false);
});

test('the cth-spawn shim writes a request main accepts', (t) => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const { HiveManager } = loadTs('src/main/hive.ts');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-spawn-shim-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  new HiveManager(() => home).ensureHive();
  const shim = path.join(home, 'hive-internal', 'bin', 'cth-spawn.cjs');
  const draft = path.join(home, 'pam-docs.json');
  const req = { objective: 'write docs', cwd: home, command: 'codex' };
  fs.writeFileSync(draft, JSON.stringify(req));
  const root = path.join(home, 'hive');
  const r = spawnSync(process.execPath, [shim, draft], { env: { ...process.env, HIVE_HOOK_TOKEN: TOKEN, HIVE_ROOT: root }, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  const queued = JSON.parse(fs.readFileSync(path.join(root, 'spawn-requests', 'pam-docs.json'), 'utf8'));
  assert.ok(!JSON.stringify(queued).includes(TOKEN), 'token never in the file');
  const v = fa.verifySpawnRequest(queued, TOKEN, Date.now(), new Map());
  assert.deepEqual(v, { ok: true, request: req });
});
