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

test('a free agent dances part of each cycle and roams the rest, offset by id', () => {
  const samples = (id) => Array.from({ length: act.DANCE_CYCLE_MS / 1000 }, (_, s) => act.danceUntil(id, 1_000_000 + s * 1000));
  const a = samples('agent-a');
  const dancing = a.filter((u) => u > 0).length;
  assert.equal(dancing, act.DANCE_MS / 1000, 'dances DANCE_MS out of every cycle');
  a.forEach((until, s) => { if (until) assert.ok(until > 1_000_000 + s * 1000 && until <= 1_000_000 + s * 1000 + act.DANCE_MS); });
  assert.notDeepEqual(a.map(Boolean), samples('agent-b').map(Boolean), 'two agents are not in lockstep');
});

test('nearestFreeDesk skips taken desks and picks the closest one', () => {
  const desks = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 300, y: 0 }];
  assert.equal(act.nearestFreeDesk({ x: 280, y: 10 }, desks, new Set()), 2);
  assert.equal(act.nearestFreeDesk({ x: 280, y: 10 }, desks, new Set([2])), 1);
  assert.equal(act.nearestFreeDesk(null, desks, new Set([0])), 1);
  assert.equal(act.nearestFreeDesk({ x: 0, y: 0 }, desks, new Set([0, 1, 2])), undefined);
});
