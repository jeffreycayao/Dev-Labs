/**
 * Cost & usage analytics for the office ATM, folded from `cost-ledger.jsonl`.
 *
 * Ledger rows (hive.ts appendCostLedger) are CUMULATIVE snapshots per
 * (agent, session), and the counter restarts at ~0 after an app restart under
 * the same session id (see main/costLifetime.ts). So spend for a day is the sum
 * of the INCREASES seen that day: a drop in any counter is a restart, and the
 * new value is itself the increase since the restart. Rows before the range
 * still have to be folded, because they set the baseline the first in-range
 * row is measured against.
 *
 * Pure: no fs, no Electron. Main feeds rows; the renderer only sees the result.
 */

export interface UsageLedgerRow {
  agent_id: string;
  session_id?: string | null;
  ts: number;
  input?: number;
  output?: number;
  cache_read?: number;
  cache_creation?: number;
  model?: string | null;
  usd?: number;
}

/** Inclusive local-calendar days, `YYYY-MM-DD`. */
export interface UsageRange {
  startDate: string;
  endDate: string;
}

export interface UsageTotals {
  totalCost: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  totalTokens: number;
}

export interface UsageAnalytics {
  range: UsageRange;
  totals: UsageTotals;
  /** Distinct (agent, session) pairs that spent anything in the range. */
  sessions: number;
  byAgent: Array<{ agentId: string; agentName: string; sessions: number; totals: UsageTotals }>;
  /** Every day of the range, oldest first, zero-filled. */
  byDay: Array<{ date: string; totals: UsageTotals }>;
  byModel: Array<{ model: string; totals: UsageTotals }>;
}

export type UsageAnalyticsResult = { ok: true; data: UsageAnalytics } | { ok: false; error: string };

/** Longest range we fold in one request; a year plus slack. */
export const MAX_RANGE_DAYS = 400;
const EPS = 1e-9;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number) => String(n).padStart(2, '0');

/** Local calendar day of a timestamp, `YYYY-MM-DD`. */
export function localDay(ts: number | Date): string {
  const d = ts instanceof Date ? ts : new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function parseDay(s: string): Date | null {
  if (!DAY_RE.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return localDay(date) === s ? date : null; // rejects 2026-02-31
}

/** Validate an untrusted range from the renderer. Returns an error in plain words. */
export function validateUsageRange(input: unknown): { ok: true; range: UsageRange } | { ok: false; error: string } {
  const r = (input ?? {}) as Partial<UsageRange>;
  const start = typeof r.startDate === 'string' ? parseDay(r.startDate) : null;
  const end = typeof r.endDate === 'string' ? parseDay(r.endDate) : null;
  if (!start || !end) return { ok: false, error: 'Pick a start and end date.' };
  if (start > end) return { ok: false, error: 'The start date must be on or before the end date.' };
  if (daysBetween(start, end) + 1 > MAX_RANGE_DAYS) {
    return { ok: false, error: `Pick a range of ${MAX_RANGE_DAYS} days or fewer.` };
  }
  return { ok: true, range: { startDate: r.startDate as string, endDate: r.endDate as string } };
}

function daysBetween(a: Date, b: Date): number {
  // Round, not floor: a DST change makes one local day 23 or 25 hours long.
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

const emptyTotals = (): UsageTotals => ({ totalCost: 0, input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0 });

function addInto(t: UsageTotals, d: UsageTotals): void {
  t.totalCost += d.totalCost;
  t.input += d.input;
  t.output += d.output;
  t.cacheRead += d.cacheRead;
  t.cacheWrite += d.cacheWrite;
  t.totalTokens += d.totalTokens;
}

interface Bucket {
  day: string;
  agentId: string;
  sessionKey: string;
  model: string;
  totals: UsageTotals;
}

/**
 * Incremental fold. `add` rows in ledger (file) order, then `query` any range.
 * State is one baseline per session plus one bucket per (day, session, model),
 * so it stays small however long the ledger grows.
 */
export class UsageLedgerFold {
  private prev = new Map<string, UsageTotals>();
  private buckets = new Map<string, Bucket>();

  add(row: UsageLedgerRow): void {
    if (!row || typeof row.agent_id !== 'string' || !row.agent_id) return;
    const ts = typeof row.ts === 'number' && Number.isFinite(row.ts) ? row.ts : NaN;
    if (Number.isNaN(ts)) return;
    const cur: UsageTotals = {
      totalCost: num(row.usd),
      input: num(row.input),
      output: num(row.output),
      cacheRead: num(row.cache_read),
      cacheWrite: num(row.cache_creation),
      totalTokens: 0,
    };
    const sessionKey = `${row.agent_id}\t${row.session_id ?? ''}`;
    const prev = this.prev.get(sessionKey);
    this.prev.set(sessionKey, cur);

    const reset =
      !prev ||
      cur.totalCost < prev.totalCost - EPS ||
      cur.input < prev.input ||
      cur.output < prev.output ||
      cur.cacheRead < prev.cacheRead ||
      cur.cacheWrite < prev.cacheWrite;
    const delta: UsageTotals = reset
      ? { ...cur }
      : {
          totalCost: Math.max(0, cur.totalCost - prev.totalCost),
          input: cur.input - prev.input,
          output: cur.output - prev.output,
          cacheRead: cur.cacheRead - prev.cacheRead,
          cacheWrite: cur.cacheWrite - prev.cacheWrite,
          totalTokens: 0,
        };
    delta.totalTokens = delta.input + delta.output + delta.cacheRead + delta.cacheWrite;
    if (delta.totalCost <= EPS && delta.totalTokens === 0) return; // duplicate sample

    const day = localDay(ts);
    const model = typeof row.model === 'string' && row.model ? row.model : 'unknown';
    const key = `${day}\t${sessionKey}\t${model}`;
    let b = this.buckets.get(key);
    if (!b) {
      b = { day, agentId: row.agent_id, sessionKey, model, totals: emptyTotals() };
      this.buckets.set(key, b);
    }
    addInto(b.totals, delta);
  }

  /** `range` must already be validated. `names` maps agent id → display name. */
  query(range: UsageRange, names: Record<string, string> = {}): UsageAnalytics {
    const totals = emptyTotals();
    const days = new Map<string, UsageTotals>();
    const start = parseDay(range.startDate)!;
    const span = daysBetween(start, parseDay(range.endDate)!);
    for (let i = 0; i <= span; i++) {
      days.set(localDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)), emptyTotals());
    }
    const agents = new Map<string, { totals: UsageTotals; sessions: Set<string> }>();
    const models = new Map<string, UsageTotals>();
    const sessions = new Set<string>();

    for (const b of this.buckets.values()) {
      const day = days.get(b.day);
      if (!day) continue; // outside the range
      addInto(day, b.totals);
      addInto(totals, b.totals);
      sessions.add(b.sessionKey);
      let a = agents.get(b.agentId);
      if (!a) agents.set(b.agentId, (a = { totals: emptyTotals(), sessions: new Set() }));
      addInto(a.totals, b.totals);
      a.sessions.add(b.sessionKey);
      let m = models.get(b.model);
      if (!m) models.set(b.model, (m = emptyTotals()));
      addInto(m, b.totals);
    }

    const byCost = (x: { totals: UsageTotals }, y: { totals: UsageTotals }) =>
      y.totals.totalCost - x.totals.totalCost || y.totals.totalTokens - x.totals.totalTokens;
    return {
      range: { ...range },
      totals,
      sessions: sessions.size,
      byAgent: [...agents]
        .map(([agentId, a]) => ({ agentId, agentName: names[agentId] || agentId, sessions: a.sessions.size, totals: a.totals }))
        .sort(byCost),
      byDay: [...days].map(([date, t]) => ({ date, totals: t })),
      byModel: [...models].map(([model, t]) => ({ model, totals: t })).sort(byCost),
    };
  }
}

/** Parse ledger text, skipping blank or half-written lines. */
export function parseLedgerLines(text: string): UsageLedgerRow[] {
  const rows: UsageLedgerRow[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try { rows.push(JSON.parse(line)); } catch { /* half-written tail line */ }
  }
  return rows;
}

/** One-shot: fold `rows` and summarise `range`. */
export function aggregateUsage(
  rows: Iterable<UsageLedgerRow>,
  range: UsageRange,
  names?: Record<string, string>,
): UsageAnalytics {
  const fold = new UsageLedgerFold();
  for (const row of rows) fold.add(row);
  return fold.query(range, names);
}
