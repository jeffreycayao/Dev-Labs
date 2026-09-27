'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const brand = loadTs('src/shared/brand.ts');
const updates = loadTs('src/shared/updateState.ts');
const builder = fs.readFileSync(path.resolve(__dirname, '..', 'electron-builder.yml'), 'utf8');

test('packaged updater and manual downloads use only the public release repository', () => {
  assert.equal(brand.GITHUB_REPO, 'jeffreycayao/ATMT_LABS_FLOOR-releases');
  assert.equal(updates.REPO, brand.GITHUB_REPO);
  assert.match(updates.installerUrl('1.2.3', 'win32', 'x64'),
    /^https:\/\/github\.com\/jeffreycayao\/ATMT_LABS_FLOOR-releases\/releases\/download\/v1\.2\.3\//);
  assert.match(updates.installerUrl('1.2.3', 'darwin', 'arm64'), /mac-universal\.dmg$/);
  assert.match(builder, /^publish:\n  provider: github\n  owner: jeffreycayao\n  repo: ATMT_LABS_FLOOR-releases$/m);
});

test('release-only repository is not used as a remote catalog source', () => {
  assert.equal(brand.CATALOG_REPO, '');
  assert.equal(brand.rawRepoUrl('docs/hero.json'), '');
  assert.equal(brand.rawRepoUrl('docs/model-catalog.json'), '');
});
