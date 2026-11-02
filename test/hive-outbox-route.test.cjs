'use strict';

// The outbox router archives a message before it routes it (so a failed move
// can't resend it every tick), and counts messages per conversation itself for
// the loop guard (an agent's own `hops` is ignored).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-outbox-route-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home });
  const outbox = path.join(hive.root(), 'agents', 'jim-1', 'outbox');
  const post = (name, msg) => fs.writeFileSync(path.join(outbox, name), JSON.stringify(msg));
  return { hive, outbox, post };
}

test('a message the router cannot archive is not delivered, let alone again and again', async (t) => {
  const { hive, outbox, post } = await floor(t);
  post('m1.json', { to: 'god-1', act: 'inform', subject: 'once' });
  // Block both the archive and the quarantine move: a folder already sits at each name.
  for (const name of ['m1.json', 'bad-m1.json']) {
    fs.mkdirSync(path.join(outbox, '.sent', name, 'x'), { recursive: true });
  }
  for (let i = 0; i < 3; i++) hive.routeOnce();
  assert.equal(hive.inbox('god-1').length, 0);

  fs.rmSync(path.join(outbox, '.sent', 'm1.json'), { recursive: true });
  hive.routeOnce();
  hive.routeOnce();
  assert.equal(hive.inbox('god-1').length, 1, 'delivered exactly once when the move works');
});

test('the loop guard counts a conversation itself and ignores the agent\'s hops', async (t) => {
  const { hive, post } = await floor(t);
  for (let i = 0; i < 45; i++) {
    post(`m${String(i).padStart(2, '0')}.json`, { to: 'god-1', act: 'inform', subject: `#${i}`, conversation: 'conv-loop', hops: 0 });
  }
  hive.routeOnce();
  assert.equal(hive.inbox('god-1').length, 40);
  assert.equal(hive.logTail(500).filter((e) => e.kind === 'drop' && e.reason === 'hop-cap').length, 5);
});

test('a hook frame speaks for the agent its token belongs to, not the one it names', async (t) => {
  const { hive } = await floor(t);
  const jim = hive.hookTokenFor('jim-1');
  assert.equal(hive.hookAgent('god-1', jim), 'jim-1', 'a valid token decides, whatever id is claimed');
  assert.equal(hive.hookAgent('god-1', undefined), undefined, 'no token: cannot claim an agent that has one');
  assert.equal(hive.hookAgent('god-1', 'forged'), undefined);
  assert.equal(hive.hookAgent('stopped-1', undefined), undefined, 'no token: not even for an agent never given one');
  // A respawn rotates the token; the old one stops working.
  hive.newHookToken('jim-1');
  assert.equal(hive.hookAgent('jim-1', jim), undefined);
});
