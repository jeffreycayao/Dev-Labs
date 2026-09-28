/** A stopped terminal changes availability, not whether its owner was hired. */
export interface RosterAgent {
  id: string;
  ptyId?: string;
  isGod?: boolean;
  isAssistant?: boolean;
  status: string;
  action: string;
}

export function stoppedAgent<T extends RosterAgent>(agent: T): T {
  return { ...agent, status: 'ghost', action: 'terminal stopped — restore to continue' };
}

/** Reconcile only agents present when the PTY query began. A hire made while
 * that query is in flight must not be judged against its older result. */
export function reconcileHiredRoster<T extends RosterAgent>(
  agents: T[],
  restorable: T[],
  livePtyIds: readonly string[],
  observedAgentIds: readonly string[]
): { agents: T[]; restorable: T[]; stoppedIds: string[] } {
  const live = new Set(livePtyIds);
  const observed = new Set(observedAgentIds);
  const stopped = agents.filter((a) =>
    observed.has(a.id) && !!a.ptyId && !live.has(a.ptyId)
      && a.id !== 'god' && !a.isGod && !a.isAssistant
  );
  if (!stopped.length) return { agents, restorable, stoppedIds: [] };
  const stoppedIds = new Set(stopped.map((a) => a.id));
  return {
    agents: agents.map((a) => stoppedIds.has(a.id) ? stoppedAgent(a) : a),
    restorable: [
      ...restorable.filter((a) => !stoppedIds.has(a.id)),
      ...stopped
    ],
    stoppedIds: [...stoppedIds]
  };
}
