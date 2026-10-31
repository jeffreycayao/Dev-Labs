// Standup meeting cards (ported from Claw3D's /api/office/standup/run, without Jira).
// The hive manager is a local in index.ts, so the renderer passes hive.tasks() in.
import { ipcMain } from 'electron';
import { getLog } from '../git';
import { buildStandupCards, type StandupAgentInput, type StandupCommitInput } from '../../shared/office/standup';

const MAX_AGENTS = 50;

export function registerStandupIpc(): void {
  ipcMain.handle('office:standup:cards', async (_evt, rawAgents: unknown, tasks: unknown) => {
    const agents: StandupAgentInput[] = (Array.isArray(rawAgents) ? rawAgents : [])
      .slice(0, MAX_AGENTS)
      .filter((a): a is StandupAgentInput => !!a && typeof a.id === 'string' && typeof a.name === 'string')
      .map((a) => ({ id: a.id, name: a.name, cwd: typeof a.cwd === 'string' ? a.cwd : undefined }));

    // shortcut: every commit in the agent's repo (not only its own), since agents commit as the user.
    const logs = new Map<string, Promise<StandupCommitInput[]>>();
    for (const cwd of new Set(agents.map((a) => a.cwd).filter((c): c is string => !!c))) {
      logs.set(cwd, getLog(cwd, 3).then((r) => (Array.isArray(r) ? r : []), () => []));
    }
    const commitsByAgentId: Record<string, StandupCommitInput[]> = {};
    for (const a of agents) if (a.cwd) commitsByAgentId[a.id] = await logs.get(a.cwd)!;

    return buildStandupCards(agents, tasks, commitsByAgentId);
  });
}
