'use strict';

// The loopback reply token is shared by every agent, so the endpoint only posts
// into channel:thread pairs that a verified inbound Slack trigger opened.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { SlackReplyServer, rememberSlackThread, isKnownSlackThread } = loadTs('src/main/slack.ts');

test('known threads are bounded by a 24h TTL and a 500-entry cap', () => {
  const t0 = 1_000_000;
  rememberSlackThread('C1', '1.1', t0);
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 1000), true);
  assert.equal(isKnownSlackThread('C2', '1.1', t0), false, 'same ts in another channel');
  assert.equal(isKnownSlackThread('C1', '1.1', t0 + 24 * 60 * 60_000), false, 'expired');
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
