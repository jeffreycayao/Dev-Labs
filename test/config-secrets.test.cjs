'use strict';

// Settings keys (Slack, Groq, webhook and org secrets) live in the encrypted
// connector store, not in config.json, which agents can read.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-config-secrets-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { app: { getPath: () => userData } }
};

const { writeConfig, readConfig, useConfigSecretStore, configForRenderer, SAVED_SECRET } = loadTs('src/main/config.ts');
const configFile = path.join(userData, 'config.json');
const onDisk = () => fs.readFileSync(configFile, 'utf8');

test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

test('a config.json from before is sealed on read, and secrets never reach the file again', () => {
  fs.writeFileSync(configFile, JSON.stringify({ groqApiKey: 'gsk_old', slackBotToken: 'xoxb-old' }));
  const store = new Map();
  useConfigSecretStore({ get: (r) => store.get(r), set: (r, v) => (store.set(r, v), true), del: (r) => store.delete(r) });

  const cfg = readConfig();
  assert.equal(cfg.groqApiKey, 'gsk_old');
  assert.doesNotMatch(onDisk(), /gsk_old|xoxb-old/);

  writeConfig({
    slackSigningSecret: 'sign-1',
    orgTrigger: { ...cfg.orgTrigger, apiKey: 'org-key' },
    webhookTriggers: [{ id: 'w1', name: 'W', secret: 'hook-secret', enabled: true }]
  });
  assert.doesNotMatch(onDisk(), /sign-1|org-key|hook-secret/);
  const back = readConfig();
  assert.equal(back.slackSigningSecret, 'sign-1');
  assert.equal(back.orgTrigger.apiKey, 'org-key');
  assert.equal(back.webhookTriggers[0].secret, 'hook-secret');

  // An unrelated save keeps every key; an explicit clear removes it.
  writeConfig({ orchestratorMaySpawn: true });
  assert.equal(readConfig().groqApiKey, 'gsk_old');
  writeConfig({ groqApiKey: undefined });
  assert.equal(readConfig().groqApiKey, undefined);
  assert.equal(store.has('config:groqApiKey'), false);
});

test('the window gets a placeholder, not the Slack or Groq key', () => {
  const view = configForRenderer({ slackBotToken: 'xoxb-1', groqApiKey: 'gsk_1', slackChannelId: 'C1' });
  assert.equal(view.slackBotToken, SAVED_SECRET);
  assert.equal(view.groqApiKey, SAVED_SECRET);
  assert.equal(view.slackChannelId, 'C1');
});

test('without OS encryption a key stays where it was rather than being lost', () => {
  useConfigSecretStore({ get: () => undefined, set: () => false, del: () => {} });
  writeConfig({ slackBotToken: 'xoxb-kept' });
  assert.equal(readConfig().slackBotToken, 'xoxb-kept');
});
