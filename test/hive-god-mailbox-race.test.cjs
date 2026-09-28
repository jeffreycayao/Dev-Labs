'use strict';

/**
 * Regression for HIVE-3 — the first scheduler standup after app-start was
 * dropped because the god's mailbox did not exist yet. On a cold start the
 * scheduler's first tick can fire seconds BEFORE ensureAgent runs for the god;
 * the inbox mkdir AND the registry write both live inside ensureAgent, so at
 * that instant the god is registered nowhere and only resolvable via the
 * godId fallback. `deliver()` returned false for the missing inbox and — god
 * being the bounce target itself — the standup was dropped with no bounce.
 *
 * The fix makes the god mailbox a floor invariant: delivery to the godId
 * address creates `agents/<godId>/inbox/.done` on demand instead of dropping.
 * Unregistered NON-god ids must keep dropping (a stale registry entry must
 * never acquire a mailbox) — that guard lives in
 * hive-unknown-recipient.test.cjs and is re-pinned here for this change.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-god-race-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Michael', provider: 'claude', cwd: home, isGod: true });
  return { home, hive };
}

const entries = (hive, kind) => hive.logTail(500).filter((e) => e.kind === kind);

test('scheduler mail to an UNREGISTERED god (cold-start race) is delivered, not dropped', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-god-cold-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  // Bootstrap the hive skeleton WITHOUT registering the god — a worker spawned
  // first leaves godId null, so 'god' resolves via the fallback literal. This
  // is the exact shape of the first scheduler tick on a brand-new floor.
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: home });

  hive.send({ to: 'god', act: 'request', subject: 'Hourly ops standup', body: 'review the floor' }, 'scheduler');

  const [msg] = entries(hive, 'message');
  assert.deepEqual(msg.delivered, ['god'], 'the standup must take delivery into the created mailbox');
  assert.equal(entries(hive, 'drop').filter((e) => e.reason === 'no-inbox').length, 0, 'no drop for the god address');
  const inboxDir = path.join(hive.root(), 'agents', 'god', 'inbox');
  assert.ok(fs.existsSync(path.join(inboxDir, '.done')), 'the mailbox is created with its .done dir');
  assert.equal(hive.inbox('god').length, 1, 'the message is in the god inbox, readable pre-spawn');

  // The later god spawn adopts the same dir (ensureAgent is idempotent) and
  // must not disturb the mail that already arrived.
  await hive.ensureAgent({ id: 'god', name: 'Ramon', provider: 'claude', cwd: home, isGod: true });
  assert.equal(hive.inbox('god').length, 1, 'the pre-spawn standup survives the god spawn');
});

test('mail to a REGISTERED god whose dir is missing is delivered, not dropped', async (t) => {
  const { hive } = await floor(t);
  // Restart shape: registry.json persists the god, but the agent dir is gone.
  fs.rmSync(path.join(hive.root(), 'agents', 'god-1'), { recursive: true, force: true });

  hive.send({ to: 'god-1', act: 'request', subject: 'Hourly ops standup', body: 'review the floor' }, 'scheduler');

  const [msg] = entries(hive, 'message');
  assert.deepEqual(msg.delivered, ['god-1']);
  assert.equal(entries(hive, 'drop').filter((e) => e.reason === 'no-inbox').length, 0);
  assert.equal(hive.inbox('god-1').length, 1);
});

test('a stale non-god registry entry still drops and never acquires a mailbox', async (t) => {
  const { hive } = await floor(t);
  const reg = JSON.parse(fs.readFileSync(path.join(hive.root(), 'registry.json'), 'utf8'));
  reg.agents['ghost-1'] = { id: 'ghost-1', name: 'Ghost', provider: 'claude', cwd: '.' };
  fs.writeFileSync(path.join(hive.root(), 'registry.json'), JSON.stringify(reg, null, 2));

  hive.send({ to: 'ghost-1', act: 'inform', subject: 'are you there' }, 'god-1');

  const [msg] = entries(hive, 'message');
  assert.deepEqual(msg.delivered, [], 'a ghost takes no delivery');
  assert.equal(entries(hive, 'drop').filter((e) => e.reason === 'no-inbox' && e.to === 'ghost-1').length, 1);
  assert.ok(!fs.existsSync(path.join(hive.root(), 'agents', 'ghost-1')), 'no mailbox is created for a ghost');
});
