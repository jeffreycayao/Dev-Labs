'use strict';

// src/shared/brand.ts values that must match electron-builder.yml. If they drift,
// nothing fails loudly: Windows notifications and taskbar pins stop matching the
// installed app (APP_ID), or installed apps poll the wrong repo for updates.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const brand = loadTs('src/shared/brand.ts');
const yml = fs.readFileSync(path.join(__dirname, '..', 'electron-builder.yml'), 'utf8');

test('APP_ID is electron-builder appId', () => {
  assert.equal(/^appId:\s*(\S+)/m.exec(yml)?.[1], brand.APP_ID);
});

test('GITHUB_REPO is the publish block the updater reads', () => {
  const owner = /^publish:[\s\S]*?^\s+owner:\s*(\S+)/m.exec(yml)?.[1];
  const repo = /^publish:[\s\S]*?^\s+repo:\s*(\S+)/m.exec(yml)?.[1];
  assert.equal(`${owner}/${repo}`, brand.GITHUB_REPO);
});
