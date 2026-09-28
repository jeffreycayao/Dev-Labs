<div align="center">

<img src="./brand/Square%20logos/icon128.png" alt="ATMT Labs" width="96">

# ATMT Labs

**An office of AI coding agents, running on your machine.**

Local-first · multi-agent · Philippine edition · by [Automatika](https://automatika.ph)

</div>

---

ATMT Labs is a desktop app that wraps the terminal-agent CLIs you already run and turns them into a
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
| **Licensing** | Sign in with Google or Yahoo; 7-day card trial, one-time lifetime purchase, or a single-use unlock code. A paid computer is activated for good and never checks in again. | [docs/licensing/](docs/licensing/DESIGN.md) |
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

## ATMT Skills Library

The Skills tab browses skills published from the separate public
[ATMT Labs Floor Agent Skills repository](https://github.com/jeffreycayao/atmt_labs_floor_agentskills).
The app checks each downloaded file against the catalog's pinned commit and SHA-256 hash before
installing it. Installed skills update only when the user selects **Update**. The first release
installs into Claude Code's user skills directory; other agent install targets are not yet supported.
The published skills have their own ATMT-only use license. ATMT's bundled internal skills remain
part of the desktop app.

## Docs

- [docs/USER_GUIDE.md](docs/USER_GUIDE.md) — **for customers**: license, first run, hiring, floors, connections
- [AGENTS.md](AGENTS.md) — orientation for AI coding agents and contributors working in this repo
- [.documentations/GO_LIVE.md](.documentations/GO_LIVE.md) — production checklist (licensing, payments, website)
- [.documentations/HANDOFF.md](.documentations/HANDOFF.md) — where things stand and what to do next
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

Proprietary — © 2026 Automatika Consulting (ATMT Labs). All rights reserved. See [LICENSE](LICENSE).
End users are licensed under the [End User License Agreement](EULA.md) (draft); personal data is covered by the [Privacy Policy](PRIVACY.md) (draft).
Third-party components (including the MIT-licensed foundation this app is built on) keep their own licenses — see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and [LICENSE-ASSETS](LICENSE-ASSETS).
