'use strict';

/**
 * A tasks.json / registry.json that exists but can't be parsed (a torn manual
 * edit, or a ledger past readPlain's 4 MB tail) used to read as the empty
 * fallback, and the next add/patch/spawn saved that fallback over it: the whole
 * board or roster gone. Read-modify-write paths must refuse instead.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager, readJsonStrict } = loadTs('src/main/hive.ts');

function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-json-corrupt-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  hive.ensureHive();
  return { hive, root: path.join(home, 'hive') };
}

const card = (id) => ({ id, title: id, status: 'todo', dependsOn: [], priority: 3, createdAt: '2026-11-21T00:00:00.000Z' });

test('a corrupt tasks.json is never overwritten by addTask / writeTasks / patchTask / deleteTask', (t) => {
  const { hive, root } = floor(t);
  const file = path.join(root, 'tasks.json');
  const broken = '{"tasks": [{"id": "keep-me", "title": "half a car';
  fs.writeFileSync(file, broken);

  assert.throws(() => hive.addTask(card('new')));
  assert.throws(() => hive.writeTasks([card('new')]));
  assert.throws(() => hive.patchTask('keep-me', { status: 'done' }));
  assert.throws(() => hive.deleteTask('keep-me'));
  assert.equal(fs.readFileSync(file, 'utf8'), broken);
});

test('a tasks.json larger than the 4 MB tail cap still round-trips', (t) => {
  const { hive, root } = floor(t);
  const big = Array.from({ length: 12 }, (_, i) => ({ ...card(`c${i}`), description: 'x'.repeat(500_000) }));
  fs.writeFileSync(path.join(root, 'tasks.json'), JSON.stringify({ tasks: big }));
  assert.equal(hive.addTask(card('new')), true);
  const ids = JSON.parse(fs.readFileSync(path.join(root, 'tasks.json'), 'utf8')).tasks.map((c) => c.id);
  assert.equal(ids.length, 13);
  assert.ok(ids.includes('c0') && ids.includes('new'));
});

test('a corrupt registry.json is left alone by registry writers', (t) => {
  const { hive, root } = floor(t);
  const file = path.join(root, 'registry.json');
  const broken = '{"godId": "ramon", "agents": {';
  fs.writeFileSync(file, broken);
  const quiet = t.mock.method(console, 'error', () => {});

  assert.equal(hive.setArchived('ramon', true), false);
  hive.setStopped('ramon');
  hive.recordSession('ramon', 'abc123');
  assert.equal(hive.renameAgent('ramon', 'R').ok, false);
  assert.equal(hive.setAgentHold('ramon', true).ok, false);
  assert.equal(hive.patchAgentRole('ramon', 'boss').ok, false);
  assert.equal(fs.readFileSync(file, 'utf8'), broken);
  quiet.mock.restore();
});

test('readJsonStrict: fallback only for a missing file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-json-strict-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  assert.deepEqual(readJsonStrict(path.join(dir, 'missing.json'), { a: 1 }), { a: 1 });
  fs.writeFileSync(path.join(dir, 'ok.json'), '{"b":2}');
  assert.deepEqual(readJsonStrict(path.join(dir, 'ok.json'), {}), { b: 2 });
  fs.writeFileSync(path.join(dir, 'bad.json'), '{');
  assert.throws(() => readJsonStrict(path.join(dir, 'bad.json'), {}));
  fs.mkdirSync(path.join(dir, 'dir.json'));
  assert.throws(() => readJsonStrict(path.join(dir, 'dir.json'), {}));
});
