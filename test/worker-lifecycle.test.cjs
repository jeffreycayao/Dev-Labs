const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { isEphemeralSpawnRequest } = loadTs('src/shared/workerLifecycle.ts');

test('Ramon spawns durable hires unless a request explicitly opts into one-off cleanup', () => {
  assert.equal(isEphemeralSpawnRequest({ objective: 'stand by' }), false);
  assert.equal(isEphemeralSpawnRequest({ ephemeral: false }), false);
  assert.equal(isEphemeralSpawnRequest({ ephemeral: 'true' }), false);
  assert.equal(isEphemeralSpawnRequest({ ephemeral: true }), true);
});
