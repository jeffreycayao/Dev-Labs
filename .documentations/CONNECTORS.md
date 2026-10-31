# Connectors (MCP servers) — user & maintainer guide

Connectors let agents on your floor work inside other apps.

**Where users turn them on:** Settings → **Connections** → *Default MCP servers*.
**Where they're defined:** `src/shared/mcpCatalog.ts`.

## Available connectors

| Connector | What agents can do | Key you paste | Where to get it |
|---|---|---|---|
| **Pancake POS** | Read and change your shop: orders, products, stock, sales | Pancake POS API key | [docs.pancake.biz — POS MCP setup](https://docs.pancake.biz/pos/st-f14/st-p2?lang=en) (account API key recommended) |
| **Webcake Landing** | Design, edit and publish landing pages in your Webcake account | Webcake token | Webcake → Settings → Access code → Generate API keys ([guide](https://docs.pancake.biz/landing/st-f7/st-p3?lang=en)) |
| **Obsidian** | Save notes, learnings and decisions (frontmatter, tags, [[links]]), append to today's daily note, search and read notes | No key: you pick the vault folder | Any folder; ideally one Obsidian has opened as a vault |
| **Discord** | Post messages to channels, read recent messages, list servers and channels | Discord bot token | [Discord Developer Portal](https://discord.com/developers/applications) → your app → Bot → Reset Token |
| GitHub, Database, Email & Calendar, Web Search | See the descriptions in Settings | The token or connection string named in the field | The "how to get it" link in Settings |

Safe read-only servers (Filesystem, Git, Fetch, Time and others) are on by default and need no key.

## Using a connector

1. Open Settings → Connections.
2. Paste the key and press **Save**. It's stored encrypted and never shown again.
3. Switch the connector **On**.
4. **Start a new agent.** Running agents keep the connectors they started with.

If a connector is on but has no key, the agent starts without it and Settings says so.

### Obsidian

Settings → Connections → Obsidian → **choose folder**, switch it **On**, start a new agent. The agent gets four tools:

| Tool | Does |
|---|---|
| `save_note` | Writes `DevLabs/<Title>.md` (folder configurable) with YAML frontmatter (`title`, `kind`: note / learning / decision / topic, `tags`, `created`, `source: devlabs`), a heading, the body and a `Related: [[…]]` line. Saving to an existing title **appends** an `## Update <date>` section. |
| `append_daily` | Adds `- HH:MM text #tags` to `Daily/YYYY-MM-DD.md`, creating it with frontmatter if needed. |
| `read_note` | Reads a note by vault-relative path. |
| `search_notes` | Text and/or tag search (nested tags match their parent), newest first; no query lists recent notes. |

Rules the server enforces (`test/obsidian-connector.test.cjs`): every path resolves inside the vault, symlinks and junctions included; dot-folders (`.obsidian`, `.trash`, `.git`) are never read or written; nothing is ever overwritten or deleted. Obsidian doesn't need to be running.

**Optional: Obsidian Local REST API.** For things files can't do (open a note in Obsidian, run a command, use Obsidian's own search), install the community plugin [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api), enable its non-encrypted HTTP server (port 27123), and add it under **Connected services** with the *Obsidian Local REST API* template. Workers reach it through the broker like any other REST integration. Obsidian must be open for it to answer.

### Discord

1. [discord.com/developers/applications](https://discord.com/developers/applications) → **New Application**.
2. **Bot** → **Reset Token** → paste the token into Settings → Connections → Discord → **Save**.
3. Same page: turn on **Message Content Intent** (needed to read channel messages).
4. **OAuth2 → URL Generator**: scope `bot`; permissions *View Channels*, *Send Messages*, *Read Message History*. Open the link and add the bot to your server.
5. Switch Discord **On** and start a new agent. Tools: `send_message` (splits past 2000 characters; optional `reply_to`), `read_messages`, `list_channels`. Posts set `allowed_mentions` to nothing, so an agent can't ping `@everyone`.

**Discord as a trigger.** Triggers tab → **Discord**: paste channel ids (Developer Mode → right-click → Copy Channel ID) and switch on. Only allowed users can start work: the user ids listed under *Who can start work*, or, when that's empty, the bot application's owner (or its team members), looked up from `GET /oauth2/applications/@me` at start. Everyone else is ignored, since a server can be public and requests run autonomously. When an allowed user @-mentions the bot in one of those channels, the app replies "Received" and queues the request for Ramon with instructions to post the result back through the Discord connector. The app polls the listed channels every 5 seconds over Discord's REST API with the same bot token: no public tunnel and no listening port. DMs aren't watched.

## How keys are protected

| Connector type | How the key reaches it |
|---|---|
| **Hosted by the vendor** (Pancake POS) | The agent never receives the key. It talks to a local proxy (`127.0.0.1`) using a per-agent token. The proxy adds the key on the way out, and the token dies with the agent. |
| **Bundled, calling a vendor API** (Discord) | Same as above: the bundled server only gets the proxy URL and the per-agent token; the proxy adds `Authorization: Bot <token>` on the way to `discord.com/api/v10` and can't be pointed anywhere else. |
| **Bundled, no key** (Obsidian) | Nothing to protect: the server only gets the vault path. |
| **Runs on your computer** (Webcake, GitHub and others) | The key goes into that agent's private `mcp.json` (owner-only file permissions) as the server's environment variable. The agent's own tools could technically read that file, so only enable connectors for agents you trust with that account. |

Keys never leave the app's main process except to the connector itself. Without an OS keychain (some Linux setups), keys can't be saved at all; the app refuses rather than storing them in plain text.

## Limits (plainly)

- **Claude Code agents only, for now.** Connectors are attached through Claude Code's `--mcp-config`. Codex and other engines don't receive them yet.
- **Connectors can change real data.** Pancake POS can edit your shop, and Webcake can publish pages. Webcake runs a test ("dry run") by default before saving; Pancake POS acts within your key's permissions. Prefer a key with the least access you need.
- **The Webcake server is published on npm by one developer.** It's the one Webcake's docs point to. The version is **pinned** (`webcake-landing-mcp@1.5.2`); updating it is a reviewed code change, never automatic.

## Adding a new connector (maintainers)

Add an entry to `MCP_CATALOG` in `src/shared/mcpCatalog.ts`:

- **Vendor-hosted:** `spec: { transport: 'http', url: 'https://…' }` and `secret: { kind: 'header', name: '<Header-Name>', … }`. The broker proxies it automatically.
- **Local server:** `spec: { command, args }` with a **pinned** package version, and `secret: { kind: 'env', name: '<ENV_VAR>', … }`.
- **Bundled (ships with the app):** a dependency-free `resources/md-<name>-mcp.cjs` built on `resources/md-mcp-stdio.cjs`, listed in `electron-builder.yml` `extraResources`. Spec: `command: '<node>'`, `args: ['<resources>/md-<name>-mcp.cjs']`, `env: { ELECTRON_RUN_AS_NODE: '1' }`. `<name>` placeholders are filled at spawn from `mcpVars` in `src/main/index.ts`; an entry with an unfilled one is skipped (`not_configured`). To call a vendor REST API without seeing the key, add `upstream: { url, authType }` and a `secret` of kind `header`: the server gets `MD_UPSTREAM_URL` + `MD_UPSTREAM_TOKEN` and the broker injects the key.
- **Every keyed connector:** `tier: 'secret'`, `defaultEnabled: false`, and an https `helpUrl`. `test/mcp-connectors.test.cjs` enforces these rules.
- **Setup steps** for the Settings "How to set up" link: an array at `mcpDefaults.setup.<id>` in all three locale files.

## On hold

**Meta Ads MCP** and **Meta's platform MCP servers** (WhatsApp Business Tools, Devtools) will be added after the other roadmap features. They need an OAuth sign-in flow and spending guardrails.
