'use strict';

/**
 * An unreadable config.json or integration-secrets.json must never be replaced
 * by defaults + one change: that would wipe the hive home, every saved setting
 * and every other stored key. The file is copied aside and the write refuses.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-corrupt-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s, 'utf8'),
      decryptString: (b) => b.toString('utf8')
    }
  }
};
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const { readConfig, writeConfig } = loadTs('src/main/config.ts');
const integrations = loadTs('src/main/integrations.ts');

const copies = (name) => fs.readdirSync(userData).filter((f) => f.startsWith(`${name}.corrupt-`));

test('a corrupt config.json is copied aside and never overwritten by a write', () => {
  const p = path.join(userData, 'config.json');
  const torn = '{"harnessHome": "/keep/me", "webhookSecret": "s3cret"'; // cut off mid-write
  fs.writeFileSync(p, torn);

  assert.doesNotThrow(() => readConfig(), 'reads still fall back so the app boots');
  assert.throws(() => writeConfig({ notifications: false }), /could not be read/);
  assert.equal(fs.readFileSync(p, 'utf8'), torn, 'the user file is untouched');
  assert.equal(copies('config.json').length, 1);
  assert.equal(fs.readFileSync(path.join(userData, copies('config.json')[0]), 'utf8'), torn);

  // Once the file reads again, writes work and keep what was in it.
  fs.writeFileSync(p, '{"webhookSecret": "s3cret"}');
  writeConfig({ notifications: false });
  assert.equal(readConfig().webhookSecret, 's3cret');
});

test('a corrupt secrets file is not replaced by a blob holding only the new key', () => {
  const p = path.join(userData, 'integration-secrets.json');
  const torn = '{"int:a": "Zm9v", "int:b": "YmFy"';
  fs.writeFileSync(p, torn);

  const res = integrations.setSecret('int:spotify', 'token');
  assert.equal(res.ok, false);
  assert.match(res.error, /could not be read/);
  assert.equal(fs.readFileSync(p, 'utf8'), torn);
  assert.equal(copies('integration-secrets.json').length, 1);
});
