// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
import { ipcRenderer } from 'electron';
import type { StandupAgentInput, StandupCard } from '../../shared/office/standup';

export const standupApi = {
  /** One standup card per agent. `tasks` is what cth.hiveTasks() returned. */
  standupCards: (agents: StandupAgentInput[], tasks: unknown) =>
    ipcRenderer.invoke('office:standup:cards', agents, tasks) as Promise<StandupCard[]>
};
