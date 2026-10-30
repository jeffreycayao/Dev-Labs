# Connectors (MCP servers) — user & maintainer guide

Connectors let agents on your floor work inside other apps.

**Where users turn them on:** Settings → **Connections** → *Default MCP servers*.
**Where they're defined:** `src/shared/mcpCatalog.ts`.

## Available connectors

| Connector | What agents can do | Key you paste | Where to get it |
|---|---|---|---|
| **Pancake POS** | Read and change your shop: orders, products, stock, sales | Pancake POS API key | [docs.pancake.biz — POS MCP setup](https://docs.pancake.biz/pos/st-f14/st-p2?lang=en) (account API key recommended) |
| **Webcake Landing** | Design, edit and publish landing pages in your Webcake account | Webcake token | Webcake → Settings → Access code → Generate API keys ([guide](https://docs.pancake.biz/landing/st-f7/st-p3?lang=en)) |
| GitHub, Database, Email & Calendar, Web Search | See the descriptions in Settings | The token or connection string named in the field | The "how to get it" link in Settings |

Safe read-only servers (Filesystem, Git, Fetch, Time and others) are on by default and need no key.

## Using a connector

1. Open Settings → Connections.
2. Paste the key and press **Save**. It's stored encrypted and never shown again.
3. Switch the connector **On**.
4. **Start a new agent.** Running agents keep the connectors they started with.

If a connector is on but has no key, the agent starts without it and Settings says so.

## How keys are protected

| Connector type | How the key reaches it |
|---|---|
| **Hosted by the vendor** (Pancake POS) | The agent never receives the key. It talks to a local proxy (`127.0.0.1`) using a per-agent token. The proxy adds the key on the way out, and the token dies with the agent. |
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
- **Every keyed connector:** `tier: 'secret'`, `defaultEnabled: false`, and an https `helpUrl`. `test/mcp-connectors.test.cjs` enforces these rules.

## On hold

**Meta Ads MCP** and **Meta's platform MCP servers** (WhatsApp Business Tools, Devtools) will be added after the other roadmap features. They need an OAuth sign-in flow and spending guardrails.
