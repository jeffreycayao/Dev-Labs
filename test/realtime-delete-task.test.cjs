'use strict';
/**
 * Voice delete_task is destructive: hive.deleteTask is permanent and the card
 * match is fuzzy, so the first call only stages an echo-back; nothing is
 * deleted until the USER is heard saying "confirm" or "delete" (never bare yes)
 * after the echo-back — the model's own confirm phrase is not trusted.
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

const heard = (text, at = Date.now()) => ({ phrase: text, heard: [{ at, text }] });

test('a bare "yes" does not delete; "delete it" does', async () => {
  assert.equal((await call('realtime:action:confirm', heard('yes'))).ok, false);
  assert.deepEqual(deleted, []);
  const res = await call('realtime:action:confirm', heard('delete it'));
  assert.equal(res.ok, true);
  assert.deepEqual(deleted, ['fix-login-bug']);
});

test('the model saying "confirm" is not enough: the user must be heard saying it', async () => {
  deleted.length = 0;
  await call('realtime:action', { verb: 'delete_task', taskId: 'login bug' });
  // An agent-injected instruction: the model calls confirm_action, nobody spoke.
  assert.equal((await call('realtime:action:confirm', { phrase: 'confirm', heard: [] })).ok, false);
  // Speech from BEFORE the action was staged doesn't count either.
  assert.equal((await call('realtime:action:confirm', heard('delete it', Date.now() - 60_000))).ok, false);
  assert.deepEqual(deleted, []);
  await call('realtime:action:cancel');
});

test('"no, don\'t confirm that" never deletes, and only the latest utterance counts', async () => {
  deleted.length = 0;
  await call('realtime:action', { verb: 'delete_task', taskId: 'login bug' });
  assert.equal((await call('realtime:action:confirm', heard("No, don't confirm that"))).ok, false);
  const now = Date.now();
  // "confirm" earlier, then "wait": the later "wait" is what the user means now.
  const res = await call('realtime:action:confirm', { phrase: 'confirm', heard: [{ at: now, text: 'confirm' }, { at: now + 1, text: 'wait' }] });
  assert.equal(res.ok, false);
  assert.deepEqual(deleted, []);
  await call('realtime:action:cancel');
});

test('cancel drops a staged delete', async () => {
  deleted.length = 0;
  await call('realtime:action', { verb: 'delete_task', taskId: 'login bug' });
  await call('realtime:action:cancel');
  assert.equal((await call('realtime:action:confirm', heard('confirm'))).ok, false);
  assert.deepEqual(deleted, []);
});
