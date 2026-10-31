// Standup cards (ported from Claw3D's standup service, without Jira or manual
// notes): one card per agent from the hive task board plus that agent's recent
// commits. Pure, so main builds them and tests load it without Electron.
// The card shape matches StandupSummaryCard in the renderer's standup types.

export type StandupAgentInput = { id: string; name: string; cwd?: string };

export type StandupCommitInput = { sha: string; subject: string; author: string };

export type StandupCard = {
  agentId: string;
  agentName: string;
  speech: string;
  currentTask: string;
  blockers: string[];
  recentCommits: { id: string; title: string; subtitle: string | null; url: string | null }[];
  activeTickets: { id: string; key: string; title: string; status: string; url: string | null }[];
  manualNotes: string[];
  sourceStates: { kind: 'github' | 'jira' | 'manual'; ready: boolean; stale: boolean; updatedAt: string | null; error: string | null }[];
};

type Task = {
  id: string;
  title: string;
  assignee: string;
  status: string;
  humanQA: { q?: unknown; a?: unknown; dismissedAt?: unknown }[];
};

const STATUS_LABEL: Record<string, string> = { doing: 'In progress', blocked: 'Blocked', todo: 'To do' };
const STATUS_ORDER: Record<string, number> = { doing: 0, blocked: 1, todo: 2 };

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

/** hive.tasks() is `{ tasks: HiveTask[] }` read from disk: keep only cards that
 *  have the fields a standup needs. */
export function standupTasks(raw: unknown): Task[] {
  const list = (raw as { tasks?: unknown } | null)?.tasks;
  if (!Array.isArray(list)) return [];
  const out: Task[] = [];
  for (const t of list) {
    if (!t || typeof t !== 'object') continue;
    const r = t as Record<string, unknown>;
    const id = str(r.id);
    const assignee = str(r.assignee);
    if (!id || !assignee) continue;
    out.push({
      id,
      title: str(r.title) || id,
      assignee,
      status: str(r.status),
      humanQA: Array.isArray(r.humanQA) ? r.humanQA.filter((q) => q && typeof q === 'object') : []
    });
  }
  return out;
}

export function standupSpeech(agentName: string, currentTask: string, blockers: string[]): string {
  const headline = `${agentName}: ${currentTask}`.trim();
  if (headline.length <= 110 && blockers.length === 0) return headline;
  if (blockers.length > 0) {
    const combined = `${headline}. Blocker: ${blockers[0]}.`;
    if (combined.length <= 120) return combined;
  }
  return headline.length <= 120 ? headline : `${headline.slice(0, 117).trimEnd()}...`;
}

export function buildStandupCards(
  agents: StandupAgentInput[],
  rawTasks: unknown,
  commitsByAgentId: Record<string, StandupCommitInput[]>
): StandupCard[] {
  const tasks = standupTasks(rawTasks);
  return agents.map((agent) => {
    const open = tasks
      .filter((t) => t.assignee === agent.id && t.status in STATUS_ORDER)
      .sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
    const blockers: string[] = [];
    for (const t of open) {
      if (t.status === 'blocked') blockers.push(`"${t.title}" is blocked`);
      // A question to the human with no answer yet holds the card up too.
      for (const qa of t.humanQA) {
        const q = str(qa.q);
        if (q && !str(qa.a) && !qa.dismissedAt) blockers.push(`Waiting on your answer: ${q}`);
      }
    }
    const commits = (commitsByAgentId[agent.id] ?? []).slice(0, 3);
    const currentTask =
      open.find((t) => t.status === 'doing')?.title ??
      open[0]?.title ??
      (commits[0] ? `Last commit: ${commits[0].subject}` : 'No task on the board.');
    return {
      agentId: agent.id,
      agentName: agent.name,
      speech: standupSpeech(agent.name, currentTask, blockers),
      currentTask,
      blockers,
      recentCommits: commits.map((c) => ({
        id: c.sha,
        title: c.subject,
        subtitle: `${c.sha.slice(0, 7)} · ${c.author}`,
        url: null
      })),
      activeTickets: open.slice(0, 5).map((t) => ({
        id: t.id,
        key: t.id,
        title: t.title,
        status: STATUS_LABEL[t.status],
        url: null
      })),
      manualNotes: [],
      sourceStates: []
    };
  });
}
