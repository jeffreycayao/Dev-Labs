'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-codex-model-'));
const configFile = path.join(userData, 'config.json');
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => userData } }
};

const { readConfig } = loadTs('src/main/config.ts');
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

function save(selection) {
  fs.writeFileSync(configFile, JSON.stringify({
    onboardingComplete: true,
    harnessHome: 'C:\\Users\\test\\agents',
    triggersMigratedV1: true,
    ...selection
  }));
}

test('a failed legacy Codex switch recovers its stored model on next launch', () => {
  save({ godProvider: 'codex', godModel: 'gpt-5-codex' });

  const loaded = readConfig();
  assert.equal(loaded.godModel, 'gpt-6-astra');
  assert.equal(loaded.harnessHome, 'C:\\Users\\test\\agents');
  assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).godModel, 'gpt-6-astra');
});

test('other provider and Codex model selections stay intact', () => {
  save({ godProvider: 'claude', godModel: 'gpt-5-codex' });
  assert.equal(readConfig().godModel, 'gpt-5-codex');
  assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).godModel, 'gpt-5-codex');

  save({ godProvider: 'codex', godModel: 'gpt-6-sol' });
  assert.equal(readConfig().godModel, 'gpt-6-sol');
  assert.equal(JSON.parse(fs.readFileSync(configFile, 'utf8')).godModel, 'gpt-6-sol');
});
