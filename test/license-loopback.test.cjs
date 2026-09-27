'use strict';

// The real RFC 8252 loopback listener (src/main/licenseLoopback.ts) over real
// HTTP on 127.0.0.1: only GET /callback is answered, a dropped callback keeps
// it open, and the first real callback shuts it down.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { startLoopbackListener } = loadTs('src/main/licenseLoopback.ts');

test('loopback listener: 127.0.0.1 only, GET /callback only, one-shot', async () => {
  const seen = [];
  let answer = { enforced: true, state: 'signing_in' };
  let focused = 0;
  const l = await startLoopbackListener(async (url) => { seen.push(url); return answer; }, { onDone: () => { focused++; } });
  const m = /^http:\/\/127\.0\.0\.1:(\d+)\/callback$/.exec(l.redirectUri);
  assert.ok(m, l.redirectUri);
  const base = `http://127.0.0.1:${m[1]}`;

  assert.equal((await fetch(`${base}/favicon.ico`)).status, 404);
  assert.equal((await fetch(`${base}/callback`, { method: 'POST' })).status, 404);
  assert.equal(seen.length, 0, 'noise never reaches the sign-in handler');

  // A dropped callback (wrong state) leaves the listener waiting.
  const dropped = await fetch(`${base}/callback?code=x&state=forged`);
  assert.equal(dropped.status, 200);
  assert.match(await dropped.text(), /did not finish/);
  assert.equal(focused, 0);

  answer = { enforced: true, state: 'licensed' };
  const ok = await fetch(`${base}/callback?code=c1&state=s1`);
  const body = await ok.text();
  assert.equal(ok.status, 200);
  assert.match(body, /You&#39;re signed in/);
  assert.match(ok.headers.get('content-security-policy'), /default-src 'none'/);
  assert.equal(seen.at(-1), `${base}/callback?code=c1&state=s1`);
  assert.equal(focused, 1, 'the app window is brought forward');

  await assert.rejects(fetch(`${base}/callback?code=c2&state=s1`), 'closed after the first real callback');
  l.close(); // idempotent
});

test('loopback listener: close() before any callback frees the port', async () => {
  const l = await startLoopbackListener(async () => ({ enforced: true, state: 'licensed' }));
  const base = l.redirectUri.replace('/callback', '');
  l.close();
  await assert.rejects(fetch(`${base}/callback?code=a&state=b`));
});
