'use strict';
/**
 * Voice delete_task is destructive: hive.deleteTask is permanent and the card
 * match is fuzzy, so the first call only stages an echo-back; nothing is
 * deleted until confirm_action carries "confirm" or "delete" (never bare yes).
 */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const handlers = new Map();
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) } }
};
const { registerRealtimeActionIpc } = loadTs('src/main/realtimeActions.ts');

const deleted = [];
registerRealtimeActionIpc({
  hiveEnabled: () => true,
  hiveTasks: () => ({ tasks: [{ id: 'fix-login-bug', title: 'Fix login bug', status: 'todo' }] }),
  hiveDeleteTask: (id) => { deleted.push(id); return true; },
  hiveRegistry: () => ({ agents: {} }),
  hiveLog: () => {}
});
const call = (ch, p) => handlers.get(ch)(null, p);

test('delete_task stages a confirm instead of deleting', async () => {
  const res = await call('realtime:action', { verb: 'delete_task', taskId: 'login bug' });
  assert.equal(res.ok, true);
  assert.equal(res.needsConfirm, true);
  assert.match(res.spoken, /Fix login bug/);
  assert.deepEqual(deleted, []);
});

test('a bare "yes" does not delete; "delete it" does', async () => {
  assert.equal((await call('realtime:action:confirm', { phrase: 'yes' })).ok, false);
  assert.deepEqual(deleted, []);
  const res = await call('realtime:action:confirm', { phrase: 'delete it' });
  assert.equal(res.ok, true);
  assert.deepEqual(deleted, ['fix-login-bug']);
});

test('cancel drops a staged delete', async () => {
  deleted.length = 0;
  await call('realtime:action', { verb: 'delete_task', taskId: 'login bug' });
  await call('realtime:action:cancel');
  assert.equal((await call('realtime:action:confirm', { phrase: 'confirm' })).ok, false);
  assert.deepEqual(deleted, []);
});
