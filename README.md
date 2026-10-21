<div align="center">

<img src="./brand/Solid%20charcoal%20J%20monogram%20favicon.png" alt="Jepoy Floor AI" width="96">

# Jepoy Floor AI

**An office of AI coding agents, running on your machine.**

Local-first · multi-agent · open source (MIT) · Philippine edition · [jepoy.dev](https://jepoy.dev)

A fork of [**Munder Difflin**](https://github.com/chaitanyagiri/munder-difflin) by [Chaitanya Giri](https://github.com/chaitanyagiri)

</div>

---

Jepoy Floor AI is a desktop app that wraps the terminal-agent CLIs you already run and turns them into a
team: each agent gets its own terminal, working directory, memory and inbox, and an orchestrator
(**Ramon**, at the head desk) plans work, delegates it and keeps the floor moving while you're away.

## Supported agents

| Provider | CLI |
| --- | --- |
| Claude Code | `claude` |
| OpenAI Codex | `codex` |
| Gemini CLI / Antigravity | `gemini` / `agy` |
| xAI Grok | `grok` |
| Kimi Code | `kimi` |
| Qwen Code | `qwen` |
| GitHub Copilot / Cursor | `copilot` / `cursor-agent` |
| OpenCode · Crush · pi | `opencode` / `crush` / `pi` — any model, incl. GLM, DeepSeek, local Ollama |
| Custom | any command |

## What's in it

| Feature | In short | Docs |
| --- | --- | --- |
| **No account** | Free and open source. No sign-in, no license key: every feature works on install. | [LICENSE](LICENSE) |
| **Floors** | Import or export a whole team of agents as one `.floor.json` file or `atmtlabs://floor` link. | [.documentations/FLOORS.md](.documentations/FLOORS.md) |
| **Hires** | Share a single agent as a `.json` manifest or link. | [docs/hires/](docs/hires/) |
| **Connections** | Let agents work in Pancake POS, Webcake, GitHub and more; keys stay encrypted on your computer. | [.documentations/CONNECTORS.md](.documentations/CONNECTORS.md) |

New users: start with the **[User Guide](docs/USER_GUIDE.md)**.

## Getting started

**Prerequisites:** Node.js 18+, npm, and at least one agent CLI on your `PATH`.
Native modules (`node-pty`, `better-sqlite3`) need a C/C++ toolchain:
Xcode Command Line Tools on macOS, **Visual Studio Build Tools (C++ workload)** on Windows.

```bash
npm install
npm run dev
```

No toolchain on Windows? Install with `npm install --ignore-scripts`, run `node node_modules/electron/install.js`,
fetch the prebuilt SQLite binary with `npx prebuild-install --runtime electron --target <electron-version>`
inside `node_modules/better-sqlite3`, then run `node tools/patch-node-pty-conpty.cjs`.

| Script | What it does |
| --- | --- |
| `npm run dev` | Run the app with hot reload |
| `npm run typecheck` | TypeScript checks (main + renderer) |
| `npm run test:focused` | Node test suite |
| `npm run dist` | Build installers into `dist/` |
| `npm run release:patch` / `:minor` / `:major` | Bump version, changelog, tag, build — see [RELEASE.md](RELEASE.md) |
| `npm run version:patch` / `:minor` / `:major` | Increase the app version before every source push — see [RELEASE.md](RELEASE.md) |

## Jepoy Floor AI Skills Library

The Skills tab browses skills published from the separate public
[Jepoy Floor AI Floor Agent Skills repository](https://github.com/jeffreycayao/atmt_labs_floor_agentskills).
The app checks each downloaded file against the catalog's pinned commit and SHA-256 hash before
installing it. Installed skills update only when the user selects **Update**. The first release
installs into Claude Code's user skills directory; other agent install targets are not yet supported.
The published skills have their own Jepoy Floor AI-only use license. Jepoy Floor AI's bundled internal skills remain
part of the desktop app.

## Docs

- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — **for users**: first run, hiring, floors, connections
- [AGENTS.md](AGENTS.md) — orientation for AI coding agents and contributors working in this repo
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — how the main process, hive and renderer fit together
- [DESIGN.md](DESIGN.md) · [docs/DESIGN.md](docs/DESIGN.md) — design system
- [HIVE.md](HIVE.md) — agent coordination model
- [docs/hires/](docs/hires/) — shareable agent "hire" manifests
- [TELEMETRY.md](TELEMETRY.md) — anonymous usage events (off unless built with a PostHog key)

## Brand

Brand assets live in [`brand/`](brand/). App name, slugs and the release repo are defined in
[`src/shared/brand.ts`](src/shared/brand.ts); colors in
[`src/renderer/src/design/tokens.css`](src/renderer/src/design/tokens.css).

## License

[MIT](LICENSE) — © 2026 Chaitanya Giri and Automatika Consulting.

Jepoy Floor AI is built on [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin), created by
Chaitanya Giri and its [contributors](CONTRIBUTORS.md), and is released under the same MIT License.
Office tilesets are by [LimeZu](https://limezu.itch.io/) under their own license ([LICENSE-ASSETS](LICENSE-ASSETS));
other third-party components are listed in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
The [Privacy Policy](PRIVACY.md) covers the optional anonymous usage stats.
