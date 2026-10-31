// Server-room pull-request review (ported from Claw3D's lib/office/github.ts).
// Every call runs the `gh` CLI with execFile (no shell) in a repo folder the
// renderer picks; the folder must exist. Parsing/validation lives in shared/.
import { execFile } from 'node:child_process';
import { existsSync, statSync } from 'node:fs';
import { isAbsolute } from 'node:path';
import { ipcMain } from 'electron';
import { userShellPath } from '../shellEnv';
import {
  buildInlineCommentArgs,
  buildReviewArgs,
  flattenPages,
  friendlyGhError,
  isPrNumber,
  isRepoSlug,
  normalizeDetail,
  normalizeFiles,
  normalizeSummary,
  type GhResult,
  type GitHubDashboard,
  type GitHubPullRequestDetail
} from '../../shared/office/githubPr';

const TIMEOUT_MS = 30_000;
const MAX_BUFFER = 16 * 1024 * 1024;
const SUMMARY_FIELDS = 'number,title,url,author,reviewDecision,isDraft,updatedAt,headRefName,baseRefName,statusCheckRollup,labels';
const SEARCH_FIELDS = 'number,title,url,author,repository,updatedAt,isDraft,labels';
const DETAIL_FIELDS =
  'number,title,url,author,files,reviews,comments,commits,reviewDecision,statusCheckRollup,headRefName,headRefOid,baseRefName,updatedAt,isDraft,labels,body,state,mergeable';

class GhError extends Error {}

function gh(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'gh',
      args,
      // userShellPath: macOS GUI apps don't inherit the shell PATH where Homebrew puts gh.
      { cwd, timeout: TIMEOUT_MS, maxBuffer: MAX_BUFFER, windowsHide: true, env: { ...process.env, PATH: userShellPath(), GH_PROMPT_DISABLED: '1', NO_COLOR: '1' } },
      (err, stdout, stderr) => (err ? reject(new GhError(friendlyGhError({ code: err.code, killed: err.killed, stderr, message: err.message }))): resolve(stdout))
    );
  });
}

async function ghJson(cwd: string, args: string[]): Promise<unknown> {
  const out = await gh(cwd, args);
  try {
    return JSON.parse(out);
  } catch {
    throw new GhError('GitHub CLI sent back something unexpected. Update gh and try again.');
  }
}

const isFolder = (cwd: unknown): cwd is string => {
  try {
    return typeof cwd === 'string' && isAbsolute(cwd) && existsSync(cwd) && statSync(cwd).isDirectory();
  } catch {
    return false;
  }
};

/** Wrap a handler: check the folder, and turn any throw into `{ ok: false, error }`. */
async function guarded<T>(cwd: unknown, run: (cwd: string) => Promise<T>): Promise<GhResult<T>> {
  if (!isFolder(cwd)) return { ok: false, error: "That project folder doesn't exist. Pick another one." };
  try {
    return { ok: true, ...(await run(cwd)) };
  } catch (err) {
    return { ok: false, error: err instanceof GhError ? err.message : friendlyGhError(err as Error) };
  }
}

const list = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

async function loadDashboard(cwd: string): Promise<{ dashboard: GitHubDashboard }> {
  // Fails first (and clearly) when gh is missing or signed out.
  const viewerLogin = (await gh(cwd, ['api', 'user', '--jq', '.login'])).trim() || null;
  const slug = await gh(cwd, ['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).then(
    (s) => (isRepoSlug(s.trim()) ? s.trim() : null),
    () => null // folder isn't a GitHub repo — the queue still works
  );
  const search = (who: string) =>
    ghJson(cwd, ['search', 'prs', who, '@me', '--state=open', '--limit=25', `--json=${SEARCH_FIELDS}`]).then((p) => list(p).map((e) => normalizeSummary(e)));
  const [currentRepoPullRequests, reviewRequests, authoredPullRequests] = await Promise.all([
    slug
      ? ghJson(cwd, ['pr', 'list', `--repo=${slug}`, '--state=open', '--limit=25', `--json=${SUMMARY_FIELDS}`]).then((p) => list(p).map((e) => normalizeSummary(e, slug)))
      : Promise.resolve([]),
    search('--review-requested'),
    search('--author')
  ]);
  return { dashboard: { viewerLogin, currentRepoSlug: slug, currentRepoPullRequests, reviewRequests, authoredPullRequests } };
}

async function loadDetail(cwd: string, repo: unknown, number: unknown): Promise<{ pullRequest: GitHubPullRequestDetail }> {
  if (!isRepoSlug(repo) || !isPrNumber(number)) throw new GhError('Pick a pull request first.');
  const [payload, diff, files] = await Promise.all([
    ghJson(cwd, ['pr', 'view', String(number), `--repo=${repo}`, `--json=${DETAIL_FIELDS}`]),
    gh(cwd, ['pr', 'diff', String(number), `--repo=${repo}`]).catch(() => ''), // too big / unavailable → no preview
    ghJson(cwd, ['api', `repos/${repo}/pulls/${number}/files`, '--paginate', '--slurp']).then(
      (p) => normalizeFiles(flattenPages(p)),
      () => [] // older gh without --slurp → fall back to pr view's file list (no patches)
    )
  ]);
  return { pullRequest: normalizeDetail(payload, repo, diff, files) };
}

export function registerGithubPrIpc(): void {
  ipcMain.handle('office:github:dashboard', (_e, cwd: unknown) => guarded(cwd, loadDashboard));

  ipcMain.handle('office:github:detail', (_e, cwd: unknown, repo: unknown, number: unknown) =>
    guarded(cwd, (dir) => loadDetail(dir, repo, number))
  );

  ipcMain.handle('office:github:review', (_e, cwd: unknown, input: unknown) =>
    guarded(cwd, async (dir) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const args = buildReviewArgs({ repo: i.repo, number: i.number, action: i.event, body: i.body });
      if (typeof args === 'string') throw new GhError(args);
      await gh(dir, args);
      return {
        message: i.event === 'APPROVE' ? 'Pull request approved.' : i.event === 'REQUEST_CHANGES' ? 'Asked for changes.' : 'Review comment sent.'
      };
    })
  );

  ipcMain.handle('office:github:inlineComment', (_e, cwd: unknown, input: unknown) =>
    guarded(cwd, async (dir) => {
      const i = (input ?? {}) as Record<string, unknown>;
      const args = buildInlineCommentArgs({ repo: i.repo, number: i.number, path: i.path, line: i.line, side: i.side, body: i.body, commitId: i.commitId });
      if (typeof args === 'string') throw new GhError(args);
      await gh(dir, args);
      return { message: 'Inline comment sent.' };
    })
  );
}
