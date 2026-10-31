/**
 * Main writes into folders agents can write (each agent folder, and the hive
 * root holding all of them) while running unsandboxed. An agent that plants a
 * symlink or junction there must not be able to make main write through it,
 * delete through it, or copy a secret through it. Every case below plants a
 * link to a "victim" folder or file outside the hive and checks the victim is
 * untouched afterwards. Junctions on Windows, like third-party-skills.test.cjs.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');

function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-links-'));
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = process.env.USERPROFILE = path.join(base, 'user');
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
    fs.rmSync(base, { recursive: true, force: true });
  });
  const harness = path.join(base, 'harness');
  const victim = path.join(base, 'victim');
  fs.mkdirSync(victim, { recursive: true });
  fs.writeFileSync(path.join(victim, 'keep.txt'), 'precious');
  return { harness, victim, hive: new HiveManager(() => harness), root: path.join(harness, 'hive') };
}
const dirLink = (target, at) => {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
};
// File links need Developer Mode or admin on Windows; skip there when refused.
const fileLink = (t, target, at) => {
  try { fs.symlinkSync(target, at, 'file'); return true; }
  catch (e) { if (e.code === 'EPERM') { t.skip('file symlinks not permitted here'); return false; } throw e; }
};
const untouched = (victim) => assert.deepEqual(fs.readdirSync(victim), ['keep.txt']);
const isLink = (p) => fs.lstatSync(p).isSymbolicLink();

test('file links in an agent folder are replaced, never written through', async (t) => {
  const { hive, victim, root } = setup(t);
  const meta = { id: 'eve-1', name: 'Eve', provider: 'claude', cwd: victim };
  await hive.ensureAgent(meta, {});
  const dir = path.join(root, 'agents', 'eve-1');
  const secret = 'webcake-jwt-DO-NOT-LEAK';
  const opts = { mcpDefaults: { 'webcake-landing': { enabled: true } }, mcpSecret: () => secret, mcpBroker: { url: 'http://127.0.0.1:5555', token: 'cap' } };
  for (const name of ['identity.md', 'mcp.json', 'settings.json', '.gitignore']) {
    fs.rmSync(path.join(dir, name), { force: true });
    if (!fileLink(t, path.join(victim, 'keep.txt'), path.join(dir, name))) return;
  }
  // memory.md is only seeded when absent: a dangling link must not get it created.
  fs.rmSync(path.join(dir, 'memory.md'));
  fileLink(t, path.join(victim, 'made.md'), path.join(dir, 'memory.md'));

  const inj = await hive.ensureAgent(meta, opts);
  assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'precious');
  untouched(victim);
  for (const name of ['identity.md', 'mcp.json', 'settings.json', '.gitignore']) {
    assert.equal(isLink(path.join(dir, name)), false, name);
  }
  assert.ok(fs.readFileSync(path.join(dir, 'mcp.json'), 'utf8').includes(secret), 'key written to the real mcp.json');
  assert.equal(inj.args[inj.args.indexOf('--mcp-config') + 1], path.join(dir, 'mcp.json'));
});

test('a linked agent folder is rebuilt as a real folder before anything is written', async (t) => {
  const { hive, victim, root } = setup(t);
  hive.ensureHive();
  dirLink(victim, path.join(root, 'agents', 'eve-1'));
  await hive.ensureAgent({ id: 'eve-1', name: 'Eve', provider: 'claude', cwd: victim }, {});
  untouched(victim);
  assert.equal(isLink(path.join(root, 'agents', 'eve-1')), false);
  assert.ok(fs.existsSync(path.join(root, 'agents', 'eve-1', 'identity.md')));
});

test('a linked inbox of another agent cannot capture its mail', async (t) => {
  const { hive, victim, root } = setup(t);
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: victim }, {});
  const inbox = path.join(root, 'agents', 'jim-1', 'inbox');
  fs.rmSync(inbox, { recursive: true });
  dirLink(victim, inbox);
  hive.send({ to: 'jim-1', act: 'inform', subject: 'hi' }, 'god-1');
  untouched(victim);
  assert.equal(isLink(inbox), false);
  assert.equal(fs.readdirSync(inbox).filter((f) => f.endsWith('.json')).length, 1);
});

test('a linked outbox archive cannot make main move files outside the hive', async (t) => {
  const { hive, victim, root } = setup(t);
  await hive.ensureAgent({ id: 'eve-1', name: 'Eve', provider: 'claude', cwd: victim }, {});
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: victim }, {});
  const outbox = path.join(root, 'agents', 'eve-1', 'outbox');
  fs.rmSync(path.join(outbox, '.sent'), { recursive: true });
  dirLink(victim, path.join(outbox, '.sent'));
  fs.writeFileSync(path.join(outbox, 'm1.json'), JSON.stringify({ to: 'jim-1', act: 'inform', subject: 'x' }));
  assert.equal(hive.routeOnce(), 1);
  untouched(victim);
  assert.ok(fs.existsSync(path.join(outbox, '.sent', 'm1.json')));

  // A whole outbox that is a link is skipped: main never touches what it points to.
  fs.writeFileSync(path.join(victim, 'm2.json'), JSON.stringify({ to: 'jim-1', act: 'inform', subject: 'y' }));
  fs.rmSync(outbox, { recursive: true });
  dirLink(victim, outbox);
  assert.equal(hive.routeOnce(), 0);
  assert.deepEqual(fs.readdirSync(victim).sort(), ['keep.txt', 'm2.json']);
});

test('a linked provider config folder gets no hive config written into it', async (t) => {
  const { hive, victim, root } = setup(t);
  const meta = { id: 'cody-1', name: 'Cody', provider: 'codex', cwd: victim };
  await hive.ensureAgent(meta, {});
  const codexHome = path.join(root, 'agents', 'cody-1', '.codex');
  fs.rmSync(codexHome, { recursive: true, force: true });
  dirLink(victim, codexHome);
  await hive.ensureAgent(meta, {});
  untouched(victim);
  assert.equal(isLink(codexHome), false);
  assert.ok(fs.existsSync(path.join(codexHome, 'config.toml')));
});

test('hive-root files and folders: a linked bin/ or log is replaced, not followed', async (t) => {
  const { hive, victim, root } = setup(t);
  hive.ensureHive();
  fs.rmSync(path.join(root, 'bin'), { recursive: true });
  dirLink(victim, path.join(root, 'bin'));
  hive.ensureHive();
  untouched(victim);
  assert.equal(isLink(path.join(root, 'bin')), false);
  assert.ok(fs.existsSync(hive.shimPath()));

  fs.rmSync(path.join(root, 'log.jsonl'));
  if (!fileLink(t, path.join(victim, 'keep.txt'), path.join(root, 'log.jsonl'))) return;
  hive.appendLog({ kind: 'probe' });
  assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'precious');
  assert.equal(isLink(path.join(root, 'log.jsonl')), false);
  assert.match(fs.readFileSync(path.join(root, 'log.jsonl'), 'utf8'), /"probe"/);
});

test('a message id with a path in it cannot place the inbox file elsewhere', async (t) => {
  const { hive, victim, root } = setup(t);
  await hive.ensureAgent({ id: 'eve-1', name: 'Eve', provider: 'claude', cwd: victim }, {});
  await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: victim }, {});
  const outbox = path.join(root, 'agents', 'eve-1', 'outbox');
  const escape = path.relative(path.join(root, 'agents', 'jim-1', 'inbox'), path.join(victim, 'pwned'));
  fs.writeFileSync(path.join(outbox, 'm1.json'), JSON.stringify({ id: escape, to: 'jim-1', act: 'inform', subject: 'x' }));
  assert.equal(hive.routeOnce(), 1);
  untouched(victim);
  assert.equal(fs.readdirSync(path.join(root, 'agents', 'jim-1', 'inbox')).filter((f) => f.endsWith('.json')).length, 1);
});

test('a hard-linked log is replaced, not appended to', (t) => {
  const { hive, victim, root } = setup(t);
  hive.ensureHive();
  const log = path.join(root, 'log.jsonl');
  fs.rmSync(log);
  try { fs.linkSync(path.join(victim, 'keep.txt'), log); }
  catch (e) { if (e.code === 'EXDEV' || e.code === 'EPERM') return t.skip('hard links not possible here'); throw e; }
  hive.appendLog({ kind: 'probe' });
  assert.equal(fs.readFileSync(path.join(victim, 'keep.txt'), 'utf8'), 'precious');
  assert.match(fs.readFileSync(log, 'utf8'), /"probe"/);
});

test('an agent id that climbs out of agents/ is refused', async (t) => {
  const { hive, victim } = setup(t);
  await assert.rejects(hive.ensureAgent({ id: '..', name: 'X', provider: 'claude', cwd: victim }, {}), /refusing path part/);
});
