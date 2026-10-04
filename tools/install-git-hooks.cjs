#!/usr/bin/env node
'use strict';

const { execFileSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
try {
  execFileSync('git', ['rev-parse', '--show-toplevel'], { cwd: root, stdio: 'ignore' });
  let existing = '';
  try {
    existing = execFileSync('git', ['config', '--local', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { /* No custom hooks path. */ }
  if (existing && existing !== '.githooks') {
    console.log(`Existing Git hooks path (${existing}) kept. The GitHub version check remains active.`);
    process.exit(0);
  }
  execFileSync('git', ['config', '--local', 'core.hooksPath', '.githooks'], { cwd: root, stdio: 'ignore' });
  console.log('Jepoy Floor AI Git push version check installed.');
} catch {
  console.log('Git checkout unavailable; skipped local push hook.');
}
