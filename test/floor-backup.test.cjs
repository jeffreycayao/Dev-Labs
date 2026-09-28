'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const yauzl = require('yauzl');
const loadTs = require('./load-ts.cjs');
const { createFloorBackup, stageFloorData, restoreStagedFloor } = loadTs('src/main/floorBackup.ts');

function entriesOf(archive) {
  return new Promise((resolve, reject) => {
    yauzl.open(archive, { lazyEntries: true }, (error, zip) => {
      if (error) return reject(error);
      const found = new Map();
      zip.on('error', reject);
      zip.on('entry', (entry) => {
        zip.openReadStream(entry, (readError, stream) => {
          if (readError) return reject(readError);
          const chunks = [];
          stream.on('data', (chunk) => chunks.push(chunk));
          stream.on('error', reject);
          stream.on('end', () => { found.set(entry.fileName, Buffer.concat(chunks).toString()); zip.readEntry(); });
        });
      });
      zip.on('end', () => resolve(found));
      zip.readEntry();
    });
  });
}

test('floor backup ZIP contains the live roster, hive, palace and matching Claude transcript', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-floor-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  const projects = path.join(root, 'claude-projects');
  const sessionId = '12345678-1234-1234-1234-123456789abc';
  fs.mkdirSync(path.join(home, 'hive', 'agents', 'jim', '.codex', 'sessions'), { recursive: true });
  fs.mkdirSync(path.join(home, 'palace'), { recursive: true });
  fs.mkdirSync(path.join(projects, 'project-a'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'registry.json'), JSON.stringify({ agents: { jim: { sessionId } } }));
  fs.writeFileSync(path.join(home, 'hive', 'agents', 'jim', 'memory.md'), 'Jim remembers this');
  fs.writeFileSync(path.join(home, 'hive', 'agents', 'jim', '.codex', 'auth.json'), 'secret');
  fs.writeFileSync(path.join(home, 'roster.json'), '{"agents":[{"name":"Jim"}]}');
  fs.writeFileSync(path.join(home, 'palace', 'memory.json'), '{"remembered":true}');
  fs.writeFileSync(path.join(projects, 'project-a', `${sessionId}.jsonl`), '{"message":"hello"}\n');
  const archive = path.join(root, 'backup.zip');

  const result = await createFloorBackup(home, archive, projects);
  assert.equal(result.path, archive);
  assert.deepEqual(result.missingClaudeSessions, []);
  const files = await entriesOf(archive);
  assert.match(files.get('floor/hive/agents/jim/memory.md'), /Jim remembers this/);
  assert.match(files.get('floor/roster.json'), /Jim/);
  assert.match(files.get('floor/palace/memory.json'), /remembered/);
  assert.match(files.get(`claude-projects/project-a/${sessionId}.jsonl`), /hello/);
  assert.equal(files.has('floor/hive/agents/jim/.codex/auth.json'), false);
  assert.match(files.get('RESTORE.txt'), /Extract the contents of floor\//);
});

test('backup refuses a destination inside the floor and leaves it untouched', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-floor-backup-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(home, 'roster.json'), 'keep me');
  await assert.rejects(createFloorBackup(home, path.join(home, 'backup.zip'), path.join(root, 'projects')), /outside the floor/);
  assert.equal(fs.readFileSync(path.join(home, 'roster.json'), 'utf8'), 'keep me');
});

test('backup refuses to omit a Claude conversation but ignores other providers\' session IDs', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-floor-sessions-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const registry = path.join(home, 'hive', 'registry.json');
  fs.writeFileSync(registry, JSON.stringify({ agents: {
    claude: { provider: 'claude', sessionId: 'missing-claude-session' },
    codex: { provider: 'codex', sessionId: 'outside-claude' }
  } }));
  const archive = path.join(root, 'backup.zip');
  await assert.rejects(createFloorBackup(home, archive, path.join(root, 'projects')), /Cannot find 1 Claude session transcript/);
  assert.equal(fs.existsSync(archive), false);
  fs.writeFileSync(registry, JSON.stringify({ agents: { codex: { provider: 'codex', sessionId: 'outside-claude' } } }));
  await createFloorBackup(home, archive, path.join(root, 'projects'));
  assert.equal(fs.existsSync(archive), true);
});

test('an empty floor still produces a verified backup with restore instructions', async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-floor-empty-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  const archive = path.join(root, 'empty.zip');
  await createFloorBackup(home, archive, path.join(root, 'projects'));
  const files = await entriesOf(archive);
  assert.equal(files.has('floor/hive/'), true);
  assert.equal(files.has('floor-backup.json'), true);
});

test('floor reset staging moves only floor data and can roll back before deletion', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-floor-stage-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const home = path.join(root, 'home');
  fs.mkdirSync(path.join(home, 'hive'), { recursive: true });
  fs.writeFileSync(path.join(home, 'hive', 'tasks.json'), 'tasks');
  fs.writeFileSync(path.join(home, 'roster.json'), 'agents');
  fs.writeFileSync(path.join(home, 'config.json'), 'settings');
  const staged = stageFloorData(home);
  assert.equal(fs.existsSync(path.join(home, 'hive')), false);
  assert.equal(fs.existsSync(path.join(home, 'roster.json')), false);
  assert.equal(fs.readFileSync(path.join(home, 'config.json'), 'utf8'), 'settings');
  restoreStagedFloor(home, staged);
  assert.equal(fs.readFileSync(path.join(home, 'hive', 'tasks.json'), 'utf8'), 'tasks');
  assert.equal(fs.readFileSync(path.join(home, 'roster.json'), 'utf8'), 'agents');
});
