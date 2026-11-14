'use strict';

// Status badge over an agent's head (lib/avatars/statusBadge.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { agentStatusBadge } = loadTs('src/renderer/src/lib/avatars/statusBadge.ts');

test('error wins over everything', () => {
  for (const state of ['sitting', 'walking', 'away', 'dancing']) {
    assert.equal(agentStatusBadge('error', state).label, 'error');
  }
});

test('working while busy, and while exercising or dancing counts as busy', () => {
  assert.equal(agentStatusBadge('working', 'sitting').label, 'working');
  assert.equal(agentStatusBadge('working', 'walking').label, 'working');
  assert.equal(agentStatusBadge('idle', 'working_out').label, 'working');
  assert.equal(agentStatusBadge('idle', 'dancing').label, 'working');
});

test('an idle agent at its desk is waiting; one that wandered off is idle', () => {
  assert.equal(agentStatusBadge('idle', 'sitting').label, 'waiting');
  assert.equal(agentStatusBadge('idle', 'standing').label, 'waiting');
  assert.equal(agentStatusBadge('idle', 'walking').label, 'idle');
  assert.equal(agentStatusBadge('idle', 'away').label, 'idle');
});

test('each label has its own colour', () => {
  const colours = new Set(['error', 'working', 'waiting', 'idle'].map((l) => {
    const b = l === 'error' ? agentStatusBadge('error', 'sitting')
      : l === 'working' ? agentStatusBadge('working', 'sitting')
      : l === 'waiting' ? agentStatusBadge('idle', 'sitting')
      : agentStatusBadge('idle', 'away');
    assert.equal(b.label, l);
    assert.match(b.color, /^#[0-9a-f]{6}$/);
    return b.color;
  }));
  assert.equal(colours.size, 4);
});
