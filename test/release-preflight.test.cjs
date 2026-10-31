'use strict';

// tools/release-preflight.cjs gates the expensive macOS/Windows release builds.

const test = require('node:test');
const assert = require('node:assert/strict');
const { checkContents } = require('../tools/release-preflight.cjs');

const good = {
  tag: 'v1.2.3',
  version: '1.2.3',
  notes: '- New thing.\n- Fixed thing.\n- Faster thing.\n',
  changelog: '# Changelog\n\n## Unreleased\n\n## v1.2.3 — 2026-09-28\n\n- New thing.\n',
  prevNotes: '- Old thing.\n'
};

test('a finished release passes', () => {
  assert.deepEqual(checkContents(good), []);
});

test('tag that does not match package.json fails', () => {
  assert.match(checkContents({ ...good, tag: 'v1.2.4' }).join('\n'), /does not match package\.json/);
});

test('missing CHANGELOG section fails', () => {
  assert.match(checkContents({ ...good, changelog: '# Changelog\n\n## Unreleased\n\n' }).join('\n'), /no section for v1\.2\.3/);
});

test('entries left under Unreleased fail', () => {
  const changelog = '# Changelog\n\n## Unreleased\n\n- Forgot to release this.\n\n## v1.2.3 — 2026-09-28\n\n- New thing.\n';
  assert.match(checkContents({ ...good, changelog }).join('\n'), /Unreleased/);
});

test('empty or unchanged "What\'s new" notes fail', () => {
  assert.match(checkContents({ ...good, notes: '' }).join('\n'), /release-notes\.md is empty/);
  assert.match(checkContents({ ...good, prevNotes: good.notes }).join('\n'), /unchanged since the previous release/);
});

test('more than five bullets fails', () => {
  const notes = Array.from({ length: 6 }, (_, i) => `- Item ${i}`).join('\n');
  assert.match(checkContents({ ...good, notes }).join('\n'), /3-5 bullets/);
});

test('first release (no previous notes) is allowed', () => {
  assert.deepEqual(checkContents({ ...good, prevNotes: null }), []);
});
