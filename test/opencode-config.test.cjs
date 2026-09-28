'use strict';

// OpenCode approvals are config, not a flag. In floor auto mode every
// permission it can ask about must be "allow", or an unattended agent stalls
// on "Permission required" (seen live: external_directory mid-task).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { buildOpenCodeConfig } = loadTs('src/shared/opencodeConfig.ts');

test('auto mode allows every permission OpenCode asks about', () => {
  const oc = buildOpenCodeConfig({ autoMode: true });
  assert.deepEqual(oc.permission, {
    edit: 'allow', bash: 'allow', webfetch: 'allow', external_directory: 'allow', doom_loop: 'allow'
  });
  assert.equal(oc.autoupdate, false);
});

test('ask-first mode sends no permission block (OpenCode defaults apply)', () => {
  const oc = buildOpenCodeConfig({ autoMode: false });
  assert.equal('permission' in oc, false);
});

test('a local base URL registers the selected local model', () => {
  const oc = buildOpenCodeConfig({ autoMode: false, baseUrl: 'http://127.0.0.1:11434/v1', localModel: 'llama3' });
  assert.deepEqual(oc.provider.local.models, { llama3: { name: 'llama3' } });
  assert.equal(oc.provider.local.options.baseURL, 'http://127.0.0.1:11434/v1');
  assert.deepEqual(buildOpenCodeConfig({ autoMode: false, baseUrl: 'http://x' }).provider.local.models, { local: { name: 'local' } });
});
