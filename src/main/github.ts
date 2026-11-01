import { gh } from './office/githubPr';

/** A GitHub issue, normalized for the renderer (labels/assignees flattened to names). */
export interface GHIssue {
  number: number;
  title: string;
  body: string;
  url: string;
  labels: string[];
  assignees: string[];
}

/** Shape `gh issue list --json` emits for each issue (the fields we ask for). */
interface RawGHIssue {
  number?: number;
  title?: string;
  body?: string;
  url?: string;
  state?: string;
  labels?: Array<{ name?: string }>;
  assignees?: Array<{ login?: string }>;
}

/**
 * List up to 30 issues in the repo at `cwd` via the `gh` CLI (the same runner as
 * the Code Review Room: the user's shell PATH, a timeout, no prompts).
 *
 * Returns `{ ok: false, error }` on any failure — `gh` missing, non-zero exit
 * (e.g. unauthenticated / not a repo), or a JSON parse failure — so callers
 * never have to try/catch.
 */
export async function listIssues(cwd: string): Promise<{ ok: boolean; issues?: GHIssue[]; error?: string }> {
  try {
    const raw = JSON.parse(await gh(cwd, ['issue', 'list', '--json', 'number,title,body,assignees,labels,url,state', '--limit', '30'])) as RawGHIssue[];
    const issues: GHIssue[] = (Array.isArray(raw) ? raw : []).map((i) => ({
      number: i.number ?? 0,
      title: i.title ?? '',
      body: i.body ?? '',
      url: i.url ?? '',
      labels: (i.labels ?? []).map((l) => l.name ?? '').filter(Boolean),
      assignees: (i.assignees ?? []).map((a) => a.login ?? '').filter(Boolean)
    }));
    return { ok: true, issues };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
