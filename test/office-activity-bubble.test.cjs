'use strict';

// The working agent's bubble in the 3D office shows what it is doing, the way
// the 2D office's tool bubble did, instead of a bare "...".

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { activityBubble, ACTIVITY_MAX } = loadTs('src/shared/office/activityBubble.ts');

test('tool actions become "<icon> <target>"', () => {
  assert.equal(activityBubble('bash git push origin main'), '$ git push origin main');
  assert.equal(activityBubble('bash npm test'), '$ npm test');
  assert.equal(activityBubble('edit src/App.tsx'), '> src/App.tsx');
  assert.equal(activityBubble('read SPEC.md'), '< SPEC.md');
  assert.equal(activityBubble('grep TODO'), '? TODO');
  assert.equal(activityBubble('webfetch https://example.com'), '@ https://example.com');
  assert.equal(activityBubble('using Bash'), '$ Bash', 'a tool with no detail keeps its icon');
});

test('status words and unknown text', () => {
  assert.equal(activityBubble('thinking'), '', 'dots, not text');
  assert.equal(activityBubble('idle'), '');
  assert.equal(activityBubble(''), '');
  assert.equal(activityBubble(undefined), '');
  assert.equal(activityBubble('compacting context'), 'compacting context', 'plain text passes through');
  assert.equal(activityBubble('mcp__github__create_pr owner/repo'), 'mcp__github__create_pr owner/repo');
});

test('long commands are cut to fit the bubble', () => {
  const out = activityBubble(`bash ${'x'.repeat(200)}`);
  assert.equal(out.length, ACTIVITY_MAX);
  assert.ok(out.startsWith('$ x') && out.endsWith('…'));
});
