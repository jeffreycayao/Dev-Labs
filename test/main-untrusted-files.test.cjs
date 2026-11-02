'use strict';

// The main process reads and runs git in folders agents can write. A repo's own
// config must not make DevLabs run a command, and an oversized hive file must
// not be read whole.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { getStatus, checkoutRef, addWorktree } = loadTs('src/main/git.ts');
const { readPlain } = loadTs('src/main/hive.ts');

test('git status never runs a core.fsmonitor command from the repo config', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'md-fsmonitor-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const marker = path.join(repo, 'ran.txt');
  execFileSync('git', ['init', '-q'], { cwd: repo });
  // An fsmonitor hook is a command git runs on every index refresh.
  const hook = path.join(repo, 'hook.js');
  fs.writeFileSync(hook, `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`);
  const cmd = `"${process.execPath.replace(/\\/g, '/')}" "${hook.replace(/\\/g, '/')}"`;
  execFileSync('git', ['config', 'core.fsmonitor', cmd], { cwd: repo });
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  // git only consults fsmonitor once there is an index.
  execFileSync('git', ['-c', 'core.fsmonitor=false', 'add', 'a.txt'], { cwd: repo });

  const status = await getStatus(repo);
  assert.ok(!('error' in status), JSON.stringify(status));
  assert.deepEqual(status.untracked, ['hook.js']);
  assert.equal(fs.existsSync(marker), false, 'the planted fsmonitor command ran');

  // Control: plain git does run it, so the check above means something.
  execFileSync('git', ['status', '--porcelain'], { cwd: repo, stdio: 'ignore' });
  assert.equal(fs.existsSync(marker), true, 'control: git should run the planted command');
});

test('status, switch and worktree add never run a planted filter or hook', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'md-filter-'));
  const wt = `${repo}-wt`;
  t.after(() => { fs.rmSync(repo, { recursive: true, force: true }); fs.rmSync(wt, { recursive: true, force: true }); });
  const g = (args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  const fwd = (p) => p.replace(/\\/g, '/');
  const mark = (name) => path.join(repo, '.git', `ran-${name}`);
  g(['init', '-q', '-b', 'main']);
  g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
  g(['add', 'a.txt']); g(['commit', '-qm', 'init']); g(['branch', 'other']);
  // A pass-through filter that leaves a marker, so it runs without breaking git.
  const filter = path.join(repo, '.git', 'filter.js');
  fs.writeFileSync(filter, `require('fs').writeFileSync(process.argv[2], 'x'); process.stdin.pipe(process.stdout);`);
  const node = `"${fwd(process.execPath)}" "${fwd(filter)}"`;
  g(['config', 'filter.evil.clean', `${node} "${fwd(mark('clean'))}"`]);
  g(['config', 'filter.evil.smudge', `${node} "${fwd(mark('smudge'))}"`]);
  fs.writeFileSync(path.join(repo, '.git', 'info', 'attributes'), '*.txt filter=evil\n');
  fs.writeFileSync(path.join(repo, '.git', 'hooks', 'post-checkout'), `#!/bin/sh\necho x > "${fwd(mark('hook'))}"\n`, { mode: 0o755 });
  const ran = () => ['clean', 'smudge', 'hook'].filter((n) => fs.existsSync(mark(n)));

  fs.utimesSync(path.join(repo, 'a.txt'), new Date(), new Date(Date.now() + 5000)); // stat-dirty: status re-cleans it
  const status = await getStatus(repo);
  assert.ok(!('error' in status), JSON.stringify(status));
  assert.deepEqual((await checkoutRef(repo, 'other', false)).ok, true);
  assert.deepEqual((await addWorktree(repo, wt, 'main')).ok, true);
  assert.deepEqual(ran(), [], 'a planted filter or hook ran');

  // Control: plain git runs all three, so the check above means something.
  g(['switch', '-q', 'main']);
  fs.rmSync(path.join(repo, 'a.txt'));
  g(['checkout', '--', 'a.txt']);
  fs.utimesSync(path.join(repo, 'a.txt'), new Date(), new Date(Date.now() + 10000));
  g(['status', '--porcelain']);
  assert.deepEqual(ran(), ['clean', 'smudge', 'hook']);
});

test('an agent cannot redefine the lfs filter to run its own command', async (t) => {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'md-lfs-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  const marker = path.join(repo, '.git', 'ran');
  const g = (args) => execFileSync('git', args, { cwd: repo, stdio: 'pipe' });
  g(['init', '-q']); g(['config', 'user.email', 't@t']); g(['config', 'user.name', 't']);
  fs.writeFileSync(path.join(repo, 'a.bin'), 'a');
  g(['add', 'a.bin']); g(['commit', '-qm', 'init']);
  // git prefers a filter's long-running `process` command, so that is the one to hijack.
  g(['config', 'filter.lfs.process', `"${process.execPath.replace(/\\/g, '/')}" -e "require('fs').writeFileSync(process.argv[1], 'x'); process.exit(1)" "${marker.replace(/\\/g, '/')}"`]);
  fs.writeFileSync(path.join(repo, '.git', 'info', 'attributes'), '*.bin filter=lfs\n');
  const touch = (ms) => fs.utimesSync(path.join(repo, 'a.bin'), new Date(), new Date(Date.now() + ms));
  touch(5000);
  // With git-lfs missing, the pinned real command fails status; either way the planted one never runs.
  await getStatus(repo);
  assert.equal(fs.existsSync(marker), false);
  // Control: plain git runs it.
  touch(10000);
  try { g(['status', '--porcelain']); } catch { /* the planted filter exits 1 */ }
  assert.equal(fs.existsSync(marker), true);
});

test('a repo whose own config includes other files gets no work-tree git at all', async (t) => {
  // An includeIf can name a filter that applies only in the new worktree, where
  // the filter read can't see it; so such a repo is refused, not half-guarded.
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'md-include-'));
  t.after(() => fs.rmSync(repo, { recursive: true, force: true }));
  execFileSync('git', ['init', '-q'], { cwd: repo });
  execFileSync('git', ['config', 'includeIf.gitdir:**/agent-wt/**.path', 'evil.cfg'], { cwd: repo });
  const status = await getStatus(repo);
  assert.match(status.error ?? '', /includes other config files/);
  assert.equal((await addWorktree(repo, path.join(repo, '..', 'agent-wt'), 'main')).ok, false);
});

test('readPlain keeps only the newest 4 MB of an oversized file', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-readplain-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const p = path.join(dir, 'memory.md');
  fs.writeFileSync(p, 'old\n'.repeat(1024 * 1024) + 'NEWEST');
  const text = readPlain(p);
  assert.equal(text.length, 4 * 1024 * 1024);
  assert.ok(text.endsWith('NEWEST'));
  assert.equal(readPlain(dir), '', 'a folder is not read');
  assert.equal(readPlain(path.join(dir, 'missing.md')), '');
});
