/**
 * Default MCP server catalog (Workstream 3). A dependency-free, importable-by-both
 * (main + renderer) registry of the MCP servers Jepoy Floor AI can wire into each
 * agent's per-session `settings.json`. Keep it free of electron/UI/node imports.
 *
 * Tiers gate consent:
 *   - 'safe-readonly' → no secret, no destructive write OUTSIDE the agent cwd; shipped
 *                       ON by default (`defaultEnabled:true`). `filesystem`/`git` are
 *                       scoped to the agent cwd at merge time (never whole-disk).
 *   - 'write'         → can mutate state beyond the workspace; OFF by default,
 *                       consent-gated.
 *   - 'secret'        → needs an API key / token / connection string; OFF by default,
 *                       consent-gated.
 *
 * The actual merge (catalog ∩ enabled, cwd-scoping of filesystem/git, id namespacing,
 * non-fatal resolution) is Workstream 3's `buildDefaultMcpServers`/`hookSettings`
 * job — this module only declares the entries, their tiers, and the seed defaults.
 *
 * NOTE: several reference servers ship as Python (uvx) rather than npm (npx). The
 * commands below reflect each server's real transport; entries that couldn't be
 * verified against an installed server are flagged `// TODO-verify`. Workstream 3
 * makes a server that fails to resolve non-fatal to the agent.
 */

export type McpTier = 'safe-readonly' | 'write' | 'secret';

/** A local server the agent CLI launches (stdio). */
export interface McpStdioSpec {
  transport?: 'stdio';
  command: string;
  args: string[];
  /** Fixed, non-secret env. Secrets never live here — see `McpCatalogEntry.secret`. */
  env?: Record<string, string>;
}

/**
 * A vendor-hosted server (MCP Streamable HTTP). The agent never talks to it
 * directly: it is pointed at the loopback integration broker, which injects the
 * user's key upstream, so the key never lands in the agent's config or env.
 */
export interface McpHttpSpec {
  transport: 'http';
  /** https URL of the vendor's MCP endpoint. */
  url: string;
}

export type McpSpec = McpStdioSpec | McpHttpSpec;

/**
 * The credential a server needs. Stored ONLY in the encrypted secret store
 * (`mcpSecretRef(id)`), set through a write-only IPC, never returned to the
 * renderer.
 *   - 'env'    → stdio: exported to the server process as `name`.
 *   - 'header' → http: injected by the broker as request header `name`.
 */
export interface McpSecret {
  kind: 'env' | 'header';
  name: string;
  /** What the user is asked to paste, e.g. "Pancake POS API key". */
  label: string;
  /** Where the user gets it (vendor docs). https only. */
  helpUrl?: string;
}

export interface McpCatalogEntry {
  /** Stable catalog id (also the consent key in `config.mcpDefaults`). The merge
   *  step namespaces the written server id (e.g. `atmt-<id>`) to avoid clobbering
   *  a user's own `~/.claude` MCP server of the same name. */
  id: string;
  /** Human label for the consent UI. */
  label: string;
  /** One-line description for the consent UI / hire import preview. */
  description: string;
  /** How to reach the server. Stdio `filesystem`/`git` carry a placeholder cwd arg
   *  replaced with the agent cwd at merge time. */
  spec: McpSpec;
  /** The credential this server needs, if any (write/secret tiers only). */
  secret?: McpSecret;
  tier: McpTier;
  /** Seed for `config.mcpDefaults[id].enabled`. Always === (tier === 'safe-readonly'). */
  defaultEnabled: boolean;
}

/** The default MCP bundle. Safe/read-only servers are ON; anything that writes
 *  beyond the workspace or needs a secret is OFF until the user consents. */
export const MCP_CATALOG: McpCatalogEntry[] = [
  // ─── Safe, read-only, no-secret — shipped ON ──────────────────────────────
  {
    id: 'sequential-thinking',
    label: 'Sequential Thinking',
    description: 'Structured step-by-step reasoning scratchpad. No I/O, no secrets.',
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'time',
    label: 'Time',
    description: 'Current time and timezone conversions.',
    // Reference time server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-time'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'fetch',
    label: 'Fetch',
    description: 'Fetch a URL and return its content as markdown (read-only HTTP GET).',
    // Reference fetch server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-fetch'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'context7',
    label: 'Context7 Docs',
    description: 'Up-to-date library/framework documentation lookups.',
    spec: { command: 'npx', args: ['-y', '@upstash/context7-mcp'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'filesystem',
    label: 'Filesystem (cwd)',
    description: 'Read/edit files within the agent workspace only (scoped to cwd at spawn).',
    // The trailing arg is the allowed root — Workstream 3 replaces this placeholder
    // with the agent cwd at merge time so it is NEVER whole-disk.
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '<cwd>'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'git',
    label: 'Git (cwd)',
    description: 'Inspect git status/log/diff for the workspace repo (scoped to cwd at spawn).',
    // Reference git server ships as Python; `--repository <cwd>` is set at merge time.
    // TODO-verify transport (uvx vs an npm port).
    spec: { command: 'uvx', args: ['mcp-server-git', '--repository', '<cwd>'] },
    tier: 'safe-readonly',
    defaultEnabled: true
  },

  // ─── Write / secret — shipped OFF, consent-gated ──────────────────────────
  {
    id: 'github-token',
    label: 'GitHub',
    description: 'Read/write GitHub issues, PRs, and repos. Requires a personal access token.',
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'] },
    secret: { kind: 'env', name: 'GITHUB_PERSONAL_ACCESS_TOKEN', label: 'GitHub personal access token', helpUrl: 'https://github.com/settings/tokens' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'db',
    label: 'Database',
    description: 'Query a SQL database. Requires a connection string.',
    // TODO-verify exact server package for the user's DB engine (Postgres assumed).
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-postgres'] },
    secret: { kind: 'env', name: 'DATABASE_URL', label: 'Database connection string' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'email-calendar',
    label: 'Email & Calendar',
    description: 'Read/send mail and read/write calendar events. Requires account credentials.',
    // TODO-verify provider package (Gmail/Google Calendar assumed).
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-gsuite'] },
    secret: { kind: 'env', name: 'GOOGLE_OAUTH_TOKEN', label: 'Google OAuth token' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    id: 'search-with-key',
    label: 'Web Search',
    description: 'Keyed web search. Requires a search-provider API key.',
    // TODO-verify provider package (Brave Search assumed).
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'] },
    secret: { kind: 'env', name: 'BRAVE_API_KEY', label: 'Brave Search API key', helpUrl: 'https://brave.com/search/api/' },
    tier: 'secret',
    defaultEnabled: false
  },

  // ─── Business connectors (vendor-hosted or vendor-published) ──────────────
  {
    // Pancake POS's own hosted MCP server. Header + URL from
    // docs.pancake.biz/pos/st-f14/st-p2 ("X-Api-Key: <key>").
    id: 'pancake-pos',
    label: 'Pancake POS',
    description: 'Your Pancake POS shop: orders, products, stock and sales. Can also make changes, within the key\'s permissions.',
    spec: { transport: 'http', url: 'https://mcp-pos.pancake.biz/mcp' },
    secret: { kind: 'header', name: 'X-Api-Key', label: 'Pancake POS API key', helpUrl: 'https://docs.pancake.biz/pos/st-f14/st-p2?lang=en' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    // The server Webcake's docs point to (docs.pancake.biz/landing/st-f7/st-p3).
    // Published on npm by a single developer, so the version is PINNED: an update
    // is a reviewed change here, never a silent `latest`. Its writes are dry-run
    // by default (create_page returns the request it would send until told not to).
    id: 'webcake-landing',
    label: 'Webcake Landing',
    description: 'Design, edit and publish Webcake landing pages. Saves pages to your Webcake account.',
    spec: { command: 'npx', args: ['-y', 'webcake-landing-mcp@1.5.2'] },
    secret: { kind: 'env', name: 'WEBCAKE_JWT', label: 'Webcake token', helpUrl: 'https://docs.pancake.biz/landing/st-f7/st-p3?lang=en' },
    tier: 'secret',
    defaultEnabled: false
  }
];

/** Encrypted-store handle for an entry's credential. */
export function mcpSecretRef(id: string): string {
  return `mcp:${id}`;
}

/** Integration-broker id a remote (http) entry is proxied under. */
export function mcpBrokerId(id: string): string {
  return `mcp-${id}`;
}

export function isHttpSpec(spec: McpSpec): spec is McpHttpSpec {
  return (spec as McpHttpSpec).transport === 'http';
}

/** Split a remote entry's URL into the broker's (origin) base and the path the
 *  agent requests under it. */
export function mcpUpstream(spec: McpHttpSpec): { baseUrl: string; path: string } {
  const u = new URL(spec.url);
  return { baseUrl: u.origin, path: `${u.pathname.replace(/^\/+/, '')}${u.search}` };
}

/** One server as written into the agent's `--mcp-config` file. */
export type McpServerConfig =
  | { command: string; args: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers: Record<string, string> };

export type McpSkipReason = 'no_secret' | 'broker_offline';

export interface BuildMcpServersInput {
  cwd: string;
  consent: { [id: string]: { enabled: boolean } } | undefined;
  /** Decrypted secret for an entry id (main-process only). */
  getSecret: (id: string) => string | undefined;
  /** The loopback broker + this agent's capability token, when the broker is up. */
  broker?: { url: string; token: string };
  catalog?: readonly McpCatalogEntry[];
}

/**
 * The per-agent `mcpServers` map, from catalog ∩ consent. Pure, so every rule is
 * unit-tested (test/mcp-connectors.test.cjs):
 *   - write/secret servers need an EXPLICIT `enabled: true` (never a default);
 *   - filesystem/git are scoped to the agent cwd;
 *   - ids are namespaced `atmt-<id>` so a user's own servers are never clobbered;
 *   - a server whose credential is missing is SKIPPED (reported), never launched
 *     half-configured;
 *   - an http server is written as the BROKER url + capability token, never the
 *     vendor URL + key; with the broker down it is skipped, not exposed.
 */
export function buildMcpServers(input: BuildMcpServersInput): {
  servers: Record<string, McpServerConfig>;
  skipped: { id: string; reason: McpSkipReason }[];
  brokerIds: string[];
} {
  const servers: Record<string, McpServerConfig> = {};
  const skipped: { id: string; reason: McpSkipReason }[] = [];
  const brokerIds: string[] = [];
  for (const e of input.catalog ?? MCP_CATALOG) {
    const consented = input.consent?.[e.id]?.enabled;
    const enabled = consented ?? e.defaultEnabled;
    if (!enabled) continue;
    if (e.tier !== 'safe-readonly' && consented !== true) continue;
    const secret = e.secret ? input.getSecret(e.id) : undefined;
    if (e.secret && !secret) { skipped.push({ id: e.id, reason: 'no_secret' }); continue; }
    const key = `atmt-${e.id}`;
    if (isHttpSpec(e.spec)) {
      if (!input.broker) { skipped.push({ id: e.id, reason: 'broker_offline' }); continue; }
      const { path } = mcpUpstream(e.spec);
      servers[key] = {
        type: 'http',
        url: `${input.broker.url}/i/${encodeURIComponent(mcpBrokerId(e.id))}/${path}`,
        headers: { authorization: `Bearer ${input.broker.token}` }
      };
      brokerIds.push(mcpBrokerId(e.id));
      continue;
    }
    const args = e.spec.args.map((a) => (a === '<cwd>' ? input.cwd : a));
    const env = { ...(e.spec.env ?? {}), ...(e.secret?.kind === 'env' && secret ? { [e.secret.name]: secret } : {}) };
    servers[key] = { command: e.spec.command, args, ...(Object.keys(env).length ? { env } : {}) };
  }
  return { servers, skipped, brokerIds };
}

/** Remote entries the given consent map enables (for the broker grant). */
export function enabledHttpEntries(consent: BuildMcpServersInput['consent'], catalog: readonly McpCatalogEntry[] = MCP_CATALOG): McpCatalogEntry[] {
  return catalog.filter((e) => isHttpSpec(e.spec) && consent?.[e.id]?.enabled === true);
}

/** Look up a catalog entry by id. */
export function mcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}

/** Whether an id is a known safe-readonly server (the only tier a hire manifest may
 *  request without surfacing for human consent — Workstream 3 validation). */
export function isSafeReadonlyMcp(id: string): boolean {
  return mcpCatalogEntry(id)?.tier === 'safe-readonly';
}

/** Seed for `DEFAULTS.mcpDefaults` — derived from the catalog so the two never
 *  drift (safe-readonly ON, write/secret OFF). */
export function defaultMcpDefaults(): Record<string, { enabled: boolean }> {
  const out: Record<string, { enabled: boolean }> = {};
  for (const e of MCP_CATALOG) out[e.id] = { enabled: e.defaultEnabled };
  return out;
}
