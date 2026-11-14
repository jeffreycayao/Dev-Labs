/**
 * Gemini Live voice provider — the pure, dependency-free half.
 *
 * Ramon's voice chat can run on OpenAI Realtime (WebRTC) or Google's Gemini Live
 * API (bidirectional WebSocket). Everything here is pure so main, renderer and the
 * node tests (loadTs) share one copy: provider choice, the mapping from the
 * realtime tool specs to Gemini function declarations, and the PCM helpers for
 * Gemini's fixed audio formats (16 kHz in, 24 kHz out, 16-bit little-endian).
 */

/** Native-audio Live model (Google AI Studio docs, Nov 2026). */
export const GEMINI_LIVE_MODEL = 'gemini-3.8-live';
/** Prebuilt Gemini voice for Ramon. */
export const GEMINI_LIVE_VOICE = 'Charon';
/** v1beta: ephemeral tokens work only on this version. */
export const GEMINI_TOKEN_URL = 'https://generativelanguage.googleapis.com/v1beta/auth_tokens';
export const GEMINI_LIVE_WS_URL =
  'wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContentConstrained';
export const GEMINI_KEY_URL = 'https://aistudio.google.com/app/api-keys';
export const GEMINI_INPUT_RATE = 16000;
export const GEMINI_OUTPUT_RATE = 24000;

export type VoiceProvider = 'openai' | 'google';

/**
 * Which provider a voice session uses. An explicit pick wins while its key is
 * saved; otherwise Google once a Google key exists (the owner's stated
 * preference), else OpenAI. The `geminiVoice` owner switch off forces OpenAI.
 */
export function resolveVoiceProvider(opts: {
  choice?: unknown;
  hasOpenAiKey: boolean;
  hasGoogleKey: boolean;
  geminiEnabled: boolean;
}): VoiceProvider {
  if (!opts.geminiEnabled) return 'openai';
  if (opts.choice === 'openai' && opts.hasOpenAiKey) return 'openai';
  if (opts.choice === 'google' && opts.hasGoogleKey) return 'google';
  if (opts.hasGoogleKey) return 'google';
  return 'openai';
}

/** The parts of a realtime FunctionTool the mapping reads. */
export interface ToolSpec {
  name: string;
  description?: string;
  parameters?: unknown;
}

export interface GeminiFunctionDeclaration {
  name: string;
  description: string;
  parameters?: Record<string, unknown>;
}

/** JSON Schema → Gemini's OpenAPI-subset Schema: upper-case `type`, keep
 *  description / enum / items / properties / required, drop the rest
 *  (`additionalProperties` is rejected by the Gemini API). */
export function toGeminiSchema(schema: unknown): Record<string, unknown> {
  const s = (schema && typeof schema === 'object' ? schema : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const type = Array.isArray(s.type) ? s.type.find((t) => t !== 'null') : s.type;
  if (typeof type === 'string') out.type = type.toUpperCase();
  if (Array.isArray(s.type) && s.type.includes('null')) out.nullable = true;
  if (typeof s.description === 'string') out.description = s.description;
  if (Array.isArray(s.enum)) out.enum = s.enum.map(String);
  if (s.items) out.items = toGeminiSchema(s.items);
  if (s.properties && typeof s.properties === 'object') {
    out.properties = Object.fromEntries(
      Object.entries(s.properties as Record<string, unknown>).map(([k, v]) => [k, toGeminiSchema(v)])
    );
  }
  if (Array.isArray(s.required) && s.required.length) out.required = s.required.slice();
  return out;
}

/** Map every realtime tool to a Gemini function declaration with the same name
 *  and parameters. A tool with no parameters gets none (Gemini rejects an empty
 *  OBJECT schema). */
export function toGeminiDeclarations(tools: readonly ToolSpec[]): GeminiFunctionDeclaration[] {
  return tools.map((t) => {
    const params = toGeminiSchema(t.parameters);
    const hasProps = params.properties && Object.keys(params.properties as object).length > 0;
    return {
      name: t.name,
      description: t.description ?? '',
      ...(hasProps ? { parameters: params } : {})
    };
  });
}

/** Friendly text for a failed token mint / socket close. */
export function geminiErrorMessage(status: number, body: string): string {
  const b = body || '';
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(b))
    return 'Google AI quota exceeded — check your plan or billing in Google AI Studio, or switch voice to OpenAI.';
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(b))
    return 'Google AI Studio key was rejected — check it in Settings → Voice (aistudio.google.com/app/api-keys).';
  return `Gemini Live error (${status || 'network'}): ${b.slice(0, 200) || 'no details'}`;
}

/** Linear resample of mono float samples. Identity when the rates match. */
export function resampleLinear(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const outLen = Math.max(1, Math.round((input.length * toRate) / fromRate));
  const out = new Float32Array(outLen);
  const step = fromRate / toRate;
  for (let i = 0; i < outLen; i++) {
    const pos = i * step;
    const i0 = Math.floor(pos);
    const i1 = Math.min(i0 + 1, input.length - 1);
    const frac = pos - i0;
    out[i] = input[Math.min(i0, input.length - 1)] * (1 - frac) + input[i1] * frac;
  }
  return out;
}

/** Float [-1, 1] → 16-bit little-endian PCM bytes. */
export function floatToPcm16(input: Float32Array): Uint8Array {
  const view = new DataView(new ArrayBuffer(input.length * 2));
  for (let i = 0; i < input.length; i++) {
    const v = Math.max(-1, Math.min(1, input[i]));
    view.setInt16(i * 2, v < 0 ? v * 0x8000 : v * 0x7fff, true);
  }
  return new Uint8Array(view.buffer);
}

/** 16-bit little-endian PCM bytes → float [-1, 1]. */
export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const n = Math.floor(bytes.length / 2);
  const view = new DataView(bytes.buffer, bytes.byteOffset, n * 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}
