'use strict';

/**
 * Where symlinks need privilege (Windows without Developer Mode) a Codex worker gets
 * a COPY of the user's auth.json. Codex rotates refresh tokens, so a stale copy holds
 * a revoked token. syncCodexAuth must fold a newer same-account copy back into the
 * user's file, refresh a stale copy, and never let a foreign login overwrite theirs.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { syncCodexAuth } = loadTs('src/main/hive.ts');

const auth = (account, when, token) =>
  JSON.stringify({ tokens: { account_id: account, refresh_token: token }, last_refresh: when });

function setup(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-codex-auth-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return { src: path.join(dir, 'user-auth.json'), dest: path.join(dir, 'agent-auth.json') };
}
const token = (p) => JSON.parse(fs.readFileSync(p, 'utf8')).tokens.refresh_token;

test('a newer same-account copy is folded back into the user login', (t) => {
  const { src, dest } = setup(t);
  fs.writeFileSync(src, auth('acct', '2026-11-01T00:00:00Z', 'old'));
  fs.writeFileSync(dest, auth('acct', '2026-11-20T00:00:00Z', 'new'));
  syncCodexAuth(src, dest);
  assert.equal(token(src), 'new');
  assert.equal(token(dest), 'new');
});

test('a stale copy is replaced by the user login', (t) => {
  const { src, dest } = setup(t);
  fs.writeFileSync(src, auth('acct', '2026-11-20T00:00:00Z', 'new'));
  fs.writeFileSync(dest, auth('acct', '2026-11-01T00:00:00Z', 'old'));
  syncCodexAuth(src, dest);
  assert.equal(token(src), 'new');
  assert.equal(token(dest), 'new');
});

test('a copy for another account never overwrites the user login', (t) => {
  const { src, dest } = setup(t);
  fs.writeFileSync(src, auth('mine', '2026-11-01T00:00:00Z', 'mine'));
  fs.writeFileSync(dest, auth('planted', '2099-01-01T00:00:00Z', 'planted'));
  syncCodexAuth(src, dest);
  assert.equal(token(src), 'mine');
  assert.equal(token(dest), 'mine');
});

test('logging out removes the worker copy too', (t) => {
  const { src, dest } = setup(t);
  fs.writeFileSync(dest, auth('acct', '2026-11-01T00:00:00Z', 'old'));
  syncCodexAuth(src, dest);
  assert.equal(fs.existsSync(dest), false);
});

test('a fresh worker gets the user login', (t) => {
  const { src, dest } = setup(t);
  fs.writeFileSync(src, auth('acct', '2026-11-01T00:00:00Z', 'tok'));
  syncCodexAuth(src, dest);
  assert.equal(token(dest), 'tok');
});
