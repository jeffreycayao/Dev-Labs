// Pure helpers for the server-room pull-request review screen (ported from
// Claw3D's lib/office/github.ts). Main runs `gh`; this file shapes its JSON,
// validates what the renderer sends, and builds the argument lists.

export type GitHubPullRequestSummary = {
  number: number;
  title: string;
  url: string;
  repo: string;
  author: string;
  updatedAt: string | null;
  isDraft: boolean;
  labels: string[];
  reviewDecision: string | null;
  headRefName: string | null;
  baseRefName: string | null;
  statusSummary: string | null;
};

export type GitHubStatusCheck = {
  name: string;
  status: string | null;
  conclusion: string | null;
  workflow: string | null;
  detailsUrl: string | null;
};

export type GitHubReviewEntry = { author: string; state: string | null; body: string; submittedAt: string | null };
export type GitHubCommentEntry = { author: string; body: string; createdAt: string | null; url: string | null };
export type GitHubCommitEntry = { oid: string; messageHeadline: string; authoredDate: string | null };
export type GitHubFileEntry = {
  path: string;
  additions: number;
  deletions: number;
  status: string | null;
  previousPath: string | null;
  patch: string | null;
};

export type GitHubPullRequestDetail = GitHubPullRequestSummary & {
  body: string;
  state: string | null;
  mergeable: string | null;
  headRefOid: string | null;
  statusChecks: GitHubStatusCheck[];
  reviews: GitHubReviewEntry[];
  comments: GitHubCommentEntry[];
  commits: GitHubCommitEntry[];
  files: GitHubFileEntry[];
  diff: string;
  diffTruncated: boolean;
};

export type GitHubDashboard = {
  viewerLogin: string | null;
  currentRepoSlug: string | null;
  currentRepoPullRequests: GitHubPullRequestSummary[];
  reviewRequests: GitHubPullRequestSummary[];
  authoredPullRequests: GitHubPullRequestSummary[];
};

export type GitHubReviewAction = 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES';
export type GitHubInlineCommentSide = 'LEFT' | 'RIGHT';

export type GhResult<T> = ({ ok: true } & T) | { ok: false; error: string };

export const DIFF_PREVIEW_LIMIT = 80_000;
const MAX_BODY = 65_536;

const trimText = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
};
const toNumber = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
const toRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
const toArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const login = (value: unknown): string => trimText(toRecord(value).login) ?? 'unknown';

export function summarizeStatusChecks(value: unknown): string | null {
  let failed = 0;
  let pending = 0;
  let passed = 0;
  for (const entry of toArray(value)) {
    const record = toRecord(entry);
    const state = (trimText(record.state) ?? trimText(record.status) ?? '').toUpperCase();
    const conclusion = (trimText(record.conclusion) ?? '').toUpperCase();
    if (conclusion === 'FAILURE' || conclusion === 'TIMED_OUT' || conclusion === 'CANCELLED' || state === 'FAILURE' || state === 'ERROR') failed += 1;
    else if (state === 'PENDING' || state === 'IN_PROGRESS' || state === 'QUEUED' || state === 'EXPECTED') pending += 1;
    else passed += 1;
  }
  if (failed > 0) return `${failed} failing`;
  if (pending > 0) return `${pending} pending`;
  if (passed > 0) return `${passed} passing`;
  return null;
}

export function normalizeSummary(value: unknown, fallbackRepo: string | null = null): GitHubPullRequestSummary {
  const record = toRecord(value);
  return {
    number: toNumber(record.number),
    title: trimText(record.title) ?? 'Untitled pull request',
    url: trimText(record.url) ?? '',
    repo: trimText(toRecord(record.repository).nameWithOwner) ?? trimText(record.repo) ?? fallbackRepo ?? 'unknown/unknown',
    author: login(record.author),
    updatedAt: trimText(record.updatedAt),
    isDraft: Boolean(record.isDraft),
    labels: toArray(record.labels)
      .map((entry) => trimText(toRecord(entry).name) ?? trimText(entry))
      .filter((entry): entry is string => Boolean(entry)),
    reviewDecision: trimText(record.reviewDecision),
    headRefName: trimText(record.headRefName),
    baseRefName: trimText(record.baseRefName),
    statusSummary: summarizeStatusChecks(record.statusCheckRollup)
  };
}

export function normalizeFiles(value: unknown): GitHubFileEntry[] {
  return toArray(value).map((entry) => {
    const record = toRecord(entry);
    const rawPatch = typeof record.patch === 'string' ? record.patch.trimEnd() : '';
    return {
      path: trimText(record.path) ?? trimText(record.filename) ?? 'unknown',
      additions: toNumber(record.additions),
      deletions: toNumber(record.deletions),
      status: trimText(record.status),
      previousPath: trimText(record.previousPath) ?? trimText(record.previous_filename),
      patch: rawPatch.trim() ? rawPatch : null
    };
  });
}

/** `gh api --paginate --slurp` wraps pages in an outer array; flatten them. */
export function flattenPages(value: unknown): unknown[] {
  return toArray(value).flatMap((page) => (Array.isArray(page) ? page : [page]));
}

export function truncateDiff(diff: string): { diff: string; diffTruncated: boolean } {
  const trimmed = diff.trimEnd();
  if (trimmed.length <= DIFF_PREVIEW_LIMIT) return { diff: trimmed, diffTruncated: false };
  return { diff: `${trimmed.slice(0, DIFF_PREVIEW_LIMIT).trimEnd()}\n\n... diff truncated ...`, diffTruncated: true };
}

/** Build the detail view from `gh pr view --json …`, plus the diff and per-file patches loaded separately. */
export function normalizeDetail(
  payload: unknown,
  repo: string,
  diff: string,
  patchedFiles: GitHubFileEntry[]
): GitHubPullRequestDetail {
  const record = toRecord(payload);
  return {
    ...normalizeSummary(record, repo),
    body: trimText(record.body) ?? '',
    state: trimText(record.state),
    mergeable: trimText(record.mergeable),
    headRefOid: trimText(record.headRefOid),
    statusChecks: toArray(record.statusCheckRollup).map((entry) => {
      const r = toRecord(entry);
      return {
        name: trimText(r.name) ?? trimText(r.context) ?? trimText(r.workflowName) ?? 'Unnamed check',
        status: trimText(r.state) ?? trimText(r.status),
        conclusion: trimText(r.conclusion),
        workflow: trimText(r.workflowName),
        detailsUrl: trimText(r.detailsUrl) ?? trimText(r.targetUrl)
      };
    }),
    reviews: toArray(record.reviews).map((entry) => {
      const r = toRecord(entry);
      return { author: login(r.author), state: trimText(r.state), body: trimText(r.body) ?? '', submittedAt: trimText(r.submittedAt) };
    }),
    comments: toArray(record.comments).map((entry) => {
      const r = toRecord(entry);
      return { author: login(r.author), body: trimText(r.body) ?? '', createdAt: trimText(r.createdAt), url: trimText(r.url) };
    }),
    commits: toArray(record.commits).map((entry) => {
      const r = toRecord(entry);
      return { oid: trimText(r.oid) ?? '', messageHeadline: trimText(r.messageHeadline) ?? 'Commit', authoredDate: trimText(r.authoredDate) };
    }),
    files: patchedFiles.length > 0 ? patchedFiles : normalizeFiles(record.files),
    ...truncateDiff(diff)
  };
}

// ─── Validation (renderer input is untrusted) ────────────────────────────────

export const isRepoSlug = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9-]{0,38}\/[A-Za-z0-9._-]{1,100}$/.test(value);

export const isPrNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value < 1e9;

const isCommitId = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{7,40}$/i.test(value);

/** `gh pr review` args. Values ride in `--flag=value` form so a body that starts with `-` stays a value. */
export function buildReviewArgs(input: { repo: unknown; number: unknown; action: unknown; body: unknown }): string[] | string {
  if (!isRepoSlug(input.repo) || !isPrNumber(input.number)) return 'Pick a pull request first.';
  const flag = input.action === 'APPROVE' ? '--approve' : input.action === 'REQUEST_CHANGES' ? '--request-changes' : input.action === 'COMMENT' ? '--comment' : null;
  if (!flag) return 'Unknown review action.';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (body.length > MAX_BODY) return 'That note is too long for GitHub.';
  // GitHub requires a body for comment and request-changes reviews.
  const finalBody = body || (input.action === 'COMMENT' ? 'Reviewed in DevLabs.' : input.action === 'REQUEST_CHANGES' ? 'Please address the requested updates.' : '');
  const args = ['pr', 'review', String(input.number), `--repo=${input.repo}`, flag];
  if (finalBody) args.push(`--body=${finalBody}`);
  return args;
}

/** `gh api` args for one inline review comment. `-f` sends raw strings (no `@file` reads); `-F` only carries the validated line number. */
export function buildInlineCommentArgs(input: {
  repo: unknown;
  number: unknown;
  path: unknown;
  line: unknown;
  side: unknown;
  body: unknown;
  commitId: unknown;
}): string[] | string {
  if (!isRepoSlug(input.repo) || !isPrNumber(input.number)) return 'Pick a pull request first.';
  if (typeof input.path !== 'string' || !input.path.trim() || input.path.length > 1000 || input.path.includes('\0')) return 'Pick a file line first.';
  if (!isPrNumber(input.line)) return 'Pick a file line first.';
  if (input.side !== 'LEFT' && input.side !== 'RIGHT') return 'Pick a file line first.';
  if (!isCommitId(input.commitId)) return 'This pull request has no commit to comment on. Press Refresh.';
  const body = typeof input.body === 'string' ? input.body.trim() : '';
  if (!body) return 'Write a comment first.';
  if (body.length > MAX_BODY) return 'That comment is too long for GitHub.';
  return [
    'api', `repos/${input.repo}/pulls/${input.number}/comments`, '--method', 'POST',
    '-f', `body=${body}`, '-f', `commit_id=${input.commitId}`, '-f', `path=${input.path}`,
    '-F', `line=${input.line}`, '-f', `side=${input.side}`
  ];
}

// ─── Errors ──────────────────────────────────────────────────────────────────

export const GH_MISSING = 'Install the GitHub CLI (cli.github.com), then run `gh auth login` in a terminal.';
export const GH_SIGNED_OUT = 'GitHub CLI is not signed in. Run `gh auth login` in a terminal, then press Refresh.';

/** Turn a failed `gh` run into a sentence that says what to do next. */
export function friendlyGhError(err: { code?: unknown; killed?: unknown; stderr?: unknown; message?: unknown }): string {
  if (err.code === 'ENOENT') return GH_MISSING;
  if (err.killed) return 'GitHub took too long to answer. Check your connection and press Refresh.';
  const text = (trimText(err.stderr) ?? trimText(err.message) ?? '').replace(/\s+/g, ' ');
  if (/gh auth login|not logged in|authentication|HTTP 401|bad credentials/i.test(text)) return GH_SIGNED_OUT;
  if (/not a git repository|no git remotes|none of the git remotes/i.test(text)) return "This folder isn't a GitHub repository. Pick another folder.";
  if (/could not resolve host|network|timed? ?out/i.test(text)) return "Can't reach GitHub. Check your connection and press Refresh.";
  return text ? text.slice(0, 300) : 'GitHub CLI failed. Press Refresh to try again.';
}

// ─── Diff parsing (renderer) ─────────────────────────────────────────────────

export type ParsedDiffLine = {
  id: string;
  text: string;
  kind: 'meta' | 'hunk' | 'context' | 'add' | 'del';
  oldNumber: number | null;
  newNumber: number | null;
  lineNumber: number | null;
  side: GitHubInlineCommentSide | null;
  commentable: boolean;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Number each patch line so an inline comment can target the right side and line. */
export function parseDiffPatch(patch: string | null): ParsedDiffLine[] {
  const parsed: ParsedDiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;
  const meta = (text: string, index: number, kind: 'meta' | 'hunk' = 'meta'): ParsedDiffLine => ({
    id: `${kind}-${index}`, text, kind, oldNumber: null, newNumber: null, lineNumber: null, side: null, commentable: false
  });
  (patch ?? 'Diff preview unavailable for this file.').split('\n').forEach((line, index) => {
    const hunk = line.match(HUNK_HEADER);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      parsed.push(meta(line, index, 'hunk'));
    } else if (!inHunk || line.startsWith('\\')) {
      parsed.push(meta(line, index));
    } else if (line.startsWith('+')) {
      parsed.push({ id: `add-${index}`, text: line, kind: 'add', oldNumber: null, newNumber: newLine, lineNumber: newLine, side: 'RIGHT', commentable: true });
      newLine += 1;
    } else if (line.startsWith('-')) {
      parsed.push({ id: `del-${index}`, text: line, kind: 'del', oldNumber: oldLine, newNumber: null, lineNumber: oldLine, side: 'LEFT', commentable: true });
      oldLine += 1;
    } else {
      parsed.push({ id: `ctx-${index}`, text: line, kind: 'context', oldNumber: oldLine, newNumber: newLine, lineNumber: newLine, side: 'RIGHT', commentable: true });
      oldLine += 1;
      newLine += 1;
    }
  });
  return parsed;
}
