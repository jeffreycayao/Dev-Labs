// Agency roster bridge (resources/agency-agents). Spread into window.cth in ./index.ts.
import { ipcRenderer } from 'electron';
import type { AgencyListResult, AgencyReadResult } from '../shared/agencyAgents';

export const agencyApi = {
  /** The vendored agency-agents index + division labels. Read-only. */
  agencyList: () => ipcRenderer.invoke('agency:list') as Promise<AgencyListResult>,
  /** One persona's markdown by index id. Read-only; never spawns. */
  agencyRead: (id: string) => ipcRenderer.invoke('agency:read', id) as Promise<AgencyReadResult>
};
