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

export function buildOpenCodeConfig(opts: { autoMode: boolean; baseUrl?: string; localModel?: string }): Record<string, unknown> {
  const oc: Record<string, unknown> = { autoupdate: false };
  if (opts.autoMode) oc.permission = { ...OPENCODE_AUTO_PERMISSION };
  if (opts.baseUrl) {
    // Register the model id the user actually selects (the part after 'local/')
    // so `--model local/<id>` resolves; default to 'local'.
    const localModel = opts.localModel || 'local';
    oc.provider = {
      local: { npm: '@ai-sdk/openai-compatible', name: 'Local (self-hosted)', options: { baseURL: opts.baseUrl }, models: { [localModel]: { name: localModel } } }
    };
  }
  return oc;
}
