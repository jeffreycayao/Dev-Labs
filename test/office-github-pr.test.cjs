'use strict';

// Server-room PR review: gh JSON is shaped safely, renderer input is validated
// before it reaches `gh`, errors read as next steps, diff lines get numbers.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const gh = loadTs('src/shared/office/githubPr.ts');

test('normalizeSummary fills defaults and reads search + list shapes', () => {
  const s = gh.normalizeSummary({
    number: 7,
    title: ' Fix it ',
    author: { login: 'ana' },
    repository: { nameWithOwner: 'acme/app' },
    labels: [{ name: 'bug' }, 'ui', {}],
    statusCheckRollup: [{ conclusion: 'SUCCESS' }, { status: 'IN_PROGRESS' }]
  });
  assert.equal(s.repo, 'acme/app');
  assert.equal(s.title, 'Fix it');
  assert.equal(s.author, 'ana');
  assert.deepEqual(s.labels, ['bug', 'ui']);
  assert.equal(s.statusSummary, '1 pending');
  const empty = gh.normalizeSummary(null, 'acme/fallback');
  assert.equal(empty.repo, 'acme/fallback');
  assert.equal(empty.title, 'Untitled pull request');
  assert.equal(empty.statusSummary, null);
});

test('summarizeStatusChecks: failing beats pending beats passing', () => {
  assert.equal(gh.summarizeStatusChecks([{ conclusion: 'FAILURE' }, { status: 'QUEUED' }]), '1 failing');
  assert.equal(gh.summarizeStatusChecks([{ state: 'SUCCESS' }, { state: 'SUCCESS' }]), '2 passing');
  assert.equal(gh.summarizeStatusChecks('nope'), null);
});

test('normalizeDetail prefers patched files, falls back to pr view files, truncates big diffs', () => {
  const payload = { number: 3, body: 'hi', headRefOid: 'abc1234', files: [{ path: 'a.ts', additions: 1 }] };
  const patched = gh.normalizeFiles(gh.flattenPages([[{ filename: 'b.ts', patch: '@@ -1 +1 @@\n-a\n+b\n' }]]));
  const d = gh.normalizeDetail(payload, 'acme/app', 'x'.repeat(gh.DIFF_PREVIEW_LIMIT + 10), patched);
  assert.equal(d.files[0].path, 'b.ts');
  assert.equal(d.files[0].patch, '@@ -1 +1 @@\n-a\n+b');
  assert.equal(d.diffTruncated, true);
  assert.equal(d.repo, 'acme/app');
  const fallback = gh.normalizeDetail(payload, 'acme/app', 'small', []);
  assert.equal(fallback.files[0].path, 'a.ts');
  assert.equal(fallback.files[0].patch, null);
  assert.equal(fallback.diffTruncated, false);
});

test('repo slugs and PR numbers are validated', () => {
  assert.ok(gh.isRepoSlug('acme/app.js'));
  for (const bad of ['acme', '-x/app', 'acme/app;rm', '../etc/passwd', 'acme/app/extra', 5]) assert.equal(gh.isRepoSlug(bad), false, String(bad));
  assert.ok(gh.isPrNumber(12));
  for (const bad of [0, -1, 1.5, '3', NaN]) assert.equal(gh.isPrNumber(bad), false, String(bad));
});

test('buildReviewArgs keeps the body as one --body= value and fills required bodies', () => {
  assert.deepEqual(gh.buildReviewArgs({ repo: 'acme/app', number: 4, action: 'APPROVE', body: '' }), [
    'pr', 'review', '4', '--repo=acme/app', '--approve'
  ]);
  const args = gh.buildReviewArgs({ repo: 'acme/app', number: 4, action: 'COMMENT', body: '--delete-branch' });
  assert.equal(args.at(-1), '--body=--delete-branch');
  assert.match(gh.buildReviewArgs({ repo: 'acme/app', number: 4, action: 'REQUEST_CHANGES', body: ' ' }).at(-1), /^--body=.+/);
  assert.equal(typeof gh.buildReviewArgs({ repo: 'acme/app', number: 4, action: 'MERGE', body: '' }), 'string');
  assert.equal(typeof gh.buildReviewArgs({ repo: 'bad', number: 4, action: 'APPROVE', body: '' }), 'string');
});

test('buildInlineCommentArgs validates every field and only -F carries the line', () => {
  const ok = { repo: 'acme/app', number: 2, path: 'src/a.ts', line: 10, side: 'RIGHT', body: '@/etc/passwd', commitId: 'abcdef1' };
  const args = gh.buildInlineCommentArgs(ok);
  assert.ok(Array.isArray(args));
  assert.equal(args[1], 'repos/acme/app/pulls/2/comments');
  assert.ok(args.includes('body=@/etc/passwd'));
  assert.equal(args[args.indexOf('body=@/etc/passwd') - 1], '-f');
  assert.deepEqual(args.filter((a, i) => args[i - 1] === '-F'), ['line=10']);
  for (const patch of [{ side: 'UP' }, { line: 0 }, { path: '' }, { body: '  ' }, { commitId: 'zzz' }, { number: '2' }]) {
    assert.equal(typeof gh.buildInlineCommentArgs({ ...ok, ...patch }), 'string', JSON.stringify(patch));
  }
});

test('friendlyGhError says what to do next', () => {
  assert.equal(gh.friendlyGhError({ code: 'ENOENT' }), gh.GH_MISSING);
  assert.equal(gh.friendlyGhError({ stderr: 'To get started with GitHub CLI, please run:  gh auth login' }), gh.GH_SIGNED_OUT);
  assert.match(gh.friendlyGhError({ stderr: 'fatal: not a git repository' }), /isn't a GitHub repository/);
  assert.match(gh.friendlyGhError({ killed: true }), /too long/);
  assert.equal(gh.friendlyGhError({ stderr: 'GraphQL: Could not find PR' }), 'GraphQL: Could not find PR');
  assert.match(gh.friendlyGhError({}), /Refresh/);
});

test('parseDiffPatch numbers old/new lines and marks what can take a comment', () => {
  const lines = gh.parseDiffPatch('@@ -10,3 +20,3 @@ fn\n ctx\n-old\n+new\n\\ No newline at end of file');
  assert.deepEqual(
    lines.map((l) => [l.kind, l.oldNumber, l.newNumber, l.side, l.commentable]),
    [
      ['hunk', null, null, null, false],
      ['context', 10, 20, 'RIGHT', true],
      ['del', 11, null, 'LEFT', true],
      ['add', null, 21, 'RIGHT', true],
      ['meta', null, null, null, false]
    ]
  );
  assert.equal(gh.parseDiffPatch(null)[0].commentable, false);
});
