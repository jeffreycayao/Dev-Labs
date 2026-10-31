import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { parseDiffPatch, type GitHubFileEntry, type GitHubInlineCommentSide } from "@shared/office/githubPr";

import { getDiffLineTone } from "./utils";

type FileDiffModalProps = {
  file: GitHubFileEntry;
  onSubmitInlineComment: (input: { path: string; line: number; side: GitHubInlineCommentSide; body: string }) => Promise<void>;
  onClose: () => void;
};

const gridCols = { gridTemplateColumns: "44px 44px minmax(0,1fr)" };

export function FileDiffModal({ file, onSubmitInlineComment, onClose }: FileDiffModalProps) {
  const diffLines = useMemo(() => parseDiffPatch(file.patch), [file.patch]);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [commentBody, setCommentBody] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);
  const selectedLine = diffLines.find((line) => line.id === selectedLineId && line.commentable) ?? null;

  const handleSubmitComment = () => {
    if (!selectedLine?.side || !selectedLine.lineNumber) return;
    const input = { path: file.path, line: selectedLine.lineNumber, side: selectedLine.side, body: commentBody };
    setCommentBusy(true);
    setNotice({ tone: "info", text: "Sending comment..." });
    onSubmitInlineComment(input)
      .then(() => {
        setNotice({ tone: "success", text: "Inline comment sent." });
        setCommentBody("");
        setSelectedLineId(null);
      })
      // Keep the draft on failure so nothing typed is lost.
      .catch((error) => setNotice({ tone: "error", text: error instanceof Error ? error.message : "Couldn't send the comment." }))
      .finally(() => setCommentBusy(false));
  };

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/76 p-6 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex h-full max-h-[92%] w-full max-w-6xl flex-col overflow-hidden rounded-[28px] border border-cyan-300/16 bg-[var(--color-office-bg-4)] shadow-[0_28px_120px_rgba(0,0,0,0.66)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/8 px-6 py-5">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.24em] text-cyan-100/48">File changes</div>
            <div className="mt-2 break-all text-lg font-semibold text-white">{file.path}</div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/50">
              {file.status ? <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1">{file.status}</span> : null}
              <span className="rounded-full border border-emerald-400/18 bg-emerald-400/10 px-2.5 py-1 text-emerald-100/88">+{file.additions}</span>
              <span className="rounded-full border border-rose-400/18 bg-rose-400/10 px-2.5 py-1 text-rose-100/88">-{file.deletions}</span>
            </div>
            {file.previousPath ? <div className="mt-3 text-sm text-white/54">Renamed from {file.previousPath}</div> : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:border-white/18 hover:text-white"
            aria-label="Close file changes"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="overflow-hidden rounded-2xl border border-white/8 bg-[var(--color-office-bg-2)]">
            <div className="border-b border-white/8 px-4 py-3 text-[11px] uppercase tracking-[0.22em] text-white/40">
              Click a line to comment on it
            </div>
            {notice ? (
              <div
                className={`border-b px-4 py-3 text-sm ${
                  notice.tone === "success"
                    ? "border-emerald-400/18 bg-emerald-400/10 text-emerald-100"
                    : notice.tone === "error"
                      ? "border-rose-400/18 bg-rose-400/10 text-rose-100"
                      : "border-cyan-300/14 bg-cyan-300/10 text-cyan-100"
                }`}
              >
                {notice.text}
              </div>
            ) : null}
            <div className="overflow-auto p-2">
              {diffLines.map((line) => {
                const cells = (
                  <>
                    <span className="select-none text-right font-mono text-[11px] text-white/28">{line.oldNumber ?? ""}</span>
                    <span className="select-none text-right font-mono text-[11px] text-white/28">{line.newNumber ?? ""}</span>
                    <span className="block whitespace-pre-wrap break-all font-mono text-[12px] leading-5">{line.text || " "}</span>
                  </>
                );
                return (
                  <div key={line.id}>
                    {line.commentable ? (
                      <button
                        type="button"
                        onClick={() => setSelectedLineId(line.id)}
                        style={gridCols}
                        className={`grid w-full cursor-pointer gap-3 rounded-md border-0 px-3 py-1 text-left transition-colors hover:bg-white/6 ${
                          selectedLine?.id === line.id ? "ring-1 ring-cyan-300/28" : "bg-transparent"
                        } ${getDiffLineTone(line.kind)}`}
                      >
                        {cells}
                      </button>
                    ) : (
                      <div style={gridCols} className={`grid gap-3 rounded-md px-3 py-1 ${getDiffLineTone(line.kind)}`}>
                        {cells}
                      </div>
                    )}
                    {selectedLine?.id === line.id ? (
                      <div className="mx-3 my-2 rounded-2xl border border-cyan-300/14 bg-[var(--color-office-bg-4)] p-4">
                        <div className="text-[11px] uppercase tracking-[0.18em] text-cyan-100/58">
                          Comment on {selectedLine.side === "LEFT" ? "old" : "new"} line {selectedLine.lineNumber}
                        </div>
                        <textarea
                          value={commentBody}
                          onChange={(event) => setCommentBody(event.target.value)}
                          placeholder="Write your comment."
                          aria-label="Inline comment"
                          className="mt-3 h-28 w-full resize-none rounded-2xl border border-white/8 bg-black/22 px-4 py-3 text-sm text-white outline-none placeholder:text-white/28"
                        />
                        <div className="mt-3 flex items-center justify-between gap-3">
                          <div className="text-[12px] text-white/45">This posts straight to GitHub on this line.</div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedLineId(null);
                                setCommentBody("");
                              }}
                              className="inline-flex cursor-pointer items-center rounded-full border border-white/10 bg-white/5 px-3 py-2 text-[12px] text-white/68 transition-colors hover:border-white/18 hover:text-white"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              disabled={commentBusy || !commentBody.trim()}
                              onClick={handleSubmitComment}
                              className="inline-flex cursor-pointer items-center rounded-full border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-[12px] text-cyan-100 transition-colors hover:border-cyan-200/38 hover:bg-cyan-300/16 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {commentBusy ? "Sending..." : "Add comment"}
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
