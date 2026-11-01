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

const { getStatus } = loadTs('src/main/git.ts');
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
