// Pure helpers for the 3D office's activity signals (see
// src/renderer/src/scene/office3d/useOfficeActivity.ts).

const TEST_COMMAND_RE =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:vitest|jest|mocha|pytest|playwright\s+test|phpunit|rspec)\b|\bgo\s+test\b|\bcargo\s+test\b|\bnode\s+--test\b|\bdotnet\s+test\b/i;

/** True when a Bash tool call's text looks like it runs a test suite. */
export function isTestCommand(text: string | undefined | null): boolean {
  return typeof text === 'string' && TEST_COMMAND_RE.test(text);
}

/** How long a "write tests" / "review the PRs" prompt keeps an agent in the QA
 *  lab or server room. Without an end, "fix X and run tests" parked it forever. */
export const ROOM_HOLD_MS = 90_000;

/** The agents in `ids` whose timed hold is still running at `now` (0 = released). */
export function activeHolds(untils: Record<string, number>, now: number, ids: ReadonlySet<string>): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [id, until] of Object.entries(untils)) if (ids.has(id) && until > now) out[id] = true;
  return out;
}

/** Agent statuses that mean it is doing a task; any other status is free. */
export const BUSY_STATUSES: ReadonlySet<string> = new Set(['working', 'thinking', 'compacting', 'looping']);

/** While music plays, a free agent dances for DANCE_MS of every DANCE_CYCLE_MS and roams the rest. */
export const DANCE_CYCLE_MS = 40_000;
export const DANCE_MS = 14_000;

/** When this agent's current dance ends, or 0 while it roams. Each agent's cycle is
 *  offset by its id, so the floor doesn't stop and start dancing all at once. */
export function danceUntil(agentId: string, now: number): number {
  let hash = 0;
  for (let i = 0; i < agentId.length; i++) hash = (hash * 31 + agentId.charCodeAt(i)) | 0;
  // Mix the hash so ids differing by one letter still land far apart in the cycle.
  const phase = (now + (Math.imul(hash, 2654435761) >>> 0)) % DANCE_CYCLE_MS;
  return phase < DANCE_MS ? now + DANCE_MS - phase : 0;
}

/** Index of the free desk closest to `from` (the first free one when the position is unknown). */
export function nearestFreeDesk(
  from: { x: number; y: number } | null,
  desks: readonly { x: number; y: number }[],
  taken: ReadonlySet<number>
): number | undefined {
  let best: number | undefined;
  let bestDist = Infinity;
  desks.forEach((d, i) => {
    if (taken.has(i)) return;
    const dist = from ? Math.hypot(d.x - from.x, d.y - from.y) : i;
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  });
  return best;
}
