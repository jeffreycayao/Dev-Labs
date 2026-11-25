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
 *   - 'browser'       → drives a real browser (visits sites, fills forms); ON by
 *                       default (owner's call), behind an owner feature switch, and
 *                       turned off by either that switch or its own consent toggle.
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
import { featureOn, type FeatureFlags } from './features';

export type McpTier = 'safe-readonly' | 'write' | 'secret' | 'browser';

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
  /** How the broker sends the key. Default 'header': the raw key in the
   *  secret's header; 'bearer': `Authorization: Bearer <key>`. */
  authType?: 'header' | 'bearer';
  /**
   * Extra NON-secret request headers (e.g. HighLevel's `locationId`). They are
   * written into the agent's config and the broker forwards them untouched. A
   * `<name>` placeholder is filled from `BuildMcpServersInput.vars`
   * (`config.mcpVars`, typed by the user in Settings → Connections); a header
   * whose placeholder has no value is LEFT OUT, so only optional headers belong
   * here. Never a credential: those go in `secret`.
   */
  headers?: Record<string, string>;
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
  /** For an `npx` server: the pinned package DevLabs installs once into its data
   *  folder (mcpPackages.ts), so agents run it straight from disk instead of
   *  paying an `npx` resolve (two extra processes) on every spawn. */
  npm?: McpNpmPackage;
  /** The credential this server needs, if any (write/secret tiers only). */
  secret?: McpSecret;
  /** Plain, non-secret values the user types in Settings → Connections (stored
   *  in `config.mcpVars`), offered to the spec as `<name>` placeholders. */
  vars?: { name: string; label: string }[];
  tier: McpTier;
  /** Seed for `config.mcpDefaults[id].enabled`. Only 'safe-readonly' and
   *  'browser' entries may be on by default; a keyed (secret) entry never is. */
  defaultEnabled: boolean;
  /** Owner feature switch (Settings → General → Features) that must be on for
   *  this entry to exist at all: hidden in Settings and never written to an
   *  agent's config while off, whatever the consent says. */
  feature?: keyof FeatureFlags;
  /** Bundled skill folder (resources/skills/<skill>) that teaches agents how to
   *  use this connector; copied to agents only while the connector is on. */
  skill?: string;
}

export interface McpNpmPackage {
  pkg: string;
  version: string;
  /** Entry script inside the package, run with node. */
  bin: string;
  /** Scope whose per-platform package holds a native `bin/<name>[.exe]` to run
   *  instead of the JS launcher (agent-browser). */
  native?: string;
}

/** The default MCP bundle. Safe/read-only servers are ON; anything that writes
 *  beyond the workspace or needs a secret is OFF until the user consents. */
export const MCP_CATALOG: McpCatalogEntry[] = [
  // ─── Safe, read-only, no-secret — shipped ON ──────────────────────────────
  {
    id: 'sequential-thinking',
    label: 'Sequential Thinking',
    description: 'Structured step-by-step reasoning scratchpad. No I/O, no secrets.',
    spec: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-sequential-thinking@2.1.1'] },
    npm: { pkg: '@modelcontextprotocol/server-sequential-thinking', version: '2.1.1', bin: 'dist/index.js' },
    tier: 'safe-readonly',
    defaultEnabled: true
  },
  {
    id: 'time',
    label: 'Time',
    description: 'Current time and timezone conversions.',
    // Reference time server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-time'] },
    // Claude Code (the only CLI that gets this bundle) has this built in, and each
    // running server costs every agent its own process: off unless switched on.
    tier: 'safe-readonly',
    defaultEnabled: false
  },
  {
    id: 'fetch',
    label: 'Fetch',
    description: 'Fetch a URL and return its content as markdown (read-only HTTP GET).',
    // Reference fetch server ships as Python. // TODO-verify transport (uvx vs an npm port)
    spec: { command: 'uvx', args: ['mcp-server-fetch'] },
    // Claude Code (the only CLI that gets this bundle) has this built in, and each
    // running server costs every agent its own process: off unless switched on.
    tier: 'safe-readonly',
    defaultEnabled: false
  },
  {
    id: 'context7',
    label: 'Context7 Docs',
    description: 'Up-to-date library/framework documentation lookups.',
    spec: { command: 'npx', args: ['-y', '@upstash/context7-mcp@4.7.0'] },
    npm: { pkg: '@upstash/context7-mcp', version: '4.7.0', bin: 'dist/index.js' },
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
    // Claude Code (the only CLI that gets this bundle) has this built in, and each
    // running server costs every agent its own process: off unless switched on.
    tier: 'safe-readonly',
    defaultEnabled: false
  },
  {
    id: 'git',
    label: 'Git (cwd)',
    description: 'Inspect git status/log/diff for the workspace repo (scoped to cwd at spawn).',
    // Reference git server ships as Python; `--repository <cwd>` is set at merge time.
    // TODO-verify transport (uvx vs an npm port).
    spec: { command: 'uvx', args: ['mcp-server-git', '--repository', '<cwd>'] },
    // Claude Code (the only CLI that gets this bundle) has this built in, and each
    // running server costs every agent its own process: off unless switched on.
    tier: 'safe-readonly',
    defaultEnabled: false
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
    // Fireflies' own hosted MCP server (Streamable HTTP). URL + "Authorization:
    // Bearer <key>" from docs.fireflies.ai/getting-started/mcp-configuration.
    id: 'fireflies',
    label: 'Fireflies.ai',
    description: 'Read your Fireflies meeting notes: transcripts, summaries and action items. Can also rename, share or move meetings, within the key\'s permissions.',
    spec: { transport: 'http', url: 'https://api.fireflies.ai/mcp', authType: 'bearer' },
    secret: { kind: 'header', name: 'Authorization', label: 'Fireflies API key (Settings → Developer Settings)', helpUrl: 'https://docs.fireflies.ai/getting-started/mcp-configuration' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    // systeme.io's own hosted MCP server. Key in the "X-MCP-Key" header per
    // developer.systeme.io/docs/mcp-server (an MCP key, not the REST API key;
    // Settings → MCP & API keys, valid up to 90 days).
    id: 'systeme-io',
    label: 'Systeme.io',
    description: 'Your systeme.io account: contacts, tags, newsletters, campaigns, funnels, products, courses and automations. Can also make changes, within the key\'s permissions.',
    spec: { transport: 'http', url: 'https://mcp.systeme.io/mcp' },
    secret: { kind: 'header', name: 'X-MCP-Key', label: 'systeme.io MCP key (Settings → MCP & API keys)', helpUrl: 'https://developer.systeme.io/docs/mcp-server' },
    tier: 'secret',
    defaultEnabled: false
  },
  {
    // HighLevel's hosted MCP server (the token endpoint; the /v2 ones are OAuth
    // sign-in flows the broker cannot drive). "Authorization: Bearer pit-…" with
    // a Private Integration Token from the sub-account's Settings → Private
    // Integrations. The optional `locationId` header names the sub-account; the
    // token is already scoped to one, so it is filled only when the user sets it.
    id: 'gohighlevel',
    label: 'GoHighLevel',
    description: 'Your HighLevel sub-account: contacts, conversations, opportunities, calendars and payments. Can also make changes, within the token\'s scopes.',
    spec: { transport: 'http', url: 'https://services.leadconnectorhq.com/mcp/', authType: 'bearer', headers: { locationId: '<ghl-location-id>' } },
    secret: { kind: 'header', name: 'Authorization', label: 'HighLevel Private Integration token (pit-…)', helpUrl: 'https://marketplace.gohighlevel.com/docs/other/mcp' },
    vars: [{ name: 'ghl-location-id', label: 'Sub-account (location) ID, optional' }],
    tier: 'secret',
    defaultEnabled: false
  },
  {
    // Meta's own hosted Ads MCP server (Streamable HTTP). Its OAuth metadata
    // (/.well-known/oauth-protected-resource/ads) lists `bearer_methods_supported:
    // header`, so a pasted user access token rides as "Authorization: Bearer <token>";
    // the broker cannot drive the Facebook Login sign-in itself. It can spend money
    // and pause or edit live campaigns, so it stays off until the owner opts in.
    id: 'meta-ads',
    label: 'Meta Ads',
    description: 'Your Meta (Facebook and Instagram) ad accounts: campaigns, ad sets, ads, audiences and insights. Can also create, edit, pause and launch ads that spend money, within the token\'s permissions.',
    spec: { transport: 'http', url: 'https://mcp.facebook.com/ads', authType: 'bearer' },
    secret: { kind: 'header', name: 'Authorization', label: 'Meta user access token (ads_mcp_management + ads_read or ads_management)', helpUrl: 'https://developers.facebook.com/tools/explorer/' },
    tier: 'secret',
    defaultEnabled: false,
    // Branded HTML performance report (Chart.js, Save as PDF, opened in the browser).
    skill: 'meta-ads-report'
  },
  {
    // Metricool's own hosted MCP server. Clients that cannot run its OAuth sign-in
    // send the API key in the "X-Mc-Auth" header (help.metricool.com, n8n and
    // Claude Desktop setup), which is what the broker does. The API key needs a
    // Metricool plan with API access.
    id: 'metricool',
    label: 'Metricool',
    description: 'Your Metricool brands: social media analytics, competitors and the content planner. Can also schedule posts, within the key\'s permissions.',
    spec: { transport: 'http', url: 'https://ai.metricool.com/mcp' },
    secret: { kind: 'header', name: 'X-Mc-Auth', label: 'Metricool API key (Account Settings → API)', helpUrl: 'https://help.metricool.com/en/article/how-to-connect-metricools-mcp-1364s63/' },
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
  },

  // ─── Browser (feature switch + consent) ───────────────────────────────────
  {
    // Vercel's agent-browser (Apache-2.0) as its own stdio MCP server, PINNED
    // like Webcake. The `core` tool profile (open, snapshot, click, fill,
    // screenshot, close) keeps the agent's context small; the CLI is on PATH
    // through the same npx call for anything else. One browser SESSION per
    // agent so two agents never drive the same tab. The npm package has no
    // Chromium: the first `open` tells the agent to run `agent-browser install`.
    // file:// stays off (its default) and MCP tool calls cannot turn it on.
    // On by default at the owner's request; Features or Connections turn it off.
    id: 'agent-browser',
    label: 'Agent Browser',
    description: 'A real headless Chrome the agent drives: open pages, read them, click, fill forms, take screenshots. Visits any website you have not blocked.',
    spec: { command: 'npx', args: ['-y', 'agent-browser@0.43.0', 'mcp'], env: { AGENT_BROWSER_SESSION: 'devlabs-<agent>' } },
    // The JS launcher only finds and starts a native binary; run that binary directly.
    npm: { pkg: 'agent-browser', version: '0.43.0', bin: 'bin/agent-browser.js', native: '@agent-browser' },
    tier: 'browser',
    defaultEnabled: true,
    feature: 'agentBrowser'
  }
];

/** The catalog an owner sees: entries behind a switched-off feature are gone. */
export function mcpCatalogFor(features: Partial<FeatureFlags> | undefined | null, catalog: readonly McpCatalogEntry[] = MCP_CATALOG): McpCatalogEntry[] {
  return catalog.filter((e) => !e.feature || featureOn(features, e.feature));
}

/**
 * An MCP server the user added by hand in Settings → Connections (stored in
 * `config.customMcpServers`). It becomes an ordinary catalog entry: off until
 * switched on, its key (if any) in the encrypted store under `mcp:<id>`, and a
 * remote one with a key goes through the broker so agents never see the key.
 */
export interface CustomMcpServer {
  /** `custom-<slug>`. */
  id: string;
  label: string;
  transport: 'http' | 'stdio';
  /** http: the server's MCP endpoint (https, or http on localhost). */
  url?: string;
  /** http: how the key is sent. 'none' = no key, the agent calls the URL itself. */
  auth?: 'none' | 'header' | 'bearer';
  /** http + 'header': the header the key goes in (e.g. X-Api-Key). */
  headerName?: string;
  /** stdio: the program and its arguments. */
  command?: string;
  args?: string[];
  /** stdio: env var that receives the key; absent = no key. */
  envName?: string;
}

const CONTROL = /[\u0000-\u001f\u007f]/;
/** Headers the broker or HTTP itself owns; a key may not ride in them. */
const RESERVED_HEADERS = new Set(['host', 'cookie', 'content-length', 'content-type', 'transfer-encoding', 'connection', 'x-md-broker-token']);
/** Env vars that would change how the server process itself starts. */
const RESERVED_ENV = new Set(['PATH', 'NODE_OPTIONS', 'LD_PRELOAD', 'DYLD_INSERT_LIBRARIES', 'PYTHONPATH', 'ELECTRON_RUN_AS_NODE', 'HOME', 'USERPROFILE']);
export const CUSTOM_MCP_MAX = 20;

/** https anywhere, or plain http to this machine only. */
function customMcpUrl(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > 500 || CONTROL.test(raw)) return null;
  try {
    const u = new URL(raw.trim());
    if (u.username || u.password) return null;
    const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1' || u.hostname === '[::1]';
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return null;
    return u.href;
  } catch { return null; }
}

/** Keep only well-formed custom servers (config.json can be edited by hand).
 *  Bad rows are dropped, ids are unique, at most CUSTOM_MCP_MAX. */
export function sanitizeCustomMcp(raw: unknown): CustomMcpServer[] {
  if (!Array.isArray(raw)) return [];
  const out: CustomMcpServer[] = [];
  const seen = new Set(MCP_CATALOG.map((e) => e.id));
  for (const r of raw as Record<string, unknown>[]) {
    if (out.length >= CUSTOM_MCP_MAX) break;
    if (!r || typeof r !== 'object') continue;
    const id = typeof r.id === 'string' && /^custom-[a-z0-9][a-z0-9-]{0,39}$/.test(r.id) ? r.id : null;
    const label = typeof r.label === 'string' ? r.label.trim().slice(0, 60) : '';
    if (!id || seen.has(id) || !label || CONTROL.test(label)) continue;
    if (r.transport === 'http') {
      const url = customMcpUrl(r.url);
      const auth = r.auth === 'header' || r.auth === 'bearer' ? r.auth : 'none';
      const headerName = typeof r.headerName === 'string' ? r.headerName.trim() : '';
      if (!url) continue;
      if (auth === 'header' && (!/^[A-Za-z0-9-]{1,64}$/.test(headerName) || RESERVED_HEADERS.has(headerName.toLowerCase()) || headerName.toLowerCase() === 'authorization')) continue;
      out.push({ id, label, transport: 'http', url, auth, ...(auth === 'header' ? { headerName } : {}) });
    } else if (r.transport === 'stdio') {
      const command = typeof r.command === 'string' ? r.command.trim() : '';
      const args = Array.isArray(r.args) ? r.args.filter((a): a is string => typeof a === 'string') : [];
      const envName = typeof r.envName === 'string' ? r.envName.trim() : '';
      if (!command || command.length > 300 || CONTROL.test(command)) continue;
      if (args.length > 30 || args.some((a) => a.length > 500 || CONTROL.test(a))) continue;
      if (envName && (!/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(envName) || RESERVED_ENV.has(envName.toUpperCase()))) continue;
      out.push({ id, label, transport: 'stdio', command, args, ...(envName ? { envName } : {}) });
    } else continue;
    seen.add(id);
  }
  return out;
}

/** A custom server as a catalog entry. Always tier 'secret' and off by default:
 *  it can do anything the server allows, so the user switches it on explicitly. */
export function customMcpEntry(c: CustomMcpServer): McpCatalogEntry {
  const base = { id: c.id, label: c.label, tier: 'secret' as const, defaultEnabled: false };
  if (c.transport === 'http') {
    const secret: McpSecret | undefined = c.auth === 'bearer'
      ? { kind: 'header', name: 'Authorization', label: `${c.label} token` }
      : c.auth === 'header' ? { kind: 'header', name: c.headerName!, label: `${c.label} key (${c.headerName})` } : undefined;
    return {
      ...base,
      description: `Your own MCP server at ${new URL(c.url!).host}.`,
      spec: { transport: 'http', url: c.url!, ...(c.auth === 'bearer' ? { authType: 'bearer' as const } : {}) },
      ...(secret ? { secret } : {})
    };
  }
  return {
    ...base,
    description: `Your own MCP server: ${c.command}${c.args?.length ? ` ${c.args.join(' ')}` : ''}`.slice(0, 200),
    spec: { command: c.command!, args: c.args ?? [] },
    ...(c.envName ? { secret: { kind: 'env' as const, name: c.envName, label: `${c.label} key (${c.envName})` } } : {})
  };
}

/** The built-in catalog plus the user's own servers. */
export function fullMcpCatalog(custom: unknown): McpCatalogEntry[] {
  return [...MCP_CATALOG, ...sanitizeCustomMcp(custom).map(customMcpEntry)];
}

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

/** Split a remote entry's URL into the broker's base and the path the agent
 *  requests under it. The base is the MCP endpoint itself, not the vendor's
 *  origin: with only the origin, the connector's token could call any REST path
 *  on that host (e.g. delete GoHighLevel contacts), skipping the MCP tools. */
export function mcpUpstream(spec: McpHttpSpec): { baseUrl: string; path: string } {
  const u = new URL(spec.url);
  return { baseUrl: `${u.origin}${u.pathname}`, path: u.search };
}

/** True when the broker carries this entry's traffic (http, or stdio with `upstream`). */
export function isBrokered(e: McpCatalogEntry): boolean {
  // A keyless remote server (a user's own, with auth 'none') is called directly.
  return isHttpSpec(e.spec) ? !!e.secret : !!e.spec.upstream;
}

/** Where the broker forwards a brokered entry, and how it adds the key. */
export function mcpBrokerTarget(e: McpCatalogEntry): { baseUrl: string; authType: IntegrationAuthType; authHeader?: string } | undefined {
  if (e.secret?.kind !== 'header') return undefined;
  if (isHttpSpec(e.spec)) {
    const baseUrl = mcpUpstream(e.spec).baseUrl;
    return e.spec.authType === 'bearer' ? { baseUrl, authType: 'bearer' } : { baseUrl, authType: 'header', authHeader: e.secret.name };
  }
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
   *  `obsidian-vault`, `agent`, …). An entry needing one that is missing is skipped. */
  vars?: Record<string, string>;
  /** Owner feature switches; an entry whose switch is off is not offered. */
  features?: Partial<FeatureFlags>;
  /** The installed copy of an entry's pinned package, as the command to run it
   *  (without the server's own args), or undefined to fall back to `npx`. */
  localPackage?: (npm: McpNpmPackage) => { command: string; args: string[] } | undefined;
  catalog?: readonly McpCatalogEntry[];
}

/**
 * The per-agent `mcpServers` map, from catalog ∩ consent. Pure, so every rule is
 * unit-tested (test/mcp-connectors.test.cjs):
 *   - write/secret servers need an EXPLICIT `enabled: true` (never a default);
 *     a default-on entry (safe-readonly, browser) runs until switched off;
 *   - filesystem/git are scoped to the agent cwd;
 *   - ids are namespaced `atmt-<id>` so a user's own servers are never clobbered;
 *   - a server whose credential is missing is SKIPPED (reported), never launched
 *     half-configured;
 *   - an http server is written as the BROKER url + capability token, never the
 *     vendor URL + key; with the broker down it is skipped, not exposed;
 *   - a stdio server with `upstream` gets the same broker url + token in env;
 *   - a stdio server whose `<placeholder>` has no value is skipped
 *     ('not_configured'), never launched with a literal `<obsidian-vault>`;
 *   - an entry behind a switched-off feature is not offered, consent or not.
 */
export function buildMcpServers(input: BuildMcpServersInput): {
  servers: Record<string, McpServerConfig>;
  skipped: { id: string; reason: McpSkipReason }[];
  brokerIds: string[];
} {
  const servers: Record<string, McpServerConfig> = {};
  const skipped: { id: string; reason: McpSkipReason }[] = [];
  const brokerIds: string[] = [];
  for (const e of mcpCatalogFor(input.features, input.catalog)) {
    const consented = input.consent?.[e.id]?.enabled;
    const enabled = consented ?? e.defaultEnabled;
    if (!enabled) continue;
    if (!e.defaultEnabled && consented !== true) continue;
    const secret = e.secret ? input.getSecret(e.id) : undefined;
    if (e.secret && !secret) { skipped.push({ id: e.id, reason: 'no_secret' }); continue; }
    const key = `atmt-${e.id}`;
    const vars: Record<string, string> = { ...input.vars, cwd: input.cwd };
    let missing = false;
    // A user's own server is passed exactly as typed: `<name>` in its arguments
    // is the user's text, not one of the app's placeholders.
    const fill = (s: string): string => e.id.startsWith('custom-') ? s : s.replace(/<([a-z-]+)>/g, (m, name: string) => {
      if (vars[name]) return vars[name];
      missing = true;
      return m;
    });
    if (isHttpSpec(e.spec) && !e.secret) {
      // No key to protect (a user's own keyless server): the agent calls it directly.
      servers[key] = { type: 'http', url: e.spec.url, headers: {} };
      continue;
    }
    if (isHttpSpec(e.spec)) {
      if (!input.broker) { skipped.push({ id: e.id, reason: 'broker_offline' }); continue; }
      const { path } = mcpUpstream(e.spec);
      // The capability token always wins; a plain header without its value is dropped.
      const headers: Record<string, string> = {};
      for (const [h, v] of Object.entries(e.spec.headers ?? {})) {
        missing = false;
        const filled = fill(v);
        if (!missing && h.toLowerCase() !== 'authorization') headers[h] = filled;
      }
      headers.authorization = `Bearer ${input.broker.token}`;
      servers[key] = {
        type: 'http',
        url: `${input.broker.url}/i/${encodeURIComponent(mcpBrokerId(e.id))}/${path}`,
        headers
      };
      brokerIds.push(mcpBrokerId(e.id));
      continue;
    }
    let command = fill(e.spec.command);
    let args = e.spec.args.map(fill);
    const local = e.npm && input.localPackage?.(e.npm);
    if (local) {
      // Keep only the server's own args: everything after the package spec.
      const at = e.spec.args.findIndex((a) => a === e.npm!.pkg || a.startsWith(`${e.npm!.pkg}@`));
      command = local.command;
      args = [...local.args, ...args.slice(at + 1)];
    }
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

/** Connector skills to leave out of an agent: those whose connector is off
 *  (same rule as `buildMcpServers`: a default-off entry needs explicit consent). */
export function disabledConnectorSkills(consent: BuildMcpServersInput['consent'], catalog: readonly McpCatalogEntry[] = MCP_CATALOG): string[] {
  return catalog
    .filter((e) => e.skill && !(e.defaultEnabled ? consent?.[e.id]?.enabled !== false : consent?.[e.id]?.enabled === true))
    .map((e) => e.skill!);
}

/** Look up a catalog entry by id. */
export function mcpCatalogEntry(id: string): McpCatalogEntry | undefined {
  return MCP_CATALOG.find((e) => e.id === id);
}

/** Seed for `DEFAULTS.mcpDefaults` — derived from the catalog so the two never
 *  drift (safe-readonly and browser ON, write/secret OFF). */
export function defaultMcpDefaults(): Record<string, { enabled: boolean }> {
  const out: Record<string, { enabled: boolean }> = {};
  for (const e of MCP_CATALOG) out[e.id] = { enabled: e.defaultEnabled };
  return out;
}
