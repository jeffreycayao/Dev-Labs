import type { AgentState } from "@/features/agents/state/store";

export type SessionEpochSnapshot = Record<string, number>;

export type OfficeCleaningCue = {
  id: string;
  agentId: string;
  agentName: string;
  ts: number;
};

