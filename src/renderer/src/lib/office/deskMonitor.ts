// Stub for the Claw3D port: DevLabs has no OpenClaw gateway, so only the shape
// the retro office reads is kept here.
export type OfficeDeskMonitorMode = "coding" | "browser" | "waiting" | "idle" | "error";

export type OfficeDeskMonitorEntry = {
  kind: "user" | "assistant" | "thinking" | "tool";
  text: string;
  live?: boolean;
};

export type OfficeDeskMonitor = {
  agentId: string;
  agentName: string;
  mode: OfficeDeskMonitorMode;
  title: string;
  subtitle: string;
  browserUrl: string | null;
  updatedAt: number | null;
  live: boolean;
  entries: OfficeDeskMonitorEntry[];
  editor: {
    fileName: string;
    language: string;
    lines: string[];
    terminalLines: string[];
    cursorLine: number;
    cursorColumn: number;
  } | null;
};
