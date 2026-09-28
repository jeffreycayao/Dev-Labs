'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { reconcileHiredRoster, stoppedAgent } = loadTs('src/shared/agentRoster.ts');

const hire = (id) => ({ id, name: id, ptyId: `pty-${id}`, status: 'idle', action: 'working' });

test('a stopped terminal leaves its hire on the floor and keeps its restore recipe', () => {
  const amy = hire('amy');
  const result = reconcileHiredRoster([amy], [], [], ['amy']);
  assert.deepEqual(result.agents.map((a) => a.id), ['amy']);
  assert.equal(result.agents[0].status, 'ghost');
  assert.equal(result.restorable[0].ptyId, 'pty-amy');
  assert.equal(result.restorable[0].name, 'amy');
});

test('a hire made during the PTY query is not removed by its stale result', () => {
  const amy = hire('amy');
  const ben = hire('ben');
  const result = reconcileHiredRoster([amy, ben], [], [], ['amy']);
  assert.deepEqual(result.agents.map((a) => a.id), ['amy', 'ben']);
  assert.equal(result.agents[1], ben);
  assert.deepEqual(result.restorable.map((a) => a.id), ['amy']);
});

test('a legacy Ramon card without its isGod flag is not treated as a stopped hire', () => {
  const god = hire('god');
  const result = reconcileHiredRoster([god], [], [], ['god']);
  assert.equal(result.agents[0], god);
  assert.deepEqual(result.restorable, []);
});

test('stopped state does not archive or change the identity of a hire', () => {
  const amy = hire('amy');
  const stopped = stoppedAgent(amy);
  assert.equal(stopped.id, amy.id);
  assert.equal(stopped.ptyId, amy.ptyId);
  assert.equal(stopped.archived, undefined);
  assert.equal(stopped.status, 'ghost');
});
