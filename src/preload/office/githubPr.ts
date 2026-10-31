// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
// Server-room pull-request review through the `gh` CLI. Every call takes the repo
// folder to run in and resolves `{ ok: false, error }` (plain words) on failure.
import { ipcRenderer } from 'electron';
import type {
  GhResult,
  GitHubDashboard,
  GitHubInlineCommentSide,
  GitHubPullRequestDetail,
  GitHubReviewAction
} from '../../shared/office/githubPr';

export const githubPrApi = {
  /** Review requests, PRs you authored, and open PRs in the repo at `cwd`. */
  githubPrDashboard: (cwd: string): Promise<GhResult<{ dashboard: GitHubDashboard }>> =>
    ipcRenderer.invoke('office:github:dashboard', cwd),
  /** One PR with files (+ patches), commits, checks, reviews and the full diff. */
  githubPrDetail: (cwd: string, repo: string, number: number): Promise<GhResult<{ pullRequest: GitHubPullRequestDetail }>> =>
    ipcRenderer.invoke('office:github:detail', cwd, repo, number),
  /** Approve, comment on, or request changes on a PR. */
  githubPrReview: (
    cwd: string,
    input: { repo: string; number: number; event: GitHubReviewAction; body?: string }
  ): Promise<GhResult<{ message: string }>> => ipcRenderer.invoke('office:github:review', cwd, input),
  /** Post one comment on a diff line (`side` LEFT = old file, RIGHT = new file). */
  githubPrInlineComment: (
    cwd: string,
    input: { repo: string; number: number; path: string; line: number; side: GitHubInlineCommentSide; body: string; commitId: string | null }
  ): Promise<GhResult<{ message: string }>> => ipcRenderer.invoke('office:github:inlineComment', cwd, input)
};
