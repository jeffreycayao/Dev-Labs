/**
 * Realtime Ramon — audio token pricing for the OpenAI gpt-realtime-2 voice loop
 * (card rt-9, cost-guard). Shared so main (src/main/realtime.ts) and the renderer
 * cost store (src/renderer/src/realtime/costStore.ts) price from one source.
 * Pure + dependency-free (no electron, no
 * main-only imports) so it's safe to import from either process.
 *
 * Pricing (locked plan / board): gpt-realtime-2 AUDIO tokens bill at $32 per 1M
 * input and $64 per 1M output. A voice turn is dominated by audio; text tokens
 * (instructions, tool args) and cached tokens are cheaper. We deliberately price
 * ALL input/output tokens at the audio rate: for a cost GUARD a conservative
 * UPPER bound is the safe choice (warn early rather than under-count), and it uses
 * only the authoritative audio numbers rather than guessing text/cache rates. The
 * raw token counts are surfaced alongside the dollar figure so it stays auditable.
 */

/**
 * The realtime voice model Talk connects to. Lives HERE, in shared, because it is
 * named in user-facing Settings copy as well as used by the main-process mint —
 * a model string duplicated across a process boundary is one that eventually
 * disagrees with itself, and the half users read is the half nobody notices is
 * stale. `src/main/realtime.ts` re-exports this as its own REALTIME_MODEL.
 */
export const REALTIME_MODEL = 'gpt-realtime-2.1';

/** USD per 1,000,000 audio tokens (gpt-realtime-2). */
export const REALTIME_AUDIO_INPUT_PER_MTOK = 32;
export const REALTIME_AUDIO_OUTPUT_PER_MTOK = 64;

/** USD per 1,000,000 tokens on Gemini Live, priced the same conservative way
 *  (every token at the audio rate).
 *  shortcut: no published price for GEMINI_LIVE_MODEL ('gemini-3.8-live') was
 *  found; these are the highest Live audio rates on ai.google.dev/gemini-api/
 *  docs/pricing as of 2026-11-21 (Gemini 3.5 Live Translate: $3.50 in, $21 out).
 *  Re-check that page and replace them once the model is listed. */
export const GEMINI_LIVE_INPUT_PER_MTOK = 3.5;
export const GEMINI_LIVE_OUTPUT_PER_MTOK = 21;

export type RealtimeProvider = 'openai' | 'google';

/**
 * A usage delta as reported by the realtime session. Accepts both the SDK's
 * camelCase (`inputTokens`) and the raw realtime API's snake_case
 * (`input_tokens`) so the caller can forward whatever shape it has.
 */
export interface RealtimeUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  total_tokens?: number;
  /** Gemini Live `usageMetadata` (per turn). Thinking tokens bill as output,
   *  tool-use prompt tokens as input. */
  promptTokenCount?: number;
  responseTokenCount?: number;
  thoughtsTokenCount?: number;
  toolUsePromptTokenCount?: number;
}

/** Pull input/output token counts out of either casing; missing ⇒ 0. */
export function normalizeRealtimeUsage(u: RealtimeUsage | null | undefined): {
  inputTokens: number;
  outputTokens: number;
} {
  const n = (v: number | undefined): number => (typeof v === 'number' && isFinite(v) && v > 0 ? v : 0);
  return {
    inputTokens: n(u?.inputTokens) || n(u?.input_tokens) || n(u?.promptTokenCount) + n(u?.toolUsePromptTokenCount),
    outputTokens: n(u?.outputTokens) || n(u?.output_tokens) || n(u?.responseTokenCount) + n(u?.thoughtsTokenCount)
  };
}

/**
 * USD cost for ONE realtime usage delta. Conservative upper bound: every input
 * token is priced at the audio-input rate and every output token at the
 * audio-output rate (see file header).
 */
export function computeRealtimeUsd(u: RealtimeUsage | null | undefined, provider: RealtimeProvider = 'openai'): number {
  const { inputTokens, outputTokens } = normalizeRealtimeUsage(u);
  const google = provider === 'google';
  return (
    (inputTokens / 1_000_000) * (google ? GEMINI_LIVE_INPUT_PER_MTOK : REALTIME_AUDIO_INPUT_PER_MTOK) +
    (outputTokens / 1_000_000) * (google ? GEMINI_LIVE_OUTPUT_PER_MTOK : REALTIME_AUDIO_OUTPUT_PER_MTOK)
  );
}

/** Compact USD formatter: <$1 shows cents (e.g. $0.42), else 2dp (e.g. $12.30). */
export function formatUsd(n: number): string {
  if (!isFinite(n) || n <= 0) return '$0.00';
  if (n < 0.01) return '<$0.01';
  return `$${n.toFixed(2)}`;
}
