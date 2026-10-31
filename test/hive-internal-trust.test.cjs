'use strict';

/**
 * Every sandboxed agent may write the whole hive root. Two things main runs or
 * trusts OUTSIDE the sandbox used to live there: the hook shims (`bin/`, run by
 * the agent CLIs as hooks) and the hive's git dir (`.git`, where main runs
 * `git commit` with its hooks and config live). They now live in
 * `<home>/hive-internal/`. These tests plant what an agent could plant and check
 * main neither runs nor uses it.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { HiveManager } = loadTs('src/main/hive.ts');

function setup(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-internal-'));
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = process.env.USERPROFILE = path.join(base, 'user');
  const home = path.join(base, 'harness');
  const markers = path.join(base, 'markers');
  fs.mkdirSync(markers, { recursive: true });
  const hive = new HiveManager(() => home);
  t.after(() => {
    hive.stopRouter();
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
    fs.rmSync(base, { recursive: true, force: true });
  });
  return { home, root: path.join(home, 'hive'), markers, hive };
}

const inside = (dir, p) => {
  const rel = path.relative(dir, p);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};
const git = (args, opts) => spawnSync('git', args, { encoding: 'utf8', ...opts });
const hiveGit = (home, ...args) => git([
  `--git-dir=${path.join(home, 'hive-internal', 'git')}`, `--work-tree=${path.join(home, 'hive')}`, ...args
]);

/** A shell script that, if anyone runs it, leaves `<markers>/<name>` behind. */
function plantScript(file, markers, name) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = path.join(markers, name).replace(/\\/g, '/');
  fs.writeFileSync(file, `#!/bin/sh\necho ran > "${out}"\n`, { mode: 0o755 });
}
const ran = (markers) => fs.readdirSync(markers);

test('nothing main runs or commits through sits under a dir the agent may write', async (t) => {
  const { home, root, hive } = setup(t);
  await hive.ensureAgent({ id: 'w1', name: 'W', provider: 'claude', cwd: path.join(home, 'proj') }, {});
  const settings = JSON.parse(fs.readFileSync(path.join(root, 'agents', 'w1', 'settings.json'), 'utf8'));
  const writable = settings.sandbox.filesystem.allowWrite;
  assert.ok(writable.includes(root), 'the protocol still needs the hive root writable');

  const trusted = [
    hive.shimPath(), hive.runtimeBinDir(), hive.nodeCommand(),
    path.join(home, 'hive-internal', 'git'), path.join(home, 'hive-internal', 'no-hooks')
  ];
  for (const p of trusted) {
    assert.ok(fs.existsSync(p), `${p} should be written by bootstrap`);
    for (const w of writable) assert.ok(!inside(w, p), `${p} is agent-writable via ${w}`);
  }
  // The hooks the CLI runs point at the private shim, not one an agent can edit.
  const cmd = settings.hooks.Stop[0].hooks[0].command;
  assert.ok(cmd.includes(hive.shimPath()), cmd);
  assert.ok(!cmd.includes(path.join(root, 'bin')), cmd);
});

test('an edited shim in the hive root is never what a hook runs', async (t) => {
  const { home, root, markers, hive } = setup(t);
  hive.ensureHive();
  // What an agent could do before: overwrite the shim and the node launcher.
  plantScript(path.join(root, 'bin', 'cth-hook.cjs'), markers, 'shim');
  plantScript(path.join(root, 'bin', 'hive-node'), markers, 'launcher');
  await hive.ensureAgent({ id: 'w1', name: 'W', provider: 'claude', cwd: path.join(home, 'proj') }, {});
  const settings = fs.readFileSync(path.join(root, 'agents', 'w1', 'settings.json'), 'utf8');
  assert.ok(!settings.includes(JSON.stringify(path.join(root, 'bin')).slice(1, -1)), 'no hook refers to <root>/bin');
  assert.equal(fs.readFileSync(hive.shimPath(), 'utf8').includes('echo ran'), false);
});

test('a hook, hooksPath or fsmonitor planted in an old in-tree .git is not run by commit', async (t) => {
  const { home, root, markers, hive } = setup(t);
  // A hive from before hive-internal existed: its git dir sits in the root.
  fs.mkdirSync(root, { recursive: true });
  fs.writeFileSync(path.join(root, 'board.md'), 'old board\n');
  assert.equal(git(['init', '-q'], { cwd: root }).status, 0);
  git(['add', '-A'], { cwd: root });
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'old history'], { cwd: root });

  // What a sandboxed agent could plant there, since the root was writable.
  plantScript(path.join(root, '.git', 'hooks', 'pre-commit'), markers, 'git-hooks');
  plantScript(path.join(root, 'agents', 'evil', 'hooks', 'pre-commit'), markers, 'hooks-path');
  plantScript(path.join(root, 'agents', 'evil', 'fsmon'), markers, 'fsmonitor');
  git(['config', 'core.hooksPath', path.join(root, 'agents', 'evil', 'hooks').replace(/\\/g, '/')], { cwd: root });
  git(['config', 'core.fsmonitor', path.join(root, 'agents', 'evil', 'fsmon').replace(/\\/g, '/')], { cwd: root });

  // Control: plain git in that repo does run the planted hook.
  fs.writeFileSync(path.join(root, 'probe.txt'), 'x');
  git(['add', 'probe.txt'], { cwd: root });
  git(['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'control'], { cwd: root });
  assert.ok(ran(markers).includes('hooks-path'), 'control: the planted hooksPath hook should run under plain git');
  for (const m of ran(markers)) fs.rmSync(path.join(markers, m));

  hive.ensureHive(); // adopts the old .git into hive-internal/
  assert.equal(fs.existsSync(path.join(root, '.git')), false, 'the in-tree git dir is moved out');
  fs.writeFileSync(path.join(root, 'board.md'), 'new board\n');
  hive.commit('after');
  hive.flushCommit();

  assert.deepEqual(ran(markers), [], 'main ran a planted git hook or fsmonitor');
  const log = hiveGit(home, 'log', '--format=%s').stdout;
  assert.match(log, /old history/, 'history survives the move');
  assert.match(log, /^after/m, 'and main still commits');
});

test('an agent re-creating <root>/.git, or poisoning the private config, changes nothing', async (t) => {
  const { home, root, markers, hive } = setup(t);
  hive.ensureHive();
  hive.flushCommit();
  plantScript(path.join(root, '.git', 'hooks', 'pre-commit'), markers, 'tree-git');
  fs.writeFileSync(path.join(root, '.git', 'config'), '[core]\n\tbare = true\n');
  // Belt and braces: even a hooksPath/fsmonitor that reached the real config is overridden.
  const cfg = path.join(home, 'hive-internal', 'git', 'config');
  plantScript(path.join(home, 'evil', 'pre-commit'), markers, 'private-config');
  plantScript(path.join(home, 'evil', 'fsmon'), markers, 'private-fsmonitor');
  git(['config', '--file', cfg, 'core.hooksPath', path.join(home, 'evil').replace(/\\/g, '/')]);
  git(['config', '--file', cfg, 'core.fsmonitor', path.join(home, 'evil', 'fsmon').replace(/\\/g, '/')]);

  fs.writeFileSync(path.join(root, 'board.md'), 'changed\n');
  hive.commit('changed');
  hive.flushCommit();

  assert.deepEqual(ran(markers), []);
  assert.match(hiveGit(home, 'log', '-1', '--format=%s').stdout, /^changed/);
  assert.equal(hiveGit(home, 'ls-files', '--', '.git').stdout.trim(), '', 'a planted .git is never committed');
});
