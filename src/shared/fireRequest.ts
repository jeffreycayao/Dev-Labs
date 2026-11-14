/**
 * Firing an agent from the hive side (the orchestrator) and keeping the floor in
 * step with it. Pure, so the rules are unit-tested (test/fire-request.test.cjs).
 *
 * The floor the user sees is the renderer roster (roster.json); the hive's view is
 * registry.json. Only the real fire path (main's `fireAgent`) updates both, so
 * Ramon gets a queue into it — HIVE_ROOT/fire-requests/<id>.json — instead of
 * editing registry.json by hand, and main repairs any drift it finds.
 */

/** The slice of the hive registry these rules read. */
export interface FireRegistryView {
  godId: string | null;
  agents: Record<string, { archived?: boolean; isGod?: boolean } | undefined>;
}

export type FireRequestResult = { ok: true; id: string } | { ok: false; reason: string };

/** Agent ids are hive folder names: keep them to the characters spawn produces. */
const AGENT_ID = /^[A-Za-z0-9._-]{1,128}$/;

/** Validate one fire-request. `raw` is the parsed JSON (orchestrator-authored, so
 *  untrusted); the agent id comes from `id`, else the file name. */
export function parseFireRequest(raw: unknown, fileName: string, reg: FireRegistryView): FireRequestResult {
  const field = raw && typeof raw === 'object' ? (raw as { id?: unknown }).id : undefined;
  const id = (typeof field === 'string' && field.trim() ? field : fileName.replace(/\.json$/i, '')).trim();
  if (!AGENT_ID.test(id)) return { ok: false, reason: `"${id.slice(0, 60)}" is not an agent id` };
  const agent = reg.agents[id];
  if (!agent) return { ok: false, reason: `no agent "${id}" in the registry` };
  if (id === reg.godId || agent.isGod) return { ok: false, reason: 'the orchestrator cannot fire itself' };
  return { ok: true, id };
}

/** Ids the registry marks fired but the floor still shows (as a card or as a
 *  restorable agent). Each needs the fire path run so the card is archived. */
export function firedStillOnFloor(
  reg: FireRegistryView,
  roster: { agents?: unknown[]; restorable?: unknown[] } | null | undefined
): string[] {
  if (!roster) return [];
  const onFloor = new Set<string>();
  for (const a of [...(roster.agents ?? []), ...(roster.restorable ?? [])]) {
    const id = a && typeof a === 'object' ? (a as { id?: unknown }).id : undefined;
    if (typeof id === 'string') onFloor.add(id);
  }
  return [...onFloor].filter((id) => reg.agents[id]?.archived === true && id !== reg.godId);
}
