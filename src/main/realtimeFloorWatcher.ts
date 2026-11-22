/**
 * Realtime Ramon — floor delta watcher (v0.3.4).
 *
 * The voice session's context strategy is "snapshot at connect + APPEND-ONLY
 * deltas" (never session.update on instructions — that busts the prompt cache).
 * This watcher is the delta half: while a voice session is live, it polls the
 * floor's main-side signals and pushes short coalesced update sentences that
 * the renderer injects into the conversation as silent items.
 *
 * Signals (all owned by main — no renderer trust):
 *   - roster: agents appearing / archiving (hive registry)
 *   - tasks: status transitions on the kanban ledger
 *   - activity: an agent that worked and then stayed silent for QUIET_MS
 *     (≈ done or idle). Working agents pause between bursts of output all the
 *     time, so raw quiet↔streaming flips are NOT reported: they made Ramon
 *     repeat "X started producing output / X went quiet" every few seconds.
 * Deltas are debounced (≥ MIN_PUSH_GAP_MS between pushes), coalesced into one
 * parenthetical line, capped in length, and a line already pushed within
 * REPEAT_WINDOW_MS is dropped. When no session is live, nothing is emitted and
 * nothing queues — the next connect takes a fresh snapshot.
 */

interface RegistryLike {
  agents: Record<string, { name?: string; archived?: boolean }>;
  godId?: string | null;
}

export interface FloorWatcherDeps {
  enabled(): boolean;
  registry(): RegistryLike;
  tasks(): unknown;
  ptys(): Array<{ id: string; lastOutputAt: number }>;
  push(text: string): void;
  /** Clock for tests. */
  now?: () => number;
}

const POLL_MS = 5_000;
const MIN_PUSH_GAP_MS = 12_000;
const ACTIVE_WINDOW_MS = 8_000;
/** Silence that counts as "done or idle" rather than a pause between outputs. */
const QUIET_MS = 60_000;
/** The same sentence is never repeated to Ramon within this window. */
const REPEAT_WINDOW_MS = 5 * 60_000;
const MAX_PUSH_CHARS = 600;

export class RealtimeFloorWatcher {
  private deps: FloorWatcherDeps;
  private timer: ReturnType<typeof setInterval> | null = null;
  private live = false;
  private lastPushAt = 0;
  private buffer: string[] = [];
  private prevAgents = new Map<string, { archived: boolean; name: string }>();
  private prevTasks = new Map<string, { status: string; title: string }>();
  /** Agents seen producing output since their last "went quiet" line. */
  private workedSinceQuiet = new Set<string>();
  /** Sentence → when it was last pushed, for the repeat filter. */
  private recentLines = new Map<string, number>();
  private primed = false;

  constructor(deps: FloorWatcherDeps) {
    this.deps = deps;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => { try { this.tick(); } catch { /* never throw from a timer */ } }, POLL_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  setSessionLive(live: boolean): void {
    this.live = live;
    // A fresh session starts from a fresh snapshot — old buffered deltas would
    // duplicate what the snapshot already says.
    this.buffer = [];
    this.workedSinceQuiet.clear();
    this.recentLines.clear();
    this.primed = false; // re-prime so the first tick after connect diffs from NOW
  }

  /** One poll. Public for tests; the interval calls it every POLL_MS. */
  tick(): void {
    if (!this.deps.enabled()) return;

    const reg = this.deps.registry();
    const agents = new Map<string, { archived: boolean; name: string }>();
    for (const [id, m] of Object.entries(reg.agents ?? {})) {
      agents.set(id, { archived: !!m.archived, name: m.name || id });
    }

    const tasksRaw = this.deps.tasks() as { tasks?: Array<{ id?: string; status?: string; title?: string }> } | null;
    const tasks = new Map<string, { status: string; title: string }>();
    for (const t of Array.isArray(tasksRaw?.tasks) ? tasksRaw!.tasks! : []) {
      if (typeof t?.id === 'string') tasks.set(t.id, { status: t.status ?? 'todo', title: t.title ?? t.id });
    }

    const now = this.deps.now ? this.deps.now() : Date.now();
    const silentFor = new Map<string, number>();
    for (const p of this.deps.ptys()) {
      silentFor.set(p.id.replace(/^pty-/, ''), now - p.lastOutputAt);
    }

    if (this.primed && this.live) {
      // roster changes
      for (const [id, cur] of agents) {
        const prev = this.prevAgents.get(id);
        if (!prev) this.buffer.push(`${cur.name} joined the floor`);
        else if (!prev.archived && cur.archived) this.buffer.push(`${cur.name} was archived`);
        else if (prev.archived && !cur.archived) this.buffer.push(`${cur.name} is back from the archive`);
      }
      // task transitions
      for (const [id, cur] of tasks) {
        const prev = this.prevTasks.get(id);
        if (!prev) this.buffer.push(`new task "${cur.title.slice(0, 60)}"`);
        else if (prev.status !== cur.status) this.buffer.push(`task "${cur.title.slice(0, 60)}" moved to ${cur.status}`);
      }
      // "went quiet": once per stretch of work, after a real silence (not a pause)
      for (const [id, silent] of silentFor) {
        const name = agents.get(id)?.name;
        if (!name || agents.get(id)?.archived) continue;
        if (silent < ACTIVE_WINDOW_MS) this.workedSinceQuiet.add(id);
        else if (silent >= QUIET_MS && this.workedSinceQuiet.delete(id)) {
          this.buffer.push(`${name} went quiet (likely done or idle)`);
        }
      }
    }

    this.prevAgents = agents;
    this.prevTasks = tasks;
    this.primed = true;

    if (!this.live || this.buffer.length === 0) { if (!this.live) this.buffer = []; return; }
    if (now - this.lastPushAt < MIN_PUSH_GAP_MS) return;

    // Drop repeats (within one push and of anything said recently).
    for (const [line, at] of this.recentLines) if (now - at > REPEAT_WINDOW_MS) this.recentLines.delete(line);
    const fresh = [...new Set(this.buffer)].filter((line) => !this.recentLines.has(line));
    this.buffer = [];
    if (fresh.length === 0) return;
    for (const line of fresh) this.recentLines.set(line, now);

    const text = fresh.join('; ').slice(0, MAX_PUSH_CHARS);
    this.lastPushAt = now;
    this.deps.push(text);
  }
}
