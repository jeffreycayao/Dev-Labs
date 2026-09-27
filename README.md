<div align="center">

<img src="./brand/icon128.png" alt="ATMT Labs" width="96">

# ATMT Labs

**An office of AI coding agents, running on your machine.**

Local-first · multi-agent · MIT licensed · by [Automatika](https://automatika.ph)

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

## Docs

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

Source code: [MIT](LICENSE). Bundled pixel-art assets have their own terms — see [LICENSE-ASSETS](LICENSE-ASSETS).
