/**
 * Default MCP server catalog (Workstream 3). A dependency-free, importable-by-both
 * (main + renderer) registry of the MCP servers DevLabs can wire into each
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

import type { IntegrationAuthType } from './integrations';

export type McpTier = 'safe-readonly' | 'write' | 'secret';

/** A local server the agent CLI launches (stdio). */
export interface McpStdioSpec {
  transport?: 'stdio';
  command: string;
  args: string[];
  /** Fixed, non-secret env. Secrets never live here — see `McpCatalogEntry.secret`. */
  env?: Record<string, string>;
  /**
   * A vendor REST API this local server calls THROUGH the loopback broker. The
   * server gets `MD_UPSTREAM_URL` (the broker path for this entry) and
   * `MD_UPSTREAM_TOKEN` (the agent's capability token) in env, never the key;
   * the broker adds the key on the way out, the same as for an http entry.
   */
  upstream?: { url: string; authType: IntegrationAuthType };
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
 *   - 'header' → http, or stdio with `upstream`: injected by the broker as
 *                request header `name`.
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
  /** How to reach the server. `<name>` placeholders in a stdio spec are filled at
   *  merge time: `<cwd>` with the agent cwd, the rest from `BuildMcpServersInput.vars`. */
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
  },

  // ─── Bundled connectors (resources/md-*-mcp.cjs, run on the app's own Node) ─
  {
    // Plain files in the folder the user picked (Settings → Connections), never
    // outside it. Skipped until a vault is chosen.
    id: 'obsidian',
    label: 'Obsidian',
    description: 'Save notes, learnings and decisions to your Obsidian vault and read them back: tagged notes, daily notes and [[links]].',
    spec: {
      command: '<node>',
      args: ['<resources>/md-obsidian-mcp.cjs'],
      env: { ELECTRON_RUN_AS_NODE: '1', OBSIDIAN_VAULT: '<obsidian-vault>' }
    },
    tier: 'write',
    defaultEnabled: false
  },
  {
    // Discord's REST API through the broker: the server holds a capability token,
    // the broker adds "Authorization: Bot <token>".
    id: 'discord',
    label: 'Discord',
    description: 'Post messages to your Discord channels and read recent ones, as your own bot.',
    spec: {
      command: '<node>',
      args: ['<resources>/md-discord-mcp.cjs'],
      env: { ELECTRON_RUN_AS_NODE: '1' },
      upstream: { url: 'https://discord.com/api/v10', authType: 'discord' }
    },
    secret: { kind: 'header', name: 'Authorization', label: 'Discord bot token', helpUrl: 'https://discord.com/developers/applications' },
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

/** True when the broker carries this entry's traffic (http, or stdio with `upstream`). */
export function isBrokered(e: McpCatalogEntry): boolean {
  return isHttpSpec(e.spec) || !!e.spec.upstream;
}

/** Where the broker forwards a brokered entry, and how it adds the key. */
export function mcpBrokerTarget(e: McpCatalogEntry): { baseUrl: string; authType: IntegrationAuthType; authHeader?: string } | undefined {
  if (e.secret?.kind !== 'header') return undefined;
  if (isHttpSpec(e.spec)) return { baseUrl: mcpUpstream(e.spec).baseUrl, authType: 'header', authHeader: e.secret.name };
  if (e.spec.upstream) return { baseUrl: e.spec.upstream.url, authType: e.spec.upstream.authType };
  return undefined;
}

/** One server as written into the agent's `--mcp-config` file. */
export type McpServerConfig =
  | { command: string; args: string[]; env?: Record<string, string> }
  | { type: 'http'; url: string; headers: Record<string, string> };

export type McpSkipReason = 'no_secret' | 'broker_offline' | 'not_configured';

export interface BuildMcpServersInput {
  cwd: string;
  consent: { [id: string]: { enabled: boolean } } | undefined;
  /** Decrypted secret for an entry id (main-process only). */
  getSecret: (id: string) => string | undefined;
  /** The loopback broker + this agent's capability token, when the broker is up. */
  broker?: { url: string; token: string };
  /** Values for `<name>` placeholders in stdio specs (`node`, `resources`,
   *  `obsidian-vault`, …). An entry needing one that is missing is skipped. */
  vars?: Record<string, string>;
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
 *     vendor URL + key; with the broker down it is skipped, not exposed;
 *   - a stdio server with `upstream` gets the same broker url + token in env;
 *   - a stdio server whose `<placeholder>` has no value is skipped
 *     ('not_configured'), never launched with a literal `<obsidian-vault>`.
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
    const vars: Record<string, string> = { ...input.vars, cwd: input.cwd };
    let missing = false;
    const fill = (s: string): string => s.replace(/<([a-z-]+)>/g, (m, name: string) => {
      if (vars[name]) return vars[name];
      missing = true;
      return m;
    });
    const command = fill(e.spec.command);
    const args = e.spec.args.map(fill);
    const env: Record<string, string> = {};
    for (const [k, v] of Object.entries(e.spec.env ?? {})) env[k] = fill(v);
    if (missing) { skipped.push({ id: e.id, reason: 'not_configured' }); continue; }
    if (e.secret?.kind === 'env' && secret) env[e.secret.name] = secret;
    if (e.spec.upstream) {
      if (!input.broker) { skipped.push({ id: e.id, reason: 'broker_offline' }); continue; }
      env.MD_UPSTREAM_URL = `${input.broker.url}/i/${encodeURIComponent(mcpBrokerId(e.id))}`;
      env.MD_UPSTREAM_TOKEN = input.broker.token;
      brokerIds.push(mcpBrokerId(e.id));
    }
    servers[key] = { command, args, ...(Object.keys(env).length ? { env } : {}) };
  }
  return { servers, skipped, brokerIds };
}

/** Brokered entries the given consent map enables (for the broker grant). */
export function enabledBrokeredEntries(consent: BuildMcpServersInput['consent'], catalog: readonly McpCatalogEntry[] = MCP_CATALOG): McpCatalogEntry[] {
  return catalog.filter((e) => isBrokered(e) && consent?.[e.id]?.enabled === true);
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
