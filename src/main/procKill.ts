/**
 * Process-tree termination helpers (PID-release hardening).
 *
 * Every explicit kill path used to be a bare node-pty `proc.kill()` — SIGHUP to
 * the DIRECT child only. Two leaks follow: (1) a child that ignores/queues
 * SIGHUP never dies, so its PID lingers for the machine's uptime; (2) even when
 * the child dies, its own children (MCP servers, helper daemons the session
 * started) are orphaned to PID 1 and never released. With the breaker/heartbeat
 * spawning and killing sessions all day, PIDs accumulate steadily.
 *
 * The fix: the pty child is a session leader (forkpty does setsid), so its
 * process GROUP covers its descendants — after a graceful kill, verify and then
 * SIGKILL the whole group (POSIX) or `taskkill /T /F` the tree (Windows).
 *
 * Deliberate scope: callers apply this on EXPLICIT kills (breaker stop, archive,
 * respawn, app quit, hidden check sessions) — never on a natural exit, where a
 * daemon the agent intentionally left running (a dev server started via a Bash
 * tool) must survive its parent session.
 */
import { spawn, spawnSync } from 'node:child_process';

/** Grace between the polite signal and the SIGKILL escalation. */
export const KILL_GRACE_MS = 4_000;

/** Is the process still alive? Signal 0 probes without touching it. */
export function isAlive(pid: number): boolean {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

/** Forcefully kill pid and its descendants NOW. Group-SIGKILL on POSIX (falls
 *  back to the single pid when the group id is gone); `taskkill /T /F` on
 *  Windows. Killing the group of an already-dead leader is exactly the
 *  orphan-reaping case: any surviving members still hold the group id. */
export function hardKillTree(pid: number): void {
  if (!Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    try { spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], { timeout: 10_000 }); } catch { /* gone */ }
    return;
  }
  try { process.kill(-pid, 'SIGKILL'); } catch {
    try { process.kill(pid, 'SIGKILL'); } catch { /* gone */ }
  }
}

/** Snapshot the live members of process group `pgid` as pid -> start time
 *  (`lstart`, a stable full-precision timestamp). Returns null when `ps`
 *  itself fails — callers must treat null as "cannot verify", never as
 *  "group is empty". */
export function groupMembers(pgid: number): Map<number, string> | null {
  try {
    const r = spawnSync('ps', ['-axo', 'pid=,pgid=,lstart='], { timeout: 2_000 });
    if (r.error || r.status !== 0) return null;
    const out = new Map<number, string>();
    for (const line of String(r.stdout ?? '').split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+\S)\s*$/);
      if (m && Number(m[2]) === pgid) out.set(Number(m[1]), m[3]);
    }
    return out;
  } catch {
    return null;
  }
}

/** Decide whether the delayed sweep may group-SIGKILL. The hazard this guards
 *  (seen live 2026-08-30, T1007): once the leader AND its whole group are
 *  gone, the kernel can recycle the pid as the pgid of an UNRELATED new
 *  process group — a Claude session's background task, say — and the delayed
 *  `kill(-pid)` then executes an innocent bystander. Under fork-heavy load
 *  (parallel pytest suites) recycling happens within the 4s grace.
 *
 *  Sweep exactly when the group still holds at least one member from the
 *  original snapshot (same pid AND same start time — the orphan-reaping case
 *  this helper exists for). Skip when the group is empty (nothing to reap) or
 *  when every current member is a stranger (pgid recycled). When either
 *  snapshot is null (`ps` failed), fall back to sweeping — the pre-guard
 *  behavior — rather than silently leaking. */
export function shouldSweep(
  before: Map<number, string> | null,
  after: Map<number, string> | null
): boolean {
  if (before === null || after === null) return true;
  if (after.size === 0) return false;
  for (const [pid, started] of after) {
    if (before.get(pid) === started) return true;
  }
  return false;
}

/** Every pid under `root` in a `pid -> ppid` table (root excluded). Pure, so
 *  it is tested on every OS. Cycles (pid reuse) are cut by the visited set. */
export function descendantsOf(ppidOf: Map<number, number>, root: number): number[] {
  const kids = new Map<number, number[]>();
  for (const [pid, ppid] of ppidOf) {
    if (pid === ppid) continue;
    if (!kids.has(ppid)) kids.set(ppid, []);
    kids.get(ppid)!.push(pid);
  }
  const out: number[] = [];
  const seen = new Set([root]);
  const queue = [root];
  while (queue.length) {
    for (const k of kids.get(queue.shift()!) ?? []) {
      if (seen.has(k)) continue;
      seen.add(k); out.push(k); queue.push(k);
    }
  }
  return out;
}

/** POSIX `pid -> { ppid, started }` for every live process, or null when `ps`
 *  fails. `started` (lstart) lets a later kill skip a recycled pid. */
function posixTable(): Map<number, { ppid: number; started: string }> | null {
  try {
    const r = spawnSync('ps', ['-axo', 'pid=,ppid=,lstart='], { timeout: 2_000 });
    if (r.error || r.status !== 0) return null;
    const out = new Map<number, { ppid: number; started: string }>();
    for (const line of String(r.stdout ?? '').split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(\d+)\s+(.+\S)\s*$/);
      if (m) out.set(Number(m[1]), { ppid: Number(m[2]), started: m[3] });
    }
    return out;
  } catch {
    return null;
  }
}

/** At most this many `taskkill` runs at once, so firing 16 agents does not
 *  start 16 tree walks in the same instant. */
const MAX_PARALLEL_TREE_KILLS = 4;
let runningTreeKills = 0;
const treeKillQueue: Array<() => void> = [];
/** Pids handed to killTreeAsync whose taskkill has not finished yet. */
const pendingTreeKills = new Set<number>();

/** Windows: `taskkill /T /F` the tree WITHOUT blocking the main process (the
 *  old path was a spawnSync per agent, up to 10s each, one after another).
 *  Resolves when taskkill exits. No-op elsewhere. */
export function killTreeAsync(pid: number): Promise<void> {
  if (process.platform !== 'win32' || !Number.isInteger(pid) || pid <= 0) return Promise.resolve();
  pendingTreeKills.add(pid);
  return new Promise<void>((resolveDone) => {
    const run = (): void => {
      // Already hard-killed by flushPendingTreeKills (app quit): don't taskkill
      // a pid that may since belong to someone else.
      if (!pendingTreeKills.has(pid)) { treeKillQueue.shift()?.(); resolveDone(); return; }
      runningTreeKills++;
      let finished = false;
      const done = (): void => {
        if (finished) return;
        finished = true;
        runningTreeKills--;
        pendingTreeKills.delete(pid);
        treeKillQueue.shift()?.();
        resolveDone();
      };
      try {
        const child = spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true });
        child.on('exit', done);
        child.on('error', done);
        setTimeout(done, 10_000).unref?.();
      } catch { done(); }
    };
    if (runningTreeKills < MAX_PARALLEL_TREE_KILLS) run(); else treeKillQueue.push(run);
  });
}

/** Windows app quit: synchronously tree-kill every pid still queued in (or
 *  running through) killTreeAsync. kill() removes the session before its
 *  taskkill runs, so killAll never sees it, and with 4 at a time the queue can
 *  outlive the process when several agents were fired just before quit. */
export function flushPendingTreeKills(): void {
  const pids = [...pendingTreeKills];
  pendingTreeKills.clear();
  for (const pid of pids) hardKillTree(pid);
}

/** Stop a pty-hosted CLI and everything it started (MCP servers, `npx`
 *  wrappers, browsers). Windows kills the tree FIRST, while it is intact:
 *  closing ConPTY first ends the root, and a `taskkill /T` that runs after
 *  that cannot find the children any more — that is how fired agents left
 *  their MCP servers running. POSIX closes the pty (SIGHUP), then
 *  ensureKilled sweeps the group and any descendant that left it. Also fits a
 *  plain child_process (its kill() is SIGTERM). */
export function killPtyTree(proc: { pid?: number; kill: () => void }): void {
  const pid = proc.pid;
  if (process.platform === 'win32') {
    void killTreeAsync(pid ?? 0).finally(() => { try { proc.kill(); } catch { /* already gone */ } });
    return;
  }
  try { proc.kill(); } catch { /* already gone */ }
  ensureKilled(pid);
}

/** After a graceful kill (node-pty's SIGHUP), make sure the PIDs actually get
 *  released: wait a short grace, then sweep the process tree. Runs even when
 *  the leader died promptly — the sweep is what reaps grandchildren the polite
 *  signal never reached. Before sweeping, the group membership is re-checked
 *  against a snapshot taken here, so a recycled pgid is never group-killed
 *  (see shouldSweep). The timer is unref'd so it can never keep the app
 *  alive during quit. */
export function ensureKilled(pid: number | undefined, graceMs = KILL_GRACE_MS): void {
  if (typeof pid !== 'number' || !Number.isInteger(pid) || pid <= 0) return;
  if (process.platform === 'win32') {
    const t = setTimeout(() => { void killTreeAsync(pid); }, graceMs);
    t.unref?.();
    return;
  }
  const before = groupMembers(pid);
  // Children that left the group (setsid: a browser, a daemon) are not reached
  // by the group kill, so remember the descendants now, while they still have
  // their parent link.
  const table = posixTable();
  const strays = table
    ? descendantsOf(new Map([...table].map(([p, v]) => [p, v.ppid])), pid).map((p) => [p, table.get(p)!.started] as const)
    : [];
  const t = setTimeout(() => {
    if (shouldSweep(before, groupMembers(pid))) hardKillTree(pid);
    if (!strays.length) return;
    const now = posixTable();
    for (const [p, started] of strays) {
      if (now?.get(p)?.started === started) { try { process.kill(p, 'SIGKILL'); } catch { /* gone */ } }
    }
  }, graceMs);
  t.unref?.();
}
