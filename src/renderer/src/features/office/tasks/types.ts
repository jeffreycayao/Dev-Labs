// Stub for the Claw3D port: DevLabs has no OpenClaw gateway, so only the shape
// the retro office reads is kept here.
export type TaskBoardStatus = "todo" | "in_progress" | "blocked" | "review" | "done";

export type TaskBoardCard = {
  id: string;
  title: string;
  description: string;
  status: TaskBoardStatus;
  assignedAgentId: string | null;
  createdAt: string;
  updatedAt: string;
  notes: string[];
  isArchived: boolean;
  [key: string]: unknown;
};
