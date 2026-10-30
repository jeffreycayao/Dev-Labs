'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

// legacyUserData.ts resolves userData through Electron's app.getPath() and runs
// at import time. Point it at a throwaway parent holding a fresh "DevLabs"
// folder plus an older "Jepoy Floor AI" one, as an upgraded machine has.
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'md-legacy-userdata-'));
const target = path.join(root, 'DevLabs');
const legacy = path.join(root, 'Jepoy Floor AI');
fs.mkdirSync(target);
fs.mkdirSync(legacy);
fs.writeFileSync(path.join(legacy, 'config.json'), '{"agents":[]}');
fs.writeFileSync(path.join(legacy, 'license.json'), '{"refreshCipher":"old-token"}');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => target } }
};

const { removeRetiredAuthData } = loadTs('src/main/legacyUserData.ts');

test.after(() => fs.rmSync(root, { recursive: true, force: true }));

test('carries the old config over but never the retired sign-in token', () => {
  assert.equal(fs.readFileSync(path.join(target, 'config.json'), 'utf8'), '{"agents":[]}');
  assert.equal(fs.existsSync(path.join(target, 'license.json')), false);
});

test('removes the retired sign-in token from the legacy folder too', () => {
  assert.equal(fs.existsSync(path.join(legacy, 'license.json')), false);
  assert.equal(fs.existsSync(path.join(legacy, 'config.json')), true, 'other legacy data stays');
});

test('cleans a token that reappears, and is a no-op once clean', () => {
  fs.writeFileSync(path.join(target, 'license.json'), '{}');
  assert.equal(removeRetiredAuthData(), 1);
  assert.equal(fs.existsSync(path.join(target, 'license.json')), false);
  assert.equal(removeRetiredAuthData(), 0);
});
