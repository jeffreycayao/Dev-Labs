// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
import { ipcRenderer } from 'electron';
import type { FloorManifest } from '../../shared/floor';

export type CompanyBuilderResult =
  | { ok: true; floor: FloorManifest; consentRequired?: string[]; engine: 'groq' | 'claude' }
  | { ok: false; error: string; engine?: 'groq' | 'claude' };

export const companyBuilderApi = {
  /** Ask the planner LLM for a team. Returns a validated floor; never spawns. */
  companyBuilderGenerate: (description: string) =>
    ipcRenderer.invoke('office:companyBuilder:generate', description) as Promise<CompanyBuilderResult>
};
