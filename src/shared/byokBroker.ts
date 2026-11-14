/**
 * BYOK model-provider keys through the loopback broker.
 *
 * The non-Claude CLI engines (OpenCode / Crush / pi / qwen) used to get the user's
 * real provider key in their env. Now each provider is a built-in broker route:
 * the agent's "API key" is its per-agent capability token, its base URL points at
 * `<broker>/i/llm.<backend>`, and the broker swaps the token for the real key
 * (read from `apikey:<backend>`) on the way to the provider's OFFICIAL host only.
 *
 * Pure (no electron), so the routing tables are unit-testable.
 */
import type { IntegrationRecord } from './integrations';

/** Backend -> the env var the engines read the key from. */
export const BACKEND_KEY_ENV = {
  anthropic: 'ANTHROPIC_API_KEY',
  openai: 'OPENAI_API_KEY',
  google: 'GEMINI_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
  groq: 'GROQ_API_KEY'
} as const;
export type ByokBackend = keyof typeof BACKEND_KEY_ENV;
export const BYOK_BACKENDS = Object.keys(BACKEND_KEY_ENV) as ByokBackend[];
export const isByokBackend = (b: string): b is ByokBackend => b in BACKEND_KEY_ENV;

/** Engine x provider pairs the broker CANNOT front because the engine ignores a
 *  base-URL override for that provider (Crush's OpenRouter provider drops its
 *  base_url: charmbracelet/crush internal/agent/coordinator.go). Those keep the
 *  old behaviour, the real key in the agent's env, and Settings warns about it. */
export const BYOK_DIRECT_KEY: Readonly<Record<string, readonly ByokBackend[]>> = { crush: ['openrouter'] };

/** The one host (and path prefix) each provider route may reach, and how its key
 *  is sent. The agent picks a backend, never a host. */
const UPSTREAM: Record<ByokBackend, Pick<IntegrationRecord, 'label' | 'baseUrl' | 'authType' | 'authHeader'>> = {
  anthropic: { label: 'Anthropic API', baseUrl: 'https://api.anthropic.com', authType: 'header', authHeader: 'x-api-key' },
  openai: { label: 'OpenAI API', baseUrl: 'https://api.openai.com', authType: 'bearer' },
  google: { label: 'Gemini API', baseUrl: 'https://generativelanguage.googleapis.com', authType: 'header', authHeader: 'x-goog-api-key' },
  openrouter: { label: 'OpenRouter API', baseUrl: 'https://openrouter.ai/api', authType: 'bearer' },
  groq: { label: 'Groq API', baseUrl: 'https://api.groq.com/openai', authType: 'bearer' }
};

/** Broker id for a backend. `.` is outside the integration slug alphabet, so a
 *  user-registered integration can never shadow it. */
export const providerBrokerId = (b: ByokBackend): string => `llm.${b}`;
export const isProviderBrokerId = (id: string): boolean =>
  id.startsWith('llm.') && isByokBackend(id.slice(4));

/** The synthetic broker record for `llm.<backend>` (undefined for any other id). */
export function providerBrokerRecord(id: string, now = Date.now()): IntegrationRecord | undefined {
  if (!isProviderBrokerId(id)) return undefined;
  const backend = id.slice(4) as ByokBackend;
  return {
    id,
    kind: 'custom-rest',
    ...UPSTREAM[backend],
    secretRef: `apikey:${backend}`,
    enabled: true, // no stored key -> the broker answers 503 no_secret
    createdAt: now,
    updatedAt: now
  };
}

/** Route root the agent's SDK talks to, standing in for the provider's
 *  `baseUrl` above (so `${route}/v1` == `https://api.openai.com/v1`). */
export const providerRoute = (brokerUrl: string, b: ByokBackend): string =>
  `${brokerUrl.replace(/\/+$/, '')}/i/${providerBrokerId(b)}`;

/** What one agent gets: the broker URL, its token, and the backends it may use. */
export interface ByokGrant { url: string; token: string; backends: ByokBackend[] }

/** Env for the agent: every key var holds the TOKEN, never a real key. OpenCode's
 *  Google provider reads GOOGLE_GENERATIVE_AI_API_KEY, so google sets both. */
export function byokEnv(g: ByokGrant): Record<string, string> {
  const env: Record<string, string> = {};
  for (const b of g.backends) {
    env[BACKEND_KEY_ENV[b]] = g.token;
    if (b === 'google') env.GOOGLE_GENERATIVE_AI_API_KEY = g.token;
  }
  return env;
}
