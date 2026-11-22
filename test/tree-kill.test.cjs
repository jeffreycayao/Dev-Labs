'use strict';

// Firing an agent must stop everything it started. The real shape on every OS:
// a CLI (the pty root) that started an MCP server, which started a helper that
// left the root's process group (a browser, a daemon). These tests build that
// tree from plain node processes and check that nothing survives the kill.

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { descendantsOf, killTreeAsync, ensureKilled, isAlive, flushPendingTreeKills } = loadTs('src/main/procKill.ts');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

test('descendantsOf walks every level, skips the root and survives a pid cycle', () => {
  const ppid = new Map([[10, 1], [11, 10], [12, 11], [13, 11], [20, 1], [30, 31], [31, 30], [10_10, 10_10]]);
  assert.deepEqual(descendantsOf(ppid, 10).sort(), [11, 12, 13]);
  assert.deepEqual(descendantsOf(ppid, 99), []);
  assert.deepEqual(descendantsOf(ppid, 30), [31]);
});

/** root → child → grandchild, each a sleeping node. The grandchild is
 *  detached (own group / no console link), like a browser. Resolves with the
 *  three pids once the grandchild reports in. */
function spawnTree() {
  const grand = 'setInterval(()=>{},1e3)';
  const child = `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(grand)}],{stdio:'ignore',detached:true});console.log(c.pid);setInterval(()=>{},1e3)`;
  const root = `const c=require('child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:['ignore','pipe','ignore']});c.stdout.on('data',d=>console.log(c.pid+' '+String(d).trim()));setInterval(()=>{},1e3)`;
  const proc = spawn(process.execPath, ['-e', root], { stdio: ['ignore', 'pipe', 'ignore'], detached: process.platform !== 'win32' });
  return new Promise((resolve, reject) => {
    proc.stdout.on('data', (d) => {
      const [c, g] = String(d).trim().split(/\s+/).map(Number);
      resolve({ root: proc.pid, child: c, grand: g, proc });
    });
    proc.on('error', reject);
    setTimeout(() => reject(new Error('tree did not start')), 10_000).unref();
  });
}

test('the whole tree dies: root, MCP-like child and detached grandchild', { timeout: 20_000 }, async () => {
  const t = await spawnTree();
  t.proc.stdout.destroy();
  for (const pid of [t.root, t.child, t.grand]) assert.ok(isAlive(pid), `pid ${pid} should be running before the kill`);
  if (process.platform === 'win32') {
    await killTreeAsync(t.root);
  } else {
    ensureKilled(t.root, 200);
    await sleep(800);
  }
  await sleep(300);
  const alive = [t.root, t.child, t.grand].filter(isAlive);
  assert.deepEqual(alive, [], 'nothing from the tree may survive');
});

test('killTreeAsync runs many kills without blocking the event loop', { skip: process.platform !== 'win32' }, async () => {
  const trees = await Promise.all([spawnTree(), spawnTree(), spawnTree(), spawnTree(), spawnTree(), spawnTree()]);
  for (const t of trees) t.proc.stdout.destroy();
  let ticks = 0;
  const timer = setInterval(() => ticks++, 10);
  await Promise.all(trees.map((t) => killTreeAsync(t.root)));
  clearInterval(timer);
  assert.ok(ticks > 0, 'the event loop kept running while the trees were killed');
  await sleep(300);
  const alive = trees.flatMap((t) => [t.root, t.child, t.grand]).filter(isAlive);
  assert.deepEqual(alive, []);
});

test('app quit reaps trees still queued behind the 4-at-a-time taskkill limit', { skip: process.platform !== 'win32', timeout: 30_000 }, async () => {
  const trees = await Promise.all([spawnTree(), spawnTree(), spawnTree(), spawnTree(), spawnTree(), spawnTree()]);
  for (const t of trees) t.proc.stdout.destroy();
  // Fire all six (two wait in the queue), then quit before any taskkill finishes.
  const queued = trees.map((t) => killTreeAsync(t.root));
  flushPendingTreeKills();
  const alive = trees.flatMap((t) => [t.root, t.child, t.grand]).filter(isAlive);
  assert.deepEqual(alive, [], 'every fired tree is gone when killAll returns');
  await Promise.all(queued); // the skipped queue entries still settle
});
