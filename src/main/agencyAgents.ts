// The agency-agents roster (resources/agency-agents, vendored by
// tools/sync-agency-agents.cjs). Two read-only handlers: the index for the Add
// Agent modal's Agency tab, and one persona's markdown when the user picks it.
// Nothing here spawns; the renderer turns the markdown into a hire manifest
// (shared/agencyAgents.ts) that pre-fills the modal for review.
import { ipcMain } from 'electron';
import { readFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import type { AgencyAgentEntry, AgencyDivision, AgencyListResult, AgencyReadResult } from '../shared/agencyAgents';

interface Loaded {
  agents: AgencyAgentEntry[];
  divisions: Record<string, AgencyDivision>;
  source: { repo: string; commit: string };
}

export function registerAgencyAgentsIpc(dir: () => string): void {
  let cache: Loaded | null = null;
  const load = (): Loaded => {
    if (cache) return cache;
    const index = JSON.parse(readFileSync(join(dir(), 'index.json'), 'utf8')) as { source: Loaded['source']; agents: AgencyAgentEntry[] };
    const divisions = JSON.parse(readFileSync(join(dir(), 'divisions.json'), 'utf8')) as { divisions: Record<string, AgencyDivision> };
    cache = { agents: index.agents, divisions: divisions.divisions, source: index.source };
    return cache;
  };
  const fail = (e: unknown): { ok: false; error: string } =>
    ({ ok: false, error: e instanceof Error ? e.message : String(e) });

  ipcMain.handle('agency:list', (): AgencyListResult => {
    try { return { ok: true, ...load() }; } catch (e) { return fail(e); }
  });

  ipcMain.handle('agency:read', (_evt, id: unknown): AgencyReadResult => {
    if (typeof id !== 'string' || id.length > 120) return { ok: false, error: 'Unknown agent.' };
    try {
      const entry = load().agents.find((a) => a.id === id);
      if (!entry) return { ok: false, error: 'Unknown agent.' };
      // The file path comes from our own index, but stay inside the resource dir anyway.
      const root = resolve(dir());
      const file = resolve(root, entry.file);
      if (!file.startsWith(root + sep)) return { ok: false, error: 'Unknown agent.' };
      return { ok: true, markdown: readFileSync(file, 'utf8') };
    } catch (e) { return fail(e); }
  });
}
