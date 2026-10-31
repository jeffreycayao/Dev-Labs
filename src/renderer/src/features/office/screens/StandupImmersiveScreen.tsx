// Ported from Claw3D. DevLabs cards come from the hive task board and git
// (src/shared/office/standup.ts): tasks replace Jira tickets, no manual notes.
import { X } from "lucide-react";

import type { StandupMeeting } from "@/lib/office/standup/types";

const label = "font-mono text-[10px] uppercase tracking-[0.16em] text-white/35";
const empty = "font-mono text-[11px] text-white/35";
const row = "rounded border border-white/8 bg-black/20 px-3 py-2";

export function StandupImmersiveScreen({
  meeting,
  onClose,
}: {
  meeting: StandupMeeting;
  onClose: () => void;
}) {
  const speaker = meeting.cards.find((card) => card.agentId === meeting.currentSpeakerAgentId);
  return (
    <div className="fixed inset-0 z-50 bg-[var(--color-office-bg-0)]/96 text-white">
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between border-b border-cyan-500/15 px-6 py-4">
          <div>
            <div className="font-mono text-[11px] uppercase tracking-[0.28em] text-cyan-200/85">
              Standup board
            </div>
            <div className="mt-1 font-mono text-[12px] text-white/50">
              {meeting.phase === "gathering"
                ? "Everyone is walking to the meeting table."
                : meeting.phase === "in_progress"
                  ? "Each agent is giving their update."
                  : "Standup is over. This is what everyone said."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] uppercase tracking-[0.16em] text-white/70 transition-colors hover:border-white/20 hover:text-white"
          >
            <X className="h-4 w-4" />
            Close
          </button>
        </div>

        <div className="grid gap-4 border-b border-cyan-500/10 px-6 py-4 font-mono text-[11px] text-white/60 md:grid-cols-2">
          <div>Speaking: {speaker?.agentName ?? "Nobody yet"}</div>
          <div>
            {meeting.arrivedAgentIds.length}/{meeting.participantOrder.length} at the table
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 xl:grid-cols-3">
            {meeting.cards.map((card) => {
              const isSpeaking = card.agentId === meeting.currentSpeakerAgentId;
              return (
                <section
                  key={card.agentId}
                  className={`rounded-2xl border px-4 py-4 ${
                    isSpeaking
                      ? "border-cyan-400/35 bg-cyan-500/[0.08]"
                      : "border-white/10 bg-white/[0.03]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-lg font-semibold text-white">{card.agentName}</div>
                    {isSpeaking ? (
                      <div className="rounded border border-cyan-400/30 bg-cyan-500/10 px-2 py-1 font-mono text-[10px] uppercase tracking-[0.16em] text-cyan-100">
                        Speaking
                      </div>
                    ) : null}
                  </div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className={label}>Working on</div>
                      <div className="mt-1 text-sm leading-6 text-white/85">{card.currentTask}</div>
                    </div>

                    <div>
                      <div className={label}>Tasks on the board</div>
                      <div className="mt-2 space-y-2">
                        {card.activeTickets.length === 0 ? (
                          <div className={empty}>No open tasks.</div>
                        ) : (
                          card.activeTickets.map((task) => (
                            <div key={task.id} className={row}>
                              <div className="text-sm text-white/82">{task.title}</div>
                              <div className="mt-1 font-mono text-[10px] text-white/40">{task.status}</div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className={label}>Recent commits</div>
                      <div className="mt-2 space-y-2">
                        {card.recentCommits.length === 0 ? (
                          <div className={empty}>No recent commits.</div>
                        ) : (
                          card.recentCommits.map((commit) => (
                            <div key={commit.id} className={row}>
                              <div className="text-sm text-white/82">{commit.title}</div>
                              {commit.subtitle ? (
                                <div className="mt-1 font-mono text-[10px] text-white/40">{commit.subtitle}</div>
                              ) : null}
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div>
                      <div className={label}>Blockers</div>
                      <div className="mt-2 space-y-2">
                        {card.blockers.length === 0 ? (
                          <div className="font-mono text-[11px] text-emerald-200/75">Nothing blocking.</div>
                        ) : (
                          card.blockers.map((blocker, index) => (
                            <div
                              key={`${card.agentId}-blocker-${index}`}
                              className="rounded border border-rose-400/20 bg-rose-500/[0.06] px-3 py-2 text-sm text-rose-100/90"
                            >
                              {blocker}
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
