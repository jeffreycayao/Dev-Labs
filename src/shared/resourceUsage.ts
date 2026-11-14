/**
 * What DevLabs costs the machine right now: CPU and memory of the app's whole
 * process tree (Electron, every agent CLI and everything those started), and
 * per agent. Pure, so the parsing and the math are unit-tested; the process
 * table itself is read in src/main/resourceUsage.ts.
 */

/** One process: `cpuSec` is CUMULATIVE CPU time, so two snapshots give a rate. */
export interface ProcRow { pid: number; ppid: number; memBytes: number; cpuSec: number }
export interface ProcSnapshot { atMs: number; rows: Map<number, ProcRow> }

export interface AgentUsage { id: string; name: string; procs: number; cpuPct: number; memMB: number }
export interface ResourceUsage {
  /** Share of the WHOLE machine (all cores), 0–100. Null on the first sample. */
  cpuPct: number | null;
  memMB: number;
  procs: number;
  agents: AgentUsage[];
}

/** `ps` cumulative time: `[dd-][hh:]mm:ss[.ff]` → seconds. */
export function parseCpuTime(s: string): number {
  const [days, rest] = s.includes('-') ? s.split('-') : ['0', s];
  return Number(days) * 86_400 + rest.split(':').reduce((acc, part) => acc * 60 + Number(part), 0);
}

/** `ps -axo pid=,ppid=,rss=,time=` (rss in KB). */
export function parsePsTable(out: string): Map<number, ProcRow> {
  const rows = new Map<number, ProcRow>();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\S+)$/);
    if (m) rows.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), memBytes: Number(m[3]) * 1024, cpuSec: parseCpuTime(m[4]) });
  }
  return rows;
}

/** Windows lines `pid ppid workingSetBytes cpu100ns` (see src/main/resourceUsage.ts). */
export function parseWinTable(out: string): Map<number, ProcRow> {
  const rows = new Map<number, ProcRow>();
  for (const line of out.split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$/);
    if (m) rows.set(Number(m[1]), { pid: Number(m[1]), ppid: Number(m[2]), memBytes: Number(m[3]), cpuSec: Number(m[4]) / 1e7 });
  }
  return rows;
}

/** `root` and every process under it. */
export function subtree(rows: Map<number, ProcRow>, root: number): ProcRow[] {
  const kids = new Map<number, ProcRow[]>();
  for (const r of rows.values()) {
    if (r.pid === r.ppid) continue;
    if (!kids.has(r.ppid)) kids.set(r.ppid, []);
    kids.get(r.ppid)!.push(r);
  }
  const out: ProcRow[] = [];
  const seen = new Set<number>();
  const queue = [root];
  while (queue.length) {
    const pid = queue.shift()!;
    const me = rows.get(pid);
    if (!me || seen.has(pid)) continue;
    seen.add(pid);
    out.push(me);
    for (const k of kids.get(pid) ?? []) queue.push(k.pid);
  }
  return out;
}

function sum(procs: ProcRow[], prev: ProcSnapshot | null, seconds: number, cores: number): { cpuPct: number | null; memMB: number } {
  let mem = 0;
  let cpu = 0;
  for (const p of procs) {
    mem += p.memBytes;
    const before = prev?.rows.get(p.pid);
    // A process born since the last sample counts from zero; a recycled pid
    // with less CPU than before is treated the same way.
    cpu += before && before.cpuSec <= p.cpuSec ? p.cpuSec - before.cpuSec : 0;
  }
  return {
    cpuPct: prev && seconds > 0 ? Math.round((cpu / seconds / Math.max(1, cores)) * 1000) / 10 : null,
    memMB: Math.round(mem / 1048576)
  };
}

export function summarizeUsage(
  prev: ProcSnapshot | null,
  cur: ProcSnapshot,
  rootPid: number,
  agents: { id: string; name: string; pid: number }[],
  cores: number
): ResourceUsage {
  const seconds = prev ? (cur.atMs - prev.atMs) / 1000 : 0;
  const all = subtree(cur.rows, rootPid);
  const total = sum(all, prev, seconds, cores);
  return {
    ...total,
    procs: all.length,
    agents: agents.map((a) => {
      const procs = subtree(cur.rows, a.pid);
      const s = sum(procs, prev, seconds, cores);
      return { id: a.id, name: a.name, procs: procs.length, memMB: s.memMB, cpuPct: s.cpuPct ?? 0 };
    })
  };
}
