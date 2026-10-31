// Building levels for the 3D office: agents are spread across levels of at most
// AGENTS_PER_LEVEL. Called "levels" in code so they aren't confused with
// shareable floor files (src/shared/floor.ts); the UI says "Floor 1, 2, …".
// Pinned agents (Ramon) always live on the first level and don't count
// toward its cap.

export const AGENTS_PER_LEVEL = 15;
/** A bad saved count (e.g. 1e9) would otherwise allocate a huge array. */
export const MAX_LEVELS = 100;

export interface OfficeLevels {
  /** Number of levels in the building (at least 1). */
  count: number;
  /** Agent id → level index. */
  byAgent: Record<string, number>;
}

export const EMPTY_LEVELS: OfficeLevels = { count: 1, byAgent: {} };

/** Seat every agent on a level: saved placements are kept while their level
 *  has room, everyone else takes the first level with room, and a new level is
 *  added when all are full. Agents no longer on the roster are dropped. */
export function assignOfficeLevels(
  agentIds: readonly string[],
  saved: OfficeLevels,
  pinnedIds: readonly string[] = []
): OfficeLevels {
  let count = Math.min(MAX_LEVELS, Math.max(1, Math.floor(saved.count) || 1));
  const pinned = new Set(pinnedIds);
  const byAgent: Record<string, number> = {};
  const used: number[] = Array(count).fill(0);
  const unplaced: string[] = [];

  for (const id of agentIds) {
    if (pinned.has(id)) {
      byAgent[id] = 0;
      continue;
    }
    const level = saved.byAgent[id];
    if (Number.isInteger(level) && level >= 0 && level < count && used[level] < AGENTS_PER_LEVEL) {
      byAgent[id] = level;
      used[level] += 1;
    } else {
      unplaced.push(id);
    }
  }
  for (const id of unplaced) {
    let level = used.findIndex((n) => n < AGENTS_PER_LEVEL);
    if (level < 0) {
      level = count;
      count += 1;
      used.push(0);
    }
    byAgent[id] = level;
    used[level] += 1;
  }
  return { count, byAgent };
}

/** Move one agent to another level. Returns null when that level is full or
 *  the agent is pinned. */
export function moveAgentToLevel(
  state: OfficeLevels,
  agentId: string,
  level: number,
  pinnedIds: readonly string[] = []
): OfficeLevels | null {
  if (pinnedIds.includes(agentId)) return null;
  if (!Number.isInteger(level) || level < 0 || level >= state.count) return null;
  if (state.byAgent[agentId] === level) return state;
  const occupants = Object.entries(state.byAgent)
    .filter(([id, l]) => l === level && !pinnedIds.includes(id)).length;
  if (occupants >= AGENTS_PER_LEVEL) return null;
  return { count: state.count, byAgent: { ...state.byAgent, [agentId]: level } };
}

/** Delete an empty level; the levels above it move down one. Returns null for
 *  the first level (Ramon's, with the boss office), an out-of-range level, or a
 *  level that still has agents on it. */
export function removeOfficeLevel(state: OfficeLevels, level: number): OfficeLevels | null {
  if (!Number.isInteger(level) || level < 1 || level >= state.count) return null;
  if (Object.values(state.byAgent).includes(level)) return null;
  const byAgent: Record<string, number> = {};
  for (const [id, l] of Object.entries(state.byAgent)) byAgent[id] = l > level ? l - 1 : l;
  return { count: state.count - 1, byAgent };
}

/** Storage key for a level's desk assignments. */
export const levelDesksKey = (level: number): string => `devlabs.office3d.desks.${level}`;
/** Storage namespace for a level's furniture layout (keys look like `<key>:<namespace>`). */
export const levelNamespace = (level: number): string => `devlabs-v4-floor-${level + 1}`;

/** Storage changes after `removed` is deleted: that level's keys to drop, and
 *  every higher level's keys renamed one level down. Moves run lowest level
 *  first, so each one lands in a slot that is already empty. */
export function levelKeyMoves(
  keys: readonly string[],
  removed: number
): { drop: string[]; moves: Array<[string, string]> } {
  const drop: string[] = [];
  const moves: Array<[number, string, string]> = [];
  for (const k of keys) {
    let level: number;
    let keyFor: (l: number) => string;
    const desks = /^devlabs\.office3d\.desks\.(\d+)$/.exec(k);
    const furniture = /^(.*):devlabs-v4-floor-(\d+)$/.exec(k);
    if (desks) {
      level = Number(desks[1]);
      keyFor = levelDesksKey;
    } else if (furniture) {
      level = Number(furniture[2]) - 1;
      keyFor = (l) => `${furniture[1]}:${levelNamespace(l)}`;
    } else continue;
    if (level === removed) drop.push(k);
    else if (level > removed) moves.push([level, k, keyFor(level - 1)]);
  }
  moves.sort((a, b) => a[0] - b[0]);
  return { drop, moves: moves.map(([, from, to]) => [from, to]) };
}

/** Parse a stored value, falling back to one empty level on anything odd. */
export function parseOfficeLevels(raw: string | null): OfficeLevels {
  if (!raw) return EMPTY_LEVELS;
  try {
    const v = JSON.parse(raw) as Partial<OfficeLevels>;
    const count = Number.isInteger(v.count) && (v.count as number) > 0 ? Math.min(MAX_LEVELS, v.count as number) : 1;
    const byAgent: Record<string, number> = {};
    if (v.byAgent && typeof v.byAgent === 'object') {
      for (const [id, l] of Object.entries(v.byAgent)) if (Number.isInteger(l)) byAgent[id] = l as number;
    }
    return { count, byAgent };
  } catch {
    return EMPTY_LEVELS;
  }
}
