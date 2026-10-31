'use strict';

// 3D office activity: which prompts send an agent where (Claw3D's directive
// parser, ported to src/shared/office/deskDirectives.ts) and which tool
// commands count as running tests (→ QA lab).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const dd = loadTs('src/shared/office/deskDirectives.ts');
const act = loadTs('src/shared/office/officeActivity.ts');
const intent = (text) => dd.resolveOfficeIntentSnapshot(text);

test('room directives from plain prompts', () => {
  assert.equal(intent('go to the gym').gym?.directive, 'gym');
  assert.equal(intent('please write tests for the parser').qa, 'qa_lab');
  assert.equal(intent('review PRs').github, 'github');
  assert.equal(intent('fix the login bug').gym, null);
  assert.equal(intent('').desk, null);
});

test('calls and texts need a message before the agent walks to a booth', () => {
  assert.equal(intent('call Maya').call?.phase, 'needs_message');
  const ready = intent('call Maya and tell her the build is green').call;
  assert.equal(ready?.phase, 'ready_to_call');
  assert.match(ready?.message ?? '', /build is green/);
  assert.equal(intent('text Joseph saying I will be late').text?.phase, 'ready_to_send');
});

test('test commands are recognised, other commands are not', () => {
  for (const cmd of ['npm test', 'npm run test -- --watch', 'npx vitest run', 'pytest -q', 'go test ./...', 'node --test test/*.cjs', 'cargo test']) {
    assert.equal(act.isTestCommand(cmd), true, cmd);
  }
  for (const cmd of ['npm run build', 'git status', 'ls tests/', undefined, '']) {
    assert.equal(act.isTestCommand(cmd), false, String(cmd));
  }
});

test('room holds expire, and a release ends them early', () => {
  const ids = new Set(['a', 'b', 'c']);
  const now = 1_000;
  const untils = { a: now + act.ROOM_HOLD_MS, b: 0, gone: now + act.ROOM_HOLD_MS };
  assert.deepEqual(act.activeHolds(untils, now, ids), { a: true });
  assert.deepEqual(act.activeHolds(untils, now + act.ROOM_HOLD_MS - 1, ids), { a: true });
  assert.deepEqual(act.activeHolds(untils, now + act.ROOM_HOLD_MS, ids), {});
});
