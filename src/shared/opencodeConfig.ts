import { type ByokBackend, type ByokGrant, providerRoute } from './byokBroker';

/**
 * The config OpenCode receives through OPENCODE_CONFIG_CONTENT at spawn.
 *
 * OpenCode has no skip-permissions flag; its approvals are config. In floor
 * auto mode every permission OpenCode can ask about must be "allow", or an
 * unattended agent stalls on a prompt nobody is watching. `external_directory`
 * (touching files outside the project folder) and `doom_loop` (the same tool
 * call repeated) default to "ask" upstream, so leaving them out still produced
 * "Permission required" mid-task. With auto mode off, no permission block is
 * sent and OpenCode's own defaults (and the user's config) apply.
 */
export const OPENCODE_AUTO_PERMISSION = {
  edit: 'allow',
  bash: 'allow',
  webfetch: 'allow',
  external_directory: 'allow',
  doom_loop: 'allow'
} as const;

/** OpenCode's AI-SDK providers append their API path to `baseURL`, whose default
 *  already carries the version segment (e.g. https://api.anthropic.com/v1,
 *  https://generativelanguage.googleapis.com/v1beta, https://openrouter.ai/api/v1). */
const OPENCODE_SDK_SUFFIX: Record<ByokBackend, string> = {
  anthropic: '/v1', openai: '/v1', google: '/v1beta', openrouter: '/v1', groq: '/v1'
};

export function buildOpenCodeConfig(opts: { autoMode: boolean; baseUrl?: string; localModel?: string; model?: string; byok?: ByokGrant }): Record<string, unknown> {
  const oc: Record<string, unknown> = { autoupdate: false };
  if (opts.autoMode) oc.permission = { ...OPENCODE_AUTO_PERMISSION };
  const provider: Record<string, unknown> = {};
  // BYOK through the broker: the provider's key env var holds the agent's token
  // (byokEnv), and its documented `options.baseURL` points at the broker route.
  // OpenCode's provider ids match the backend names. The selected model is
  // registered too, so one OpenCode's bundled list lacks (a new `:free` model
  // picked from the live OpenRouter list) still resolves.
  const slash = opts.model?.indexOf('/') ?? -1;
  for (const b of opts.byok?.backends ?? []) {
    const entry: Record<string, unknown> = { options: { baseURL: providerRoute(opts.byok!.url, b) + OPENCODE_SDK_SUFFIX[b] } };
    if (slash > 0 && opts.model!.slice(0, slash) === b) {
      const id = opts.model!.slice(slash + 1);
      entry.models = { [id]: { name: id } };
    }
    provider[b] = entry;
  }
  // Same for a user who set OPENROUTER_API_KEY in OpenCode itself (no broker
  // backend): the picked model must still resolve.
  if (slash > 0 && opts.model!.slice(0, slash) === 'openrouter' && !provider.openrouter) {
    const id = opts.model!.slice(slash + 1);
    provider.openrouter = { models: { [id]: { name: id } } };
  }
  if (opts.baseUrl) {
    // Register the model id the user actually selects (the part after 'local/')
    // so `--model local/<id>` resolves; default to 'local'.
    const localModel = opts.localModel || 'local';
    provider.local = { npm: '@ai-sdk/openai-compatible', name: 'Local (self-hosted)', options: { baseURL: opts.baseUrl }, models: { [localModel]: { name: localModel } } };
  }
  if (Object.keys(provider).length) oc.provider = provider;
  return oc;
}
