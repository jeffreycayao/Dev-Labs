// Stub for the Claw3D port: DevLabs has no OpenClaw gateway, so only the shape
// the retro office reads is kept here.
import type { OfficeCleaningCue } from "@/lib/office/janitorReset";

type BooleanByAgentId = Record<string, boolean>;
type NumberByAgentId = Record<string, number>;

export type OfficeAnimationState = {
  cleaningCues: OfficeCleaningCue[];
  danceUntilByAgentId: NumberByAgentId;
  deskHoldByAgentId: BooleanByAgentId;
  githubHoldByAgentId: BooleanByAgentId;
  gymHoldByAgentId: BooleanByAgentId;
  jukeboxHoldByAgentId: BooleanByAgentId;
  phoneBoothHoldByAgentId: BooleanByAgentId;
  qaHoldByAgentId: BooleanByAgentId;
  smsBoothHoldByAgentId: BooleanByAgentId;
};
