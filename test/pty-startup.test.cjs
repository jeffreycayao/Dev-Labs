'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { spawnAndObservePty, terminalNeedsStartupInput } = loadTs('src/renderer/src/components/ptyStartup.ts');

function fakePty() {
  let data;
  let exit;
  let live = true;
  let listeners = 0;
  return {
    bridge: {
      onPtyData(_id, callback) { data = callback; listeners++; return () => { listeners--; }; },
      onPtyExit(_id, callback) { exit = callback; listeners++; return () => { listeners--; }; },
      async listPtys() { return live ? [{ id: 'ramon' }] : []; }
    },
    data(chunk) { data(chunk); },
    exit(code) { live = false; exit({ exitCode: code }); },
    setLive(value) { live = value; },
    listenerCount() { return listeners; }
  };
}

test('an exit before the spawn response is treated as a failed startup', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.data('Error: model is not supported');
    pty.exit(1);
    return { ok: true };
  }, 10);
  assert.deepEqual(observed.startup, {
    kind: 'exited', exitCode: 1, output: 'Error: model is not supported'
  });
  assert.equal(pty.listenerCount(), 0);
});

test('a split Codex folder-trust question exposes the live terminal', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.data('\x1b[1mTrust this');
    pty.data(' folder?\x1b[0m');
    return { ok: true };
  }, 10);
  assert.equal(observed.startup.kind, 'needs-input');
  assert.equal(pty.listenerCount(), 0);
});

test('a split ANSI color code inside the trust question is still recognized', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.data('Trust this \x1b[');
    pty.data('1mfolder?');
    return { ok: true };
  }, 10);
  assert.equal(observed.startup.kind, 'needs-input');
});

test('a Codex sign-in menu also waits for human input', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.data('How would you like to sign in?  1. Sign in with ChatGPT');
    return { ok: true };
  }, 10);
  assert.equal(observed.startup.kind, 'needs-input');
});

test('ordinary terminal text about login does not block later automation', () => {
  assert.equal(terminalNeedsStartupInput('The user asked about a login bug.'), false);
  assert.equal(terminalNeedsStartupInput('Read the login code and report back.'), false);
  assert.equal(terminalNeedsStartupInput('Sign in to the dashboard, then open Settings.'), false);
  assert.equal(terminalNeedsStartupInput('To continue, sign in with ChatGPT.'), false);
  assert.equal(terminalNeedsStartupInput('The app reports: authentication required; help the user debug it.'), false);
});

test('a process that silently disappears fails the final liveness check', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.setLive(false);
    return { ok: true };
  }, 1);
  assert.equal(observed.startup.kind, 'exited');
});

test('a live CLI passes after the startup grace period', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => ({ ok: true }), 1);
  assert.equal(observed.startup.kind, 'running');
});

test('a first-time installer is not mistaken for a crashed agent', async () => {
  const pty = fakePty();
  const observed = await spawnAndObservePty('ramon', pty.bridge, async () => {
    pty.exit(0);
    return { ok: true, setup: 'installing' };
  }, 1);
  assert.equal(observed.startup, undefined);
  assert.equal(pty.listenerCount(), 0);
});
