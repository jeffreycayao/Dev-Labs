// Ramon's voice floor feed must not repeat itself: working agents pause between
// bursts of output, and each pause used to become "went quiet" / "started
// producing output", so Ramon kept re-reading the same activity.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { RealtimeFloorWatcher } = loadTs('src/main/realtimeFloorWatcher.ts');

function setup() {
  let now = 1_000_000;
  const pushed = [];
  const ptys = [{ id: 'pty-a1', lastOutputAt: now }];
  const registry = { agents: { a1: { name: 'Pam' } } };
  let tasks = { tasks: [{ id: 't1', status: 'doing', title: 'Build the page' }] };
  const w = new RealtimeFloorWatcher({
    enabled: () => true,
    registry: () => registry,
    tasks: () => tasks,
    ptys: () => ptys,
    push: (text) => pushed.push(text),
    now: () => now
  });
  w.setSessionLive(true);
  w.tick(); // prime
  return {
    w,
    pushed,
    advance(ms, { output = false } = {}) {
      now += ms;
      if (output) ptys[0].lastOutputAt = now;
      w.tick();
    },
    setTasks(t) { tasks = t; }
  };
}

test('short pauses between outputs are never announced', () => {
  const s = setup();
  for (let i = 0; i < 20; i++) {
    s.advance(5_000, { output: i % 3 === 0 }); // works with 10-15 s pauses
  }
  assert.deepEqual(s.pushed, []);
});

test('a real silence after work is announced once, not again while still quiet', () => {
  const s = setup();
  s.advance(5_000, { output: true });
  for (let i = 0; i < 30; i++) s.advance(5_000); // 150 s of silence
  assert.equal(s.pushed.length, 1);
  assert.match(s.pushed[0], /Pam went quiet/);
});

test('the same line is not pushed twice within five minutes', () => {
  const s = setup();
  s.setTasks({ tasks: [{ id: 't1', status: 'done', title: 'Build the page' }] });
  s.advance(15_000);
  s.setTasks({ tasks: [{ id: 't1', status: 'doing', title: 'Build the page' }] });
  s.advance(15_000);
  s.setTasks({ tasks: [{ id: 't1', status: 'done', title: 'Build the page' }] });
  s.advance(15_000);
  const doneLines = s.pushed.filter((t) => t.includes('moved to done'));
  assert.equal(doneLines.length, 1);
});
