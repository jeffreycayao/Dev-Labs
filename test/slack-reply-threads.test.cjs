'use strict';

// The loopback reply token is shared by every agent, so the endpoint only posts
// into channel:thread pairs that a verified inbound Slack trigger opened.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { SlackReplyServer, rememberSlackThread, isKnownSlackThread } = loadTs('src/main/slack.ts');

// Runs in a fresh process (= an app restart): start a server on `file`, print whether a thread is known.
function knownAfterRestart(file, channel, ts) {
  const code = `const s=require(${JSON.stringify(path.join(__dirname, 'load-ts.cjs'))})('src/main/slack.ts');
    const srv=new s.SlackReplyServer({token:'t',getBotToken:()=>undefined,threadsFile:${JSON.stringify(file)}});
    srv.start(0).then(()=>{process.stdout.write(String(s.isKnownSlackThread(${JSON.stringify(channel)},${JSON.stringify(ts)})));srv.stop();});`;
  return execFileSync(process.execPath, ['-e', code], { cwd: path.join(__dirname, '..'), encoding: 'utf8' }) === 'true';
}

test('known threads survive a restart through the main-only threads file', async (t) => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'md-slack-threads-')), 'hive-internal', 'slack-threads.json');
  const server = new SlackReplyServer({ token: 'tok', getBotToken: () => 'xoxb-test', threadsFile: file });
  await server.start(0);
  t.after(() => server.stop());
  rememberSlackThread('CR', '5.5');
  assert.equal(knownAfterRestart(file, 'CR', '5.5'), true, 'a new process reading the same file allows the thread');
  assert.equal(knownAfterRestart(file, 'CR', '6.6'), false);
  // A thread that only appears in tasks.json (agent-writable) is not a known thread.
  fs.writeFileSync(path.join(path.dirname(file), 'tasks.json'), JSON.stringify({ tasks: [{ status: 'doing', slack: { channel: 'CF', thread_ts: '8.8' } }] }));
  assert.equal(knownAfterRestart(file, 'CF', '8.8'), false);
});

test('a thread only present in tasks.json is refused by the endpoint', async (t) => {
  const server = new SlackReplyServer({ token: 'tok', getBotToken: () => 'xoxb-test' });
  const { port } = await server.start(0);
  t.after(() => server.stop());
  const r = await fetch(`http://127.0.0.1:${port}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-md-reply-token': 'tok' },
    body: JSON.stringify({ channel: 'CF', thread_ts: '8.8', text: 'hi' })
  });
  assert.equal(r.status, 403);
});

test('index.ts persists known threads under hive-internal', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/index.ts'), 'utf8');
  assert.match(src, /threadsFile: hive\.internalDir\(\) \? join\(hive\.internalDir\(\)!, 'slack-threads\.json'\) : null/);
  assert.doesNotMatch(src, /readTasks: \(\) => hive\.tasks\(\)/);
});

test('known threads are bounded by a 30-day TTL and a 500-entry cap', () => {
  const t0 = 1_000_000;
  rememberSlackThread('C1', '1.1', t0);
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 1000), true);
  assert.equal(isKnownSlackThread('C2', '1.1', t0), false, 'same ts in another channel');
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 29 * 24 * 60 * 60_000), true, 'a long task can still reply');
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 30 * 24 * 60 * 60_000), false, 'expired');
  for (let i = 0; i < 500; i++) rememberSlackThread('C9', `t${i}`, t0);
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 1000), false, 'oldest evicted past the cap');
  assert.equal(isKnownSlackThread('C9', 't499', t0 + 1000), true);
});

test('the reply endpoint refuses a thread no trigger opened', async (t) => {
  const server = new SlackReplyServer({ token: 'tok', getBotToken: () => 'xoxb-test' });
  const { port } = await server.start(0);
  t.after(() => server.stop());
  const r = await fetch(`http://127.0.0.1:${port}/reply`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-md-reply-token': 'tok' },
    body: JSON.stringify({ channel: 'CVICTIM', thread_ts: '9.9', text: 'hi' })
  });
  assert.equal(r.status, 403);
  assert.match((await r.json()).error, /only reply in a Slack thread/);
});
