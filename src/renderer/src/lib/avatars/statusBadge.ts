// The little badge over an agent's head on the office floor. Pure, so it runs
// under node:test (test/avatar-status-badge.test.cjs).
//
// "working": the agent is busy. "waiting": it has nothing to do and sits at its
// desk ready for a prompt. "idle": it has wandered off (lounge, gym, dancing).
// "error": it stopped on an error and needs a look. Colours are the ones the
// nameplate dot already uses, so the two never disagree.

export type AgentBadgeStatus = "working" | "idle" | "error";
export type AgentBadgeState =
  | "walking" | "sitting" | "standing" | "away" | "working_out" | "dancing";

export type AgentStatusBadge = {
  label: "working" | "waiting" | "idle" | "error";
  /** Dot and border colour. */
  color: string;
};

const WORKING = "#22c55e";
const WAITING = "#f59e0b";
const IDLE = "#94a3b8";
const ERROR = "#ef4444";

export const agentStatusBadge = (
  status: AgentBadgeStatus,
  state: AgentBadgeState,
): AgentStatusBadge => {
  if (status === "error") return { label: "error", color: ERROR };
  if (status === "working" || state === "working_out" || state === "dancing") {
    return { label: "working", color: WORKING };
  }
  if (state === "sitting" || state === "standing") return { label: "waiting", color: WAITING };
  return { label: "idle", color: IDLE };
};
