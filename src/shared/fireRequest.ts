/**
 * Firing an agent from the hive side (the orchestrator) and keeping the floor in
 * step with it. Pure, so the rules are unit-tested (test/fire-request.test.cjs).
 *
 * The floor the user sees is the renderer roster (roster.json); the hive's view is
 * registry.json. Only the real fire path (main's `fireAgent`) updates both, so
 * Ramon gets a queue into it — HIVE_ROOT/fire-requests/<id>.json — instead of
 * editing registry.json by hand, and main repairs any drift it finds.
 *
 * TRUST. Every sandboxed agent can write the whole hive root, registry.json and
 * fire-requests/ included. So nothing here trusts a file's contents for WHO asked:
 * a fire-request counts only with the orchestrator's own hook token (an env secret
 * main issued it, resolved by main to an agent id), and the orchestrator's id comes
 * from main (`godId`, recorded when the app window spawned it), never the registry.
 * Drift repair never stops a terminal: it only archives cards of agents that have
 * none running, which the Archived section undoes.
 */

/** The slice of the hive registry these rules read. */
export interface FireRegistryView {
  godId?: string | null;
  agents: Record<string, { archived?: boolean; isGod?: boolean } | undefined>;
}

export type FireRequestResult = { ok: true; id: string } | { ok: false; reason: string };

/** Agent ids are hive folder names: keep them to the characters spawn produces. */
const AGENT_ID = /^[A-Za-z0-9._-]{1,128}$/;

const isOrchestrator = (id: string, reg: FireRegistryView, godId: string | null): boolean =>
  id === godId || id === reg.godId || !!reg.agents[id]?.isGod;

/** Validate one fire-request. `raw` is the parsed JSON (agent-writable, so
 *  untrusted); the target comes from `id`, else the file name. `author` is the
 *  agent main resolved from the request's `token`; `godId` is main's own record
 *  of the orchestrator. */
export function parseFireRequest(
  raw: unknown,
  fileName: string,
  reg: FireRegistryView,
  author: string | undefined,
  godId: string | null
): FireRequestResult {
  if (!godId || author !== godId) return { ok: false, reason: 'only the orchestrator can fire (missing or wrong "token")' };
  const field = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
  const id = (typeof field === 'string' && field.trim() ? field : fileName.replace(/\.json$/i, '')).trim();
  if (!AGENT_ID.test(id)) return { ok: false, reason: `"${id.slice(0, 60)}" is not an agent id` };
  if (!reg.agents[id]) return { ok: false, reason: `no agent "${id}" in the registry` };
  if (isOrchestrator(id, reg, godId)) return { ok: false, reason: 'the orchestrator cannot fire itself' };
  return { ok: true, id };
}

/** Ids the registry marks fired that the floor still shows (as a card or as a
 *  restorable agent), minus any with a live terminal and the orchestrator. Their
 *  cards only need archiving; nothing is stopped. */
export function firedStillOnFloor(
  reg: FireRegistryView,
  roster: { agents?: unknown[]; restorable?: unknown[] } | null | undefined,
  live: ReadonlySet<string> = new Set(),
  godId: string | null = null
): string[] {
  if (!roster) return [];
  const onFloor = new Set<string>();
  for (const a of [...(roster.agents ?? []), ...(roster.restorable ?? [])]) {
    const id = a && typeof a === 'object' ? (a as { id?: unknown }).id : undefined;
    if (typeof id === 'string') onFloor.add(id);
  }
  return [...onFloor].filter((id) => reg.agents[id]?.archived === true && !live.has(id) && !isOrchestrator(id, reg, godId));
}
