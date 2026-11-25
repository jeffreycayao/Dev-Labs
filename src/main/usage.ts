/**
 * Usage telemetry seam (Lane A #6.6 — Seam 1, the LOCKED contract with Oscar/#7).
 *
 * The circuit breaker (breaker.ts) and the durable cost ledger (hive.ts
 * appendCostLedger) consume usage ONLY through the `UsageProvider` interface —
 * they never read transcripts, never compute tokens, and never recompute `usd`.
 * That keeps a single source of truth for cost and lets the backend swap with
 * zero changes to the consumers, through one pull: `getAgentUsage(agentId)`,
 * implemented by the OTel TelemetryCollector.
 *
 * Two invariants every consumer must honor (Oscar's 7A.1 spike findings):
 *   (i)  Samples are CUMULATIVE snapshots (monotonic running totals). Velocity is
 *        the DIFF of consecutive pulls (Δusd/Δt, Δoutput/Δt) — never treat a
 *        single sample as an increment.
 *   (ii) `model` arrives normalized (base id, any `[1m]` suffix stripped).
 */

/** One cumulative usage snapshot for an agent. The identical row that Oscar
 *  emits, Jim (this lane) persists to cost-ledger.jsonl, and Kevin (#4) stores
 *  in the cost_ledger SQLite table — one shape across all three lanes.
 *
 *  🔒 PII-free by construction: the provider's normalize step allowlists only
 *  these fields and strips every identity attribute (user.email, account/uuid,
 *  organization.id, hashed user.id) BEFORE emitting. Persist ONLY this sample;
 *  never a raw OTel record. */
export interface AgentUsageSample {
  agentId: string;
  /** Doubles as the #6.6a --resume key AND the cost accounting/dedup key. */
  sessionId: string | null;
  ts: number;
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  /** Normalized base model id (no `[1m]` suffix), or null if unknown. */
  model: string | null;
  /** Claude-precomputed cost (live path) / transcript-fallback estimate (interim).
   *  Never recomputed by a consumer. */
  usd: number;
}

/** The seam both backends implement. */
export interface UsageProvider {
  /** PRIMARY pull. Returns a cumulative snapshot, or null when unknown. */
  getAgentUsage(agentId: string): AgentUsageSample | null;
}

/**
 * Duplicate gate for CUMULATIVE usage samples (every provider).
 *
 * `appendCostLedger` is fed a running TOTAL, not an increment, so re-appending
 * an unchanged sample writes the same row over and over. That is #56: the
 * transcript fallback did exactly this and left 2,417 identical rows behind,
 * which is why it now reports an empty `sessionId` to disqualify itself from
 * the ledger.
 *
 * The Grok provider cannot use that trick — it needs a real session id to be
 * accounted at all — so it needs this instead: append only when the numbers
 * actually moved. An idle Grok agent re-reads the same `usage.json` on every
 * beat and is correctly silent.
 *
 * `ts` is deliberately NOT part of the signature. It tracks when the file was
 * written, not what it says, and a sample whose timestamp is the only thing to
 * have changed carries no new cost.
 */
export class CumulativeSampleGate {
  private readonly last = new Map<string, string>();

  /** True when this sample differs from the last one admitted for the agent. */
  admits(sample: AgentUsageSample): boolean {
    const signature = [
      sample.sessionId, sample.input, sample.output,
      sample.cacheRead, sample.cacheCreation, sample.model, sample.usd
    ].join('|');
    // Per (agent, session): an agent's live sessions are separate ledger rows.
    const key = `${sample.agentId}\t${sample.sessionId ?? ''}`;
    if (this.last.get(key) === signature) return false;
    this.last.set(key, signature);
    return true;
  }

  /** Drop an agent's memory (archived/despawned) so the map cannot grow forever. */
  forget(agentId: string): void {
    for (const key of this.last.keys()) if (key.startsWith(`${agentId}\t`)) this.last.delete(key);
  }
}
