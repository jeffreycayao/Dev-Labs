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
