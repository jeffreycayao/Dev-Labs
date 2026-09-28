#!/usr/bin/env node
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const ZERO_SHA = /^0+$/;
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;

function parseVersion(value) {
  const match = VERSION.exec(value);
  if (!match) throw new Error(`Invalid app version "${value}". Use Major.Minor.Patch (for example 1.2.3).`);
  const parts = match.slice(1).map(Number);
  if (parts.some((n) => !Number.isSafeInteger(n))) throw new Error(`App version "${value}" is too large.`);
  return parts;
}

function compareVersions(a, b) {
  const left = parseVersion(a);
  const right = parseVersion(b);
  for (let i = 0; i < 3; i++) {
    if (left[i] !== right[i]) return left[i] < right[i] ? -1 : 1;
  }
  return 0;
}

function bumpVersion(value, level) {
  const [major, minor, patch] = parseVersion(value);
  if (level === 'major') return `${major + 1}.0.0`;
  if (level === 'minor') return `${major}.${minor + 1}.0`;
  if (level === 'patch') return `${major}.${minor}.${patch + 1}`;
  throw new Error('Choose patch, minor or major.');
}

function git(...args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function versionAt(revision, file) {
  return JSON.parse(git('show', `${revision}:${file}`)).version;
}

function checkLock(version, lock) {
  if (lock.version !== version || lock.packages?.['']?.version !== version) {
    throw new Error(`package-lock.json must also have version ${version} at the root and packages[""].`);
  }
}

function resolveBase(base, head) {
  if (base && !ZERO_SHA.test(base)) return base;
  const main = git('rev-parse', '--verify', 'refs/remotes/origin/main');
  return git('merge-base', head, main);
}

function checkPush(base, head = 'HEAD') {
  const previous = resolveBase(base, head);
  if (git('rev-parse', previous) === git('rev-parse', head)) return 'No new commits to push.';
  const oldVersion = versionAt(previous, 'package.json');
  const newVersion = versionAt(head, 'package.json');
  parseVersion(newVersion);
  checkLock(newVersion, JSON.parse(git('show', `${head}:package-lock.json`)));
  if (compareVersions(newVersion, oldVersion) <= 0) {
    throw new Error(`App version must increase on every source push: ${oldVersion} → ${newVersion}. Run npm run version:patch, version:minor or version:major, then commit the version files.`);
  }
  return `App version increased: ${oldVersion} → ${newVersion}.`;
}

function bumpFiles(level) {
  const pkgPath = path.join(root, 'package.json');
  const lockPath = path.join(root, 'package-lock.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  checkLock(pkg.version, lock);
  const next = bumpVersion(pkg.version, level);
  pkg.version = next;
  lock.version = next;
  lock.packages[''].version = next;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
  return next;
}

function prePush() {
  const lines = fs.readFileSync(0, 'utf8').trim().split(/\r?\n/).filter(Boolean);
  for (const line of lines) {
    const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
    if (!localRef || !localSha || !remoteRef || !remoteSha) throw new Error('Could not read Git pre-push refs.');
    if (!localRef.startsWith('refs/heads/') || ZERO_SHA.test(localSha)) continue;
    console.log(`${remoteRef}: ${checkPush(remoteSha, localSha)}`);
  }
}

if (require.main === module) {
  try {
    const [command, arg1, arg2] = process.argv.slice(2);
    if (command === 'bump') console.log(`App version: ${bumpFiles(arg1 || 'patch')}. Commit package.json and package-lock.json before pushing.`);
    else if (command === 'check') console.log(checkPush(arg1, arg2 || 'HEAD'));
    else if (command === 'pre-push') prePush();
    else throw new Error('Use bump [patch|minor|major], check <previous-sha> [head-sha], or pre-push.');
  } catch (error) {
    console.error(`Version rule: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { parseVersion, compareVersions, bumpVersion, checkPush };
