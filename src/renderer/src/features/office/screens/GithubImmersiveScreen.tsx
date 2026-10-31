// Server-room pull-request review (ported from Claw3D). Talks to GitHub through
// the `gh` CLI in main via window.cth; runs in the repo folder picked below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ExternalLink, Github, MessageSquare, RefreshCw } from "lucide-react";

import { useStore } from "@/store/store";
import type {
  GitHubDashboard,
  GitHubInlineCommentSide,
  GitHubPullRequestDetail,
  GitHubPullRequestSummary,
  GitHubReviewAction,
} from "@shared/office/githubPr";

import { FileDiffModal } from "./github/FileDiffModal";
import { formatRelativeTime, summarizeChecksTone } from "./github/utils";

type GithubImmersiveScreenProps = {
  agentName?: string | null;
  // Passed by RetroOffice3D for Claw3D's skill gate; DevLabs has no skills gateway, so unused.
  githubSkill?: unknown;
  onOpenSetup?: () => void;
};

const folderName = (path: string) => path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
const samePr = (a: GitHubPullRequestSummary, b: GitHubPullRequestSummary) => a.repo === b.repo && a.number === b.number;

export function GithubImmersiveScreen({ agentName }: GithubImmersiveScreenProps) {
  const agents = useStore((s) => s.agents);
  const selectedId = useStore((s) => s.selectedId);
  // Repo folder: the selected agent's, else Ramon's; the dropdown lists every agent folder.
  const defaultCwd =
    agents.find((a) => a.id === selectedId)?.cwd || agents.find((a) => a.isGod)?.cwd || agents[0]?.cwd || "";
  const [pickedCwd, setPickedCwd] = useState<string | null>(null);
  const cwd = pickedCwd ?? defaultCwd;
  const cwdOptions = useMemo(() => {
    const byCwd = new Map<string, string[]>();
    for (const a of agents) if (a.cwd) byCwd.set(a.cwd, [...(byCwd.get(a.cwd) ?? []), a.name]);
    return [...byCwd.entries()].map(([path, names]) => ({ path, label: `${folderName(path)} · ${names.join(", ")}` }));
  }, [agents]);
  const folderAgentName = agentName ?? agents.find((a) => a.cwd === cwd)?.name ?? null;

  const [dashboard, setDashboard] = useState<GitHubDashboard | null>(null);
  const [detail, setDetail] = useState<GitHubPullRequestDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"queue" | "repo">("queue");
  const [selectedPr, setSelectedPr] = useState<GitHubPullRequestSummary | null>(null);
  const [reviewBody, setReviewBody] = useState("");
  const [reviewBusyAction, setReviewBusyAction] = useState<GitHubReviewAction | null>(null);
  const [reviewMessage, setReviewMessage] = useState<string | null>(null);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const detailRequestIdRef = useRef(0);

  const refreshDashboard = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    if (!cwd) {
      setLoading(false);
      setDashboard(null);
      setError("No project folder yet. Add an agent with a project folder, then come back.");
      return;
    }
    setLoading(true);
    setError(null);
    const result = await window.cth.githubPrDashboard(cwd);
    if (requestIdRef.current !== requestId) return;
    setLoading(false);
    if (!result.ok) {
      setDashboard(null);
      setError(result.error);
      return;
    }
    const next = result.dashboard;
    setDashboard(next);
    const all = [...next.reviewRequests, ...next.currentRepoPullRequests, ...next.authoredPullRequests];
    // Keep the open PR (same object, so the detail doesn't reload twice); else open the first one.
    setSelectedPr((current) => current ?? all[0] ?? null);
  }, [cwd]);

  useEffect(() => {
    setSelectedPr(null);
    void refreshDashboard();
  }, [refreshDashboard]);

  const loadDetail = useCallback(
    async (summary: GitHubPullRequestSummary | null) => {
      const requestId = ++detailRequestIdRef.current;
      setSelectedFilePath(null);
      if (!summary || !cwd) {
        setDetail(null);
        return;
      }
      setDetailLoading(true);
      const result = await window.cth.githubPrDetail(cwd, summary.repo, summary.number);
      if (detailRequestIdRef.current !== requestId) return;
      setDetailLoading(false);
      setDetail(result.ok ? result.pullRequest : null);
      if (!result.ok) setError(result.error);
    },
    [cwd],
  );

  useEffect(() => {
    void loadDetail(selectedPr);
  }, [loadDetail, selectedPr]);

  const queueEntries = useMemo(
    () =>
      dashboard
        ? [...dashboard.reviewRequests, ...dashboard.authoredPullRequests].filter(
            (entry, index, list) => list.findIndex((c) => samePr(c, entry)) === index,
          )
        : [],
    [dashboard],
  );
  const activeList = activeTab === "queue" ? queueEntries : (dashboard?.currentRepoPullRequests ?? []);
  const currentRepoLabel = dashboard?.currentRepoSlug ? folderName(dashboard.currentRepoSlug) : "Not a GitHub repo";
  const isInitialLoading = loading && dashboard === null && !error;
  const selectedFile = detail?.files.find((file) => file.path === selectedFilePath) ?? null;

  useEffect(() => {
    if (!selectedFile) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedFilePath(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedFile]);

  const handleSelectPr = (summary: GitHubPullRequestSummary) => {
    setSelectedPr(summary);
    setReviewBody("");
    setReviewMessage(null);
  };

  const handleSubmitReview = async (event: GitHubReviewAction) => {
    if (!detail) return;
    setReviewBusyAction(event);
    setReviewMessage(null);
    setError(null);
    const result = await window.cth.githubPrReview(cwd, { repo: detail.repo, number: detail.number, event, body: reviewBody });
    setReviewBusyAction(null);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setReviewMessage(result.message);
    setReviewBody("");
    await Promise.all([refreshDashboard(), loadDetail(selectedPr)]);
  };

  const handleSubmitInlineComment = useCallback(
    async (input: { path: string; line: number; side: GitHubInlineCommentSide; body: string }) => {
      if (!detail) return;
      const result = await window.cth.githubPrInlineComment(cwd, {
        ...input,
        repo: detail.repo,
        number: detail.number,
        commitId: detail.headRefOid,
      });
      if (!result.ok) throw new Error(result.error);
    },
    [cwd, detail],
  );

  const pill = "cursor-pointer rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[12px] text-white/72 transition-colors hover:border-white/20 hover:text-white";

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#0f1b3d_0%,#060916_42%,#020409_100%)] text-white">
      <div className="border-b border-cyan-400/12 bg-[var(--color-office-bg-3)]/82 px-6 py-4 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-300/18 bg-cyan-300/8">
              <Github className="h-5 w-5 text-cyan-100" />
            </div>
            <div>
              <div className="text-[11px] uppercase tracking-[0.28em] text-cyan-200/65">Code Review Room</div>
              <div className="text-lg font-semibold text-white">
                {folderAgentName ? `${folderAgentName}'s pull requests` : "GitHub review station"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {cwdOptions.length > 0 ? (
              <select
                value={cwd}
                onChange={(event) => setPickedCwd(event.target.value)}
                title={cwd}
                aria-label="Project folder"
                className="max-w-[260px] cursor-pointer truncate rounded-full border border-white/10 bg-[var(--color-office-bg-4)] px-3 py-1.5 text-[12px] text-white/80 outline-none"
              >
                {cwdOptions.map((o) => (
                  <option key={o.path} value={o.path}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
            <button
              type="button"
              onClick={() => {
                void refreshDashboard();
                void loadDetail(selectedPr);
              }}
              className={`inline-flex items-center gap-2 ${pill}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading || detailLoading ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {dashboard?.viewerLogin ? (
              <div className="rounded-full border border-cyan-300/16 bg-cyan-300/8 px-3 py-1.5 text-[12px] text-cyan-100/90">
                @{dashboard.viewerLogin}
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div role="alert" className="mx-6 mt-4 rounded-2xl border border-rose-400/16 bg-rose-400/8 px-4 py-3 text-sm text-rose-100">
          {error}
        </div>
      ) : null}
      {reviewMessage ? (
        <div className="mx-6 mt-4 rounded-2xl border border-emerald-400/16 bg-emerald-400/8 px-4 py-3 text-sm text-emerald-100">
          {reviewMessage}
        </div>
      ) : null}

      {isInitialLoading ? (
        <div className="flex min-h-0 flex-1 items-center justify-center px-8 py-10">
          <div className="flex max-w-md flex-col items-center rounded-3xl border border-cyan-300/12 bg-[var(--color-office-bg-3)]/78 px-8 py-10 text-center">
            <RefreshCw className="h-8 w-8 animate-spin text-cyan-200/70" />
            <div className="mt-5 text-lg font-semibold text-white">Loading your review queue.</div>
            <div className="mt-2 text-sm text-white/58">Asking GitHub for pull requests.</div>
          </div>
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-0" style={{ gridTemplateColumns: "340px minmax(0,1fr)" }}>
          <div className="flex min-h-0 flex-col border-r border-white/6 bg-[var(--color-office-bg-3)]/72">
            <div className="grid grid-cols-2 gap-2 p-3">
              {(["queue", "repo"] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setActiveTab(tab)}
                  className={`min-w-0 cursor-pointer rounded-2xl px-4 py-2.5 text-left transition-colors ${
                    activeTab === tab
                      ? "border border-cyan-300/20 bg-cyan-300/12 text-white"
                      : "border border-white/6 bg-white/4 text-white/65 hover:text-white"
                  }`}
                >
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/50">{tab === "queue" ? "My Queue" : "This Repo"}</div>
                  {tab === "queue" ? (
                    <div className="mt-1 text-lg font-semibold leading-none">{queueEntries.length}</div>
                  ) : (
                    <div className="mt-1 break-words text-sm font-medium leading-5 text-white/85">{currentRepoLabel}</div>
                  )}
                </button>
              ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
              {loading ? (
                <div className="rounded-2xl border border-white/6 bg-white/4 px-4 py-4 text-sm text-white/55">Loading pull requests.</div>
              ) : activeList.length === 0 ? (
                <div className="rounded-2xl border border-white/6 bg-white/4 px-4 py-4 text-sm text-white/55">
                  {activeTab === "queue"
                    ? "Nothing waiting for your review, and no open pull requests by you."
                    : "No open pull requests in this repository."}
                </div>
              ) : (
                <div className="space-y-3">
                  {activeList.map((entry) => (
                    <button
                      key={`${entry.repo}#${entry.number}`}
                      type="button"
                      onClick={() => handleSelectPr(entry)}
                      className={`w-full cursor-pointer rounded-2xl border px-4 py-4 text-left transition-colors ${
                        selectedPr && samePr(selectedPr, entry)
                          ? "border-cyan-300/24 bg-cyan-300/10"
                          : "border-white/6 bg-white/4 hover:border-white/12 hover:bg-white/6"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{entry.repo}</div>
                          <div className="mt-1 text-sm font-semibold text-white">
                            #{entry.number} {entry.title}
                          </div>
                        </div>
                        {entry.isDraft ? (
                          <span className="rounded-full border border-white/10 px-2 py-1 text-[10px] uppercase tracking-[0.2em] text-white/55">Draft</span>
                        ) : null}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/56">
                        <span>@{entry.author}</span>
                        <span>{formatRelativeTime(entry.updatedAt)}</span>
                        {entry.statusSummary ? <span className={summarizeChecksTone(entry.statusSummary)}>{entry.statusSummary}</span> : null}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="min-h-0 overflow-hidden">
            {detailLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-white/55">Loading pull request.</div>
            ) : detail ? (
              <div className="grid h-full" style={{ gridTemplateColumns: "minmax(0,1fr) 320px" }}>
                <div className="min-h-0 overflow-y-auto px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <div className="text-[11px] uppercase tracking-[0.26em] text-cyan-200/55">{detail.repo}</div>
                      <div className="mt-1 text-2xl font-semibold text-white">
                        #{detail.number} {detail.title}
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-white/62">
                        <span>@{detail.author}</span>
                        <span>{formatRelativeTime(detail.updatedAt)}</span>
                        {detail.headRefName && detail.baseRefName ? (
                          <span>
                            {detail.headRefName} → {detail.baseRefName}
                          </span>
                        ) : null}
                        {detail.reviewDecision ? <span>{detail.reviewDecision.replace(/_/g, " ").toLowerCase()}</span> : null}
                      </div>
                    </div>
                    {detail.url ? (
                      <button
                        type="button"
                        onClick={() => void window.cth.openExternal(detail.url)}
                        className={`inline-flex shrink-0 items-center gap-2 whitespace-nowrap ${pill}`}
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Open on GitHub
                      </button>
                    ) : null}
                  </div>

                  <div className="mt-5 grid grid-cols-3 gap-4">
                    {[
                      ["Checks", detail.statusChecks.length],
                      ["Files changed", detail.files.length],
                      ["Commits", detail.commits.length],
                    ].map(([label, count]) => (
                      <div key={label} className="rounded-2xl border border-white/6 bg-white/4 px-4 py-4">
                        <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">{label}</div>
                        <div className="mt-2 text-lg font-semibold text-white">{count}</div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 rounded-3xl border border-cyan-400/10 bg-[var(--color-office-bg-4)]/88 p-5">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/52">Your review</div>
                    <textarea
                      value={reviewBody}
                      onChange={(event) => setReviewBody(event.target.value)}
                      placeholder="Add a note (optional for approve)."
                      aria-label="Review note"
                      className="mt-3 h-24 w-full resize-none rounded-2xl border border-white/8 bg-black/22 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                    />
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {(
                        [
                          ["APPROVE", "Approve", "Approving...", "border-emerald-300/24 bg-emerald-300/10 text-emerald-100 hover:border-emerald-200/40"],
                          ["REQUEST_CHANGES", "Request changes", "Sending...", "border-amber-300/24 bg-amber-300/10 text-amber-100 hover:border-amber-200/40"],
                          ["COMMENT", "Comment", "Sending...", "border-cyan-300/24 bg-cyan-300/10 text-cyan-100 hover:border-cyan-200/40"],
                        ] as const
                      ).map(([action, label, busyLabel, tone]) => (
                        <button
                          key={action}
                          type="button"
                          onClick={() => void handleSubmitReview(action)}
                          disabled={Boolean(reviewBusyAction)}
                          className={`inline-flex h-10 cursor-pointer items-center justify-center whitespace-nowrap rounded-full border px-4 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${tone}`}
                        >
                          {reviewBusyAction === action ? busyLabel : label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/6 bg-white/4 p-5">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Description</div>
                    <div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-white/78">{detail.body || "No description."}</div>
                  </div>

                  <div className="mt-5 rounded-3xl border border-white/6 bg-white/4 p-5">
                    <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">All changes</div>
                    <div className="mt-1 text-sm text-white/60">Open a file on the right to comment on a line.</div>
                    <pre className="mt-3 max-h-[320px] overflow-auto rounded-2xl border border-white/6 bg-black/28 p-4 text-[12px] leading-5 text-cyan-100/86">
                      {detail.diff || "No diff to show (it may be too large)."}
                    </pre>
                    {detail.diffTruncated ? <div className="mt-2 text-[11px] text-white/45">Only the start of a long diff is shown.</div> : null}
                  </div>

                  {detail.commits.length > 0 ? (
                    <div className="mt-5 rounded-3xl border border-white/6 bg-white/4 p-5">
                      <div className="text-[11px] uppercase tracking-[0.24em] text-white/45">Commits</div>
                      <div className="mt-3 space-y-1.5">
                        {detail.commits.map((commit) => (
                          <div key={commit.oid} className="flex gap-3 text-[12px] text-white/72">
                            <span className="font-mono text-white/40">{commit.oid.slice(0, 7)}</span>
                            <span className="min-w-0 truncate">{commit.messageHeadline}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="min-h-0 overflow-y-auto border-l border-white/6 bg-[var(--color-office-bg-2)]/86 px-4 py-5">
                  <div className="text-[11px] uppercase tracking-[0.24em] text-white/42">Checks</div>
                  <div className="mt-3 space-y-2">
                    {detail.statusChecks.length > 0 ? (
                      detail.statusChecks.map((check, index) => (
                        <div key={`${check.name}-${index}`} className="rounded-2xl border border-white/6 bg-white/4 px-3 py-3">
                          <div className="text-sm font-medium text-white">{check.name}</div>
                          <div className="mt-1 text-[12px] text-white/55">
                            {[check.status, check.conclusion, check.workflow].filter(Boolean).join(" · ") || "No status"}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/6 bg-white/4 px-3 py-3 text-sm text-white/55">No checks reported.</div>
                    )}
                  </div>

                  <div className="mt-6 text-[11px] uppercase tracking-[0.24em] text-white/42">Files</div>
                  <div className="mt-3 space-y-2">
                    {detail.files.map((file) => (
                      <button
                        key={file.path}
                        type="button"
                        onClick={() => setSelectedFilePath(file.path)}
                        className={`w-full cursor-pointer rounded-2xl border px-3 py-3 text-left transition-colors ${
                          selectedFile?.path === file.path
                            ? "border-cyan-300/24 bg-cyan-300/10"
                            : "border-white/6 bg-white/4 hover:border-white/12 hover:bg-white/6"
                        }`}
                      >
                        <div className="truncate text-sm text-white" title={file.path}>
                          {file.path}
                        </div>
                        <div className="mt-1 text-[12px] text-white/55">
                          +{file.additions} / -{file.deletions}
                          {file.status ? ` · ${file.status}` : ""}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="mt-6 text-[11px] uppercase tracking-[0.24em] text-white/42">Reviews</div>
                  <div className="mt-3 space-y-2">
                    {detail.reviews.length > 0 ? (
                      detail.reviews.slice(-6).map((review, index) => (
                        <div key={`${review.author}-${review.submittedAt ?? index}`} className="rounded-2xl border border-white/6 bg-white/4 px-3 py-3">
                          <div className="flex items-center gap-2 text-sm text-white">
                            <MessageSquare className="h-3.5 w-3.5 text-cyan-200/70" />
                            <span>@{review.author}</span>
                          </div>
                          <div className="mt-1 text-[12px] text-white/55">
                            {[review.state?.replace(/_/g, " ").toLowerCase(), review.submittedAt ? new Date(review.submittedAt).toLocaleDateString() : null].filter(Boolean).join(" · ")}
                          </div>
                          {review.body ? <div className="mt-2 text-[12px] leading-5 text-white/68">{review.body}</div> : null}
                        </div>
                      ))
                    ) : (
                      <div className="rounded-2xl border border-white/6 bg-white/4 px-3 py-3 text-sm text-white/55">No reviews yet.</div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center justify-center px-8 text-center text-sm text-white/55">
                Pick a pull request to see its checks, changes and review buttons.
              </div>
            )}
          </div>
        </div>
      )}
      {selectedFile && detail ? (
        <FileDiffModal
          key={selectedFile.path}
          file={selectedFile}
          onSubmitInlineComment={handleSubmitInlineComment}
          onClose={() => setSelectedFilePath(null)}
        />
      ) : null}
    </div>
  );
}
