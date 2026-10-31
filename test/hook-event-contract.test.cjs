'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { validateHookEvent } = loadTs('src/shared/hookEvents.ts');

test('accepts valid hook event payloads', () => {
  assert.equal(validateHookEvent({
    agentId: 'jim-1',
    event: 'PreToolUse',
    tool: 'Bash',
    notificationType: 'permission',
    source: 'claude',
    message: 'Running a command',
    blocked: false
  }), true);
});

test('accepts optional agent ids and open provider event names', () => {
  assert.equal(validateHookEvent({ event: 'Stop' }), true);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: 'Unknown' }), true);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: 'FutureProviderEvent' }), true);
});

test('rejects payloads missing a valid event name', () => {
  assert.equal(validateHookEvent({ agentId: 'jim-1' }), false);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: '' }), false);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: 42 }), false);
});

test('rejects malformed optional fields', () => {
  assert.equal(validateHookEvent({ agentId: '', event: 'Stop' }), false);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: 'PreToolUse', tool: 42 }), false);
  assert.equal(validateHookEvent({ agentId: 'jim-1', event: 'Stop', blocked: 'false' }), false);
  assert.equal(validateHookEvent(null), false);
});

test('main and preload share the hook event contract', () => {
  const root = path.resolve(__dirname, '..');
  const main = fs.readFileSync(path.join(root, 'src/main/hooks.ts'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'src/preload/index.ts'), 'utf8');

  assert.match(main, /validateHookEvent.*shared\/hookEvents|shared\/hookEvents.*validateHookEvent/s);
  assert.match(preload, /HookEvent.*shared\/hookEvents|shared\/hookEvents.*HookEvent/s);
  assert.match(preload, /payload: HookEvent/);
});

test('tool detail: the Bash command or file path, single-line and capped', () => {
  const { toolDetail, validateHookEvent, TOOL_DETAIL_MAX } = loadTs('src/shared/hookEvents.ts');
  assert.equal(toolDetail({ command: 'npm   test\n  -- --watch' }), 'npm test -- --watch');
  assert.equal(toolDetail({ file_path: '/repo/src/a.ts', old_string: 'x' }), '/repo/src/a.ts');
  assert.equal(toolDetail({ command: 'x'.repeat(500) }).length, TOOL_DETAIL_MAX);
  assert.equal(toolDetail(null), undefined);
  assert.equal(toolDetail({ query: 'nope' }), undefined);
  assert.equal(validateHookEvent({ event: 'PreToolUse', detail: 'npm test' }), true);
  assert.equal(validateHookEvent({ event: 'PreToolUse', detail: 42 }), false);
});
