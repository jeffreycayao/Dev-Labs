"use client";


import type { OfficeDeskMonitor } from "@/lib/office/deskMonitor";

export function MonitorImmersiveContent({
  monitor,
}: {
  monitor: OfficeDeskMonitor;
}) {
  const editor = monitor.editor;
  return (
    <div className="absolute inset-0 overflow-hidden bg-[var(--color-office-bg-3)] text-[#d4d4d4]">
      <div className="flex h-full flex-col">
        <div className="flex h-10 items-center justify-between border-b border-white/6 bg-[var(--color-office-bg-5)] px-4">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
            <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
            <span className="h-3 w-3 rounded-full bg-[#28c840]" />
          </div>
          <div className="text-[12px] font-medium text-white/65">
            openclaw-control-center
          </div>
          <div className="flex items-center gap-2 text-[11px] text-white/40">
            <span>[v]</span>
            <span>[^]</span>
            <span>[]</span>
          </div>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="flex w-[54px] flex-col items-center gap-3 border-r border-white/6 bg-[var(--color-office-bg-3)] py-4">
            <div className="h-8 w-8 rounded-lg bg-white/8 ring-1 ring-white/6" />
            <div className="h-8 w-8 rounded-lg bg-[var(--color-office-bg-5)]" />
            <div className="h-8 w-8 rounded-lg bg-[var(--color-office-bg-5)]" />
            <div className="h-8 w-8 rounded-lg bg-[var(--color-office-bg-5)]" />
            <div className="mt-auto h-8 w-8 rounded-lg bg-[var(--color-office-bg-5)]" />
          </div>
          <div className="flex w-[240px] flex-col border-r border-white/6 bg-[var(--color-office-bg-4)]">
            <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
              Openclaw-Control-Center
            </div>
            <div className="flex-1 space-y-1 px-3 py-3 font-mono text-[12px]">
              <div className="px-2 pb-1 text-white/35">src</div>
              <div className="rounded-md bg-white/6 px-3 py-2 text-white/85">app</div>
              <div className="rounded-md px-3 py-2 text-white/45">components</div>
              <div className="rounded-md px-3 py-2 text-white/45">features</div>
              <div className="ml-3 mt-1 space-y-1 border-l border-white/6 pl-3">
                <div className="rounded-md px-2 py-1 text-white/45">retro-office</div>
                <div className="rounded-md bg-[var(--color-office-bg-5)] px-2 py-1 text-[var(--color-office-lime-300)]">
                  {editor?.fileName ?? "workbench.tsx"}
                </div>
              </div>
              <div className="mt-5 px-2 text-[11px] uppercase tracking-[0.2em] text-white/28">
                Agent
              </div>
              <div className="rounded-md border border-white/6 bg-black/20 px-3 py-2 text-white/82">
                {monitor.agentName}
              </div>
              <div className="rounded-md px-3 py-2 text-[11px] leading-5 text-white/42">
                {monitor.title} · {monitor.subtitle}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 flex-col bg-[var(--color-office-bg-3)]">
            <div className="flex items-center justify-between border-b border-white/6 bg-[var(--color-office-bg-4)] px-3">
              <div className="flex items-end gap-1">
                <div className="border-x border-t border-white/6 bg-[var(--color-office-bg-4)] px-4 py-2 font-mono text-[12px] text-white/85">
                  RetroOffice3D.tsx
                </div>
                <div className="px-3 py-2 font-mono text-[12px] text-white/35">
                  {editor?.fileName ?? "workbench.tsx"}
                </div>
              </div>
              <div className="rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.18em] text-emerald-200/90">
                {monitor.live ? "Live" : "Idle"}
              </div>
            </div>
            <div className="flex min-h-0 flex-1">
              <div className="flex min-w-0 flex-1 flex-col">
                <div className="grid min-h-0 flex-1 grid-cols-[56px_minmax(0,1fr)] bg-[var(--color-office-bg-3)] font-mono">
                  <div className="border-r border-white/6 bg-[var(--color-office-bg-3)] py-4 text-right text-[13px] leading-8 text-white/20">
                    {(editor?.lines ?? []).map((_, index) => (
                      <div key={`line-no-${index}`} className="pr-3">
                        {index + 994}
                      </div>
                    ))}
                  </div>
                  <div className="relative overflow-auto py-4 pr-6 text-[17px] leading-8 text-[#d4d4d4]">
                    {(editor?.lines ?? []).map((line, index) => (
                      <div key={`editor-line-${index}`} className="whitespace-pre pl-5">
                        {line}
                      </div>
                    ))}
                    {editor ? (
                      <div
                        className="pointer-events-none absolute h-7 w-[2px] bg-[var(--color-office-lime-300)]"
                        style={{
                          top: `${16 + (editor.cursorLine - 1) * 32}px`,
                          left: `${20 + Math.max(0, editor.cursorColumn - 1) * 9.8}px`,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
                <div className="h-[28%] border-t border-white/6 bg-[var(--color-office-bg-3)]">
                  <div className="border-b border-white/6 px-4 py-2 font-mono text-[11px] uppercase tracking-[0.18em] text-white/32">
                    Terminal
                  </div>
                  <div className="space-y-2 overflow-auto px-4 py-3 font-mono text-[13px] text-[var(--color-office-lime-300)]">
                    {(
                      editor?.terminalLines ?? monitor.entries.map((entry) => entry.text)
                    ).map((line, index) => (
                      <div
                        key={`terminal-${index}`}
                        className="whitespace-pre-wrap break-words"
                      >
                        {line}
                      </div>
                    ))}
                    {(editor?.terminalLines ?? []).length === 0 ? (
                      <div className="text-white/35">No terminal output yet.</div>
                    ) : null}
                  </div>
                </div>
              </div>
              <div className="flex w-[290px] flex-col border-l border-white/6 bg-[var(--color-office-bg-4)]">
                <div className="border-b border-white/6 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.2em] text-white/45">
                  Agent Movement And Behavior
                </div>
                <div className="flex-1 space-y-3 overflow-auto px-4 py-4">
                  {monitor.entries.length > 0 ? (
                    monitor.entries.map((entry, index) => (
                      <div
                        key={`${monitor.agentId}-panel-${entry.kind}-${index}`}
                        className={`rounded-lg border px-3 py-3 ${
                          entry.kind === "user"
                            ? "border-amber-400/10 bg-amber-400/8"
                            : entry.kind === "tool"
                              ? "border-sky-400/10 bg-sky-400/8"
                              : entry.kind === "thinking"
                                ? "border-fuchsia-400/10 bg-fuchsia-400/8"
                                : "border-white/8 bg-white/[0.04]"
                        }`}
                      >
                        <div className="mb-2 text-[10px] uppercase tracking-[0.22em] text-white/28">
                          {entry.kind}
                          {entry.live ? " · live" : ""}
                        </div>
                        <div className="whitespace-pre-wrap break-words font-mono text-[12px] leading-5 text-white/76">
                          {entry.text}
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-white/8 bg-white/[0.03] px-3 py-4 text-[12px] text-white/40">
                      No live activity yet.
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/6 bg-[#0e639c] px-4 py-2 font-mono text-[11px] text-white">
              <div className="flex items-center gap-4">
                <span>{editor?.language ?? "tsx"}</span>
                <span>UTF-8</span>
                <span>Spaces: 2</span>
              </div>
              <div className="flex items-center gap-4 text-white/85">
                <span>Ln {editor?.cursorLine ?? 1}</span>
                <span>Col {editor?.cursorColumn ?? 1}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
