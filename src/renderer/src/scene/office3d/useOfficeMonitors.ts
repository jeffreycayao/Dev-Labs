import { useEffect, useMemo, useRef, useState } from 'react';
import type { Agent } from '@/store/store';
import type { OfficeDeskMonitor, OfficeDeskMonitorEntry } from '@/lib/office/deskMonitor';

// Desk monitors: clicking an agent's computer opens Claw3D's "Monitor View".
// Claw3D guessed it from chat transcripts; DevLabs builds it from live hook
// events (tool + Bash command / file path), the agent's status, and the last
// file it touched, read through the folder-limited `readFile` IPC.

const MAX_EVENTS = 14;
const MAX_LINES = 60;
const EDIT_TOOLS = new Set(['Edit', 'Write', 'MultiEdit', 'Read', 'NotebookEdit']);
const BUSY = new Set(['working', 'thinking', 'compacting', 'looping']);

interface ToolEvent { tool: string; detail?: string; ts: number }

const relativeTo = (root: string, file: string): string | null => {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '');
  const r = norm(root);
  const f = norm(file);
  if (!f.toLowerCase().startsWith(`${r.toLowerCase()}/`)) return null;
  return f.slice(r.length + 1);
};

const languageOf = (file: string) => {
  const ext = file.split('.').pop()?.toLowerCase() ?? '';
  return { ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx', py: 'python', md: 'markdown', json: 'json', css: 'css', html: 'html' }[ext] ?? ext;
};

export function useOfficeMonitors(agents: readonly Agent[]): {
  monitorAgentId: string | null;
  monitorByAgentId: Record<string, OfficeDeskMonitor>;
  onMonitorSelect: (agentId: string | null) => void;
} {
  const [monitorAgentId, setMonitorAgentId] = useState<string | null>(null);
  const [events, setEvents] = useState<Record<string, ToolEvent[]>>({});
  const [file, setFile] = useState<{ agentId: string; name: string; lines: string[] } | null>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;

  useEffect(() => {
    const off = window.cth?.onHiveHookEvent?.((e) => {
      if (!e.agentId || !e.tool || e.event !== 'PreToolUse') return;
      const id = e.agentId;
      const entry: ToolEvent = { tool: e.tool, detail: e.detail, ts: Date.now() };
      setEvents((cur) => ({ ...cur, [id]: [...(cur[id] ?? []), entry].slice(-MAX_EVENTS) }));
    });
    return () => off?.();
  }, []);

  // While a monitor is open, load the last file that agent touched.
  const openEvents = monitorAgentId ? events[monitorAgentId] : undefined;
  const lastFile = openEvents?.filter((e) => EDIT_TOOLS.has(e.tool) && e.detail).at(-1)?.detail;
  useEffect(() => {
    const agent = agentsRef.current.find((a) => a.id === monitorAgentId);
    if (!agent || !lastFile) { setFile(null); return; }
    const root = agent.worktreePath || agent.cwd;
    const rel = relativeTo(root, lastFile);
    if (!rel) { setFile(null); return; }
    let live = true;
    void window.cth.readFile(root, rel).then((r) => {
      if (!live) return;
      setFile(r.ok ? { agentId: agent.id, name: rel, lines: r.content.split(/\r?\n/).slice(0, MAX_LINES) } : null);
    }).catch(() => { if (live) setFile(null); });
    return () => { live = false; };
  }, [monitorAgentId, lastFile]);

  const monitorByAgentId = useMemo(() => {
    const out: Record<string, OfficeDeskMonitor> = {};
    for (const a of agents) {
      const evs = events[a.id] ?? [];
      const busy = BUSY.has(a.status);
      const entries: OfficeDeskMonitorEntry[] = evs.slice(-8).map((e) => ({
        kind: 'tool',
        text: e.detail ? `${e.tool}: ${e.detail}` : e.tool
      }));
      if (a.lastPrompt) entries.unshift({ kind: 'user', text: a.lastPrompt.slice(0, 280) });
      if (a.recentAssistantText) entries.push({ kind: 'assistant', text: a.recentAssistantText.slice(0, 400), live: busy });
      const terminalLines = evs.filter((e) => e.tool === 'Bash' && e.detail).slice(-6).map((e) => `$ ${e.detail}`);
      const shown = file && file.agentId === a.id ? file : null;
      out[a.id] = {
        agentId: a.id,
        agentName: a.name,
        mode: a.status === 'blocked' ? 'error' : a.status === 'waiting' ? 'waiting' : busy ? 'coding' : 'idle',
        title: a.action || (busy ? 'working' : 'idle'),
        subtitle: a.project || a.cwd,
        browserUrl: null,
        updatedAt: evs.at(-1)?.ts ?? null,
        live: busy,
        entries,
        editor: shown || terminalLines.length
          ? {
              fileName: shown?.name ?? 'terminal',
              language: shown ? languageOf(shown.name) : 'shell',
              lines: shown?.lines ?? [],
              terminalLines,
              cursorLine: Math.max(1, shown?.lines.length ?? 1),
              cursorColumn: 1
            }
          : null
      };
    }
    return out;
  }, [agents, events, file]);

  return { monitorAgentId, monitorByAgentId, onMonitorSelect: setMonitorAgentId };
}
