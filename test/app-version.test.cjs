'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { bumpVersion, compareVersions } = require('../tools/app-version.cjs');

function run(command, args, cwd, input) {
  const result = spawnSync(command, args, { cwd, input, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

function git(root, ...args) {
  const result = run('git', args, root);
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}

test('version levels follow Major.Minor.Patch', () => {
  assert.equal(bumpVersion('1.2.3', 'patch'), '1.2.4');
  assert.equal(bumpVersion('1.2.3', 'minor'), '1.3.0');
  assert.equal(bumpVersion('1.2.3', 'major'), '2.0.0');
  assert.equal(compareVersions('1.3.0', '1.2.99'), 1);
  assert.throws(() => bumpVersion('v1.2.3', 'patch'), /Invalid app version/);
});

test('push check requires a committed version bump and matching lockfile', (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'jepoy-version-rule-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'tools'));
  fs.copyFileSync(path.join(__dirname, '..', 'tools', 'app-version.cjs'), path.join(root, 'tools', 'app-version.cjs'));
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ name: 'test', version: '0.0.1' }));
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify({ version: '0.0.1', packages: { '': { version: '0.0.1' } } }));
  git(root, 'init', '-q', '-b', 'main');
  git(root, 'add', '.');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'base');
  const base = git(root, 'rev-parse', 'HEAD');

  fs.writeFileSync(path.join(root, 'README.md'), 'changed\n');
  git(root, 'add', 'README.md');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'docs');
  let check = run(process.execPath, ['tools/app-version.cjs', 'check', base, 'HEAD'], root);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /must increase on every source push/);

  let bump = run(process.execPath, ['tools/app-version.cjs', 'bump', 'minor'], root);
  assert.equal(bump.status, 0, bump.stderr);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, 'package.json'))).version, '0.1.0');
  git(root, 'add', 'package.json', 'package-lock.json');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'version');
  check = run(process.execPath, ['tools/app-version.cjs', 'check', base, 'HEAD'], root);
  assert.equal(check.status, 0, check.stderr);
  assert.match(check.stdout, /0\.0\.1 → 0\.1\.0/);

  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
  lock.packages[''].version = '0.0.1';
  fs.writeFileSync(path.join(root, 'package-lock.json'), JSON.stringify(lock));
  git(root, 'add', 'package-lock.json');
  git(root, '-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'bad lock');
  check = run(process.execPath, ['tools/app-version.cjs', 'check', base, 'HEAD'], root);
  assert.equal(check.status, 1);
  assert.match(check.stderr, /package-lock.json must also have version/);
});
