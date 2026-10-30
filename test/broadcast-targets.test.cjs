'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { selectBroadcastTargets } = loadTs('src/shared/broadcast.ts');

const roster = {
  michael: {},
  dev1: {},
  // A worker on a hookless provider (`custom`): no hook bridge, no proxy.
  toby: {},
  prep: { isAssistant: true },
  creed: { archived: true },
  kelly: { status: 'gone' }
};

test('a broadcast reaches every live agent except the sender', () => {
  const targets = selectBroadcastTargets(roster, 'michael');
  assert.deepEqual(targets.sort(), ['dev1', 'toby']);
});

test('the send-only prep assistant is never a broadcast target', () => {
  assert.ok(!selectBroadcastTargets(roster, 'michael').includes('prep'));
});

test('an explicitly fired agent is skipped', () => {
  assert.ok(!selectBroadcastTargets(roster, 'michael').includes('creed'));
});

test('a stopped but still hired agent cannot receive a broadcast', () => {
  assert.ok(!selectBroadcastTargets(roster, 'michael').includes('kelly'));
});

test('a hookless agent is included — direct mail already reaches it', () => {
  // Regression: fan-out used to gate on canReceiveInbox, so an agent on the
  // `custom` provider silently never heard a broadcast while a DIRECT message
  // to the same agent was delivered as a terminal work order.
  assert.ok(selectBroadcastTargets(roster, 'michael').includes('toby'));
});

test('the sender is excluded even when it is the only other agent', () => {
  assert.deepEqual(selectBroadcastTargets({ solo: {} }, 'solo'), []);
});

test('a missing registry entry is not a target', () => {
  const holes = { dev1: {}, ghost: undefined };
  assert.deepEqual(selectBroadcastTargets(holes, 'michael'), ['dev1']);
});
