# AGENTS.md — working in this repo

Before every source push, increase the app's `Major.Minor.Patch` version with
`npm run version:patch`, `npm run version:minor`, or `npm run version:major`.
Commit `package.json` and `package-lock.json` with the pushed work. Use minor
for a new backwards-compatible feature, major for a breaking change, and patch
for fixes and routine updates. See [RELEASE.md](RELEASE.md).

Orientation for AI coding agents (Claude Code, Codex, Cursor, …) and human contributors.
Read this first, then [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the deep map.

## What this is

ATMT Labs is a **proprietary** Electron desktop app. It runs a team of terminal AI agents (Claude Code, Codex, Antigravity, Cursor and others) in a pixel-art office, with an orchestrator named Ramon.

The account service in `services/licensing` requires Google/Yahoo sign-in. All signed-in accounts receive free access; purchase and unlock-code flows are retired.

## Layout

| Path | What |
|---|---|
| `src/main/` | Electron main process: PTYs (`pty.ts`), hive/agent coordination (`hive.ts`), licensing client (`license*.ts`), MCP proxy (`integrationBroker.ts`), hires/floors I/O (`hire.ts`), IPC (`index.ts`) |
| `src/preload/index.ts` | The **only** renderer↔main bridge (`window.cth`), fully typed |
| `src/renderer/src/` | React 18 + zustand UI; office scene (Pixi.js); `components/`; `i18n/locales/{en,zh-CN,ar}.json` |
| `src/shared/` | Pure, dependency-light modules shared by main and renderer: validators (`hire.ts`, `floor.ts`), MCP catalog (`mcpCatalog.ts`), license types (`license.ts`), brand (`brand.ts`) |
| `services/licensing/` | Separate Vercel account project (Hono + Neon). Own `package.json`, own tests |
| `test/*.test.cjs` | App tests (`node --test`, TS loaded via `test/load-ts.cjs`) |
| `docs/`, `.documentations/` | Contributor docs / user- and owner-facing guides |

## Commands

```bash
npm ci                   # app deps (needs a C/C++ toolchain for node-pty, better-sqlite3)
npm run typecheck        # main + renderer
node --test test/*.test.cjs   # app tests (= npm run test:focused)
npm run build            # electron-vite build
npm run dev              # run the app

cd services/licensing
npm ci && npm run typecheck && npm test   # service tests: real SQL on PGlite, fake IdPs
```

CI (`.github/workflows/`) runs: app typecheck, `check:links`, build, and service typecheck + tests.

`test/proc-kill.test.cjs` fails in sandboxed Linux containers; that's a known issue that predates this work.

## Rules that are enforced by tests. Don't break them.

- **i18n parity.** Every UI string is in `en`, `zh-CN` and `ar`, with the same keys and interpolation variables.
- **Shared manifests are untrusted.** Hires and floors go through `validateHireManifest` / `validateFloorManifest`:
  - they never carry a binary or a raw command (the command is built locally from the provider preset);
  - flags must come from the safe list;
  - MCP/skill ids must come from the allowlists;
  - importing never spawns.
- **Connector keys** live only in Electron `safeStorage`. HTTP connectors reach the vendor through the loopback broker, so the agent never sees the key. Keyed catalog entries are never on by default.
- **MCP servers go in `--mcp-config`**, never `--settings`. Claude Code ignores the latter.
- **Account access:**
  - `spawnAgentCore` refuses spawns until a free account is signed in.
  - Free access tokens expire and renew through the account session. Existing machine-bound paid or unlock-code activations keep their original offline grant until sign-out.
  - Keep old public keys in `src/shared/brand.ts` for migration and key rotation.
- **Service SQL** is tested for real (PGlite). Historical purchase records remain readable but do not control free access.

## Conventions

- Match the surrounding code: comment density, naming, inline styles with `--cth-*` tokens (see `DESIGN.md`).
- Renderer ↔ main only through `window.cth`. Add the IPC handler in `src/main`, the method in `src/preload/index.ts`, and a test.
- Pure logic goes in `src/shared/` so it's testable with `loadTs` and no Electron.
- User-facing text: plain words, no jargon; errors say what to do next.
- Docs to update with a feature:
  - `CHANGELOG.md` (Unreleased);
  - the relevant `.documentations/*.md` or `docs/*.md`;
  - `docs/USER_GUIDE.md` if customers see it.
- After code changes, run `graphify update .` if graphify is installed (see `CLAUDE.md`).

## Where things are documented

| Topic | Doc |
|---|---|
| Customer guide | `docs/USER_GUIDE.md` |
| Account design / API / runbook | `docs/licensing/DESIGN.md`, `docs/licensing/API.md`, `services/licensing/README.md` |
| Going to production | `.documentations/GO_LIVE.md` |
| Floors / connectors | `.documentations/FLOORS.md`, `.documentations/CONNECTORS.md` |
| Legal (drafts) | `EULA.md`, `PRIVACY.md`, `LICENSE`, `THIRD_PARTY_NOTICES.md`, `LICENSE-ASSETS` |
| Telemetry contract | `TELEMETRY.md` (the code's allowlist must match it) |
