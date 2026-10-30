'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractSection, renderReleaseBody } = require('../tools/render-release-body.cjs');

const changelog = '# Changelog\n\n## Unreleased\n\n- Future work\n\n## v1.2.3 — 2026-09-28\n\n- Fixed updates\n\n## v1.2.2 — 2026-09-20\n\n- Old fix\n';

test('release body includes only the tagged changelog and short highlights', () => {
  const body = renderReleaseBody('v1.2.3', '1.2.3', '- Update works', changelog);
  assert.match(body, /## Highlights\n\n- Update works/);
  assert.match(body, /## v1\.2\.3[\s\S]*- Fixed updates/);
  assert.doesNotMatch(body, /Future work|Old fix/);
});

test('stable releases fail if their changelog section is missing', () => {
  assert.throws(() => renderReleaseBody('v1.2.4', '1.2.4', '- New', changelog), /no section/);
});

test('prerelease can use its base changelog section', () => {
  assert.match(extractSection(changelog, 'v1.2.3-rc.1'), /Fixed updates/);
  assert.match(renderReleaseBody('v1.2.3-rc.1', '1.2.3', '- Candidate', changelog), /Fixed updates/);
});

test('mismatched tag never publishes another version notes', () => {
  assert.throws(() => renderReleaseBody('v1.2.4', '1.2.3', '- New', changelog), /does not match/);
});
