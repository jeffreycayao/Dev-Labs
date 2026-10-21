<div align="center">

<img src="./brand/JEPOY.DEV%20charcoal%20lime%20logo%20lockup.png" alt="Jepoy Floor AI by jepoy.dev" width="240">

# Jepoy Floor AI

### An office of AI coding agents, running on your machine

**Free, open source and local-first.** A multi-agent harness that works with the AI
subscriptions you already pay for. It turns the terminal coding CLIs you already run into a
team: each agent gets a desk, a terminal, memory and an inbox, and an orchestrator named
**Ramon** keeps the floor moving while you're away.

Wraps [Claude Code](https://claude.com/claude-code), OpenAI Codex, Antigravity and Gemini CLI,
**xAI Grok**, **Kimi Code**, **Qwen**, **OpenCode**, **Crush**, **pi**, **GitHub Copilot CLI** and
**Cursor**, with bring-your-own keys and local models. Philippine edition, with connectors for
**Pancake POS** and **Webcake**.

<p>
  <em>Electron · React · TypeScript · Pixi.js · xterm.js · node-pty</em>
</p>

<p>
  <a href="./LICENSE"><img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-C7FD11.svg?style=flat-square&labelColor=0B0A06"></a>
  <a href="./CHANGELOG.md"><img alt="Version: 3.0.3" src="https://img.shields.io/badge/version-3.0.3-C7FD11.svg?style=flat-square&labelColor=0B0A06"></a>
  <img alt="Platform: macOS | Windows | Linux" src="https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-F4F1EA.svg?style=flat-square&labelColor=0B0A06">
  <img alt="No account needed" src="https://img.shields.io/badge/account-not%20needed-F4F1EA.svg?style=flat-square&labelColor=0B0A06">
  <a href="./CONTRIBUTING.md"><img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-C7FD11.svg?style=flat-square&labelColor=0B0A06"></a>
  <a href="https://jepoy.dev"><img alt="Website: jepoy.dev" src="https://img.shields.io/badge/web-jepoy.dev-C7FD11.svg?style=flat-square&labelColor=0B0A06"></a>
</p>

**[⬇ Download for macOS, Windows or Linux](https://jepoy.dev/#download)**

<sub>No account, no sign-in, no license key. Every installer is on the
<a href="https://github.com/jeffreycayao/ATMT_LABS_FLOOR-releases/releases/latest">releases page</a>.</sub>

**New here?** Start with the [User Guide](./docs/USER_GUIDE.md).

<sub>A fork of <a href="https://github.com/HarnessMD/munder-difflin"><b>Munder Difflin</b></a> by
<a href="https://github.com/chaitanyagiri">Chaitanya Giri</a>, released under the same MIT License.</sub>

</div>

---

> [!NOTE]
> **Your agents, one office, one manager.**
> Jepoy Floor AI takes the terminal-agent CLIs you already run (`claude`, `codex`, `agy`, `gemini`,
> `grok`, `kimi`, `qwen`, `opencode`, `crush`, `pi`, `copilot` and `cursor-agent`) and turns them into
> a self-coordinating team: each agent gets long-term memory, a mailbox and a desk on a pixel-art
> office floor, and **Ramon** at the head desk plans the work and hands it out while you watch.
> He runs the floor; you still run him.

## Contents

- [Supported agents](#supported-agents)
- [What it is](#what-it-is)
- [How it works](#how-it-works)
- [Features](#features)
- [Getting started](#getting-started)
- [Architecture](#architecture)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [Telemetry](#telemetry)
- [License](#license)
- [Acknowledgements](#acknowledgements)

## Supported agents

**Bring the CLI you already pay for.** Every one of these runs as a real process in its own
terminal, on your existing subscription and its limits. If it runs in a terminal, it can run here.

<p>
  <a href="https://docs.claude.com/en/docs/claude-code"><kbd>Claude Code</kbd></a>
  <a href="https://github.com/openai/codex"><kbd>Codex · GPT</kbd></a>
  <a href="https://antigravity.google/docs/cli-overview"><kbd>Antigravity · Gemini</kbd></a>
  <a href="https://github.com/google-gemini/gemini-cli"><kbd>Gemini CLI</kbd></a>
  <a href="https://x.ai/cli"><kbd>Grok · xAI</kbd></a>
  <a href="https://www.kimi.com/code"><kbd>Kimi Code</kbd></a>
  <a href="https://github.com/QwenLM/qwen-code"><kbd>Qwen</kbd></a>
  <a href="https://opencode.ai/docs"><kbd>OpenCode</kbd></a>
  <a href="https://github.com/charmbracelet/crush"><kbd>Crush · Charm</kbd></a>
  <a href="https://pi.dev/docs/latest"><kbd>Pi</kbd></a>
  <a href="https://docs.github.com/copilot/concepts/agents/about-copilot-cli"><kbd>GitHub Copilot</kbd></a>
  <a href="https://cursor.com/docs/cli/install"><kbd>Cursor</kbd></a>
  <kbd>+ any custom command</kbd>
</p>

Plus **any model through OpenCode, Crush or pi**: GLM (Z.ai Coding Plan), DeepSeek, and local
models through Ollama.

## What it is

Jepoy Floor AI is a desktop app that wraps **real terminal-agent CLIs** as fully capable agents,
wires them into a **hive** of shared files, and puts **Ramon**, the orchestrator, in charge. Ramon
is the one agent *you* brief to get things done.

- **Every terminal is an agent.** Each `claude`, `codex`, `agy`, `grok`, `opencode` or custom session
  runs as a real process in a pseudo-terminal (`node-pty`), rendered with xterm.js.
- **Every agent is an avatar.** Sessions appear as characters on a Pixi.js office floor, with a
  Philippine flag and Pinoy office banter.
- **The hive coordinates them.** Agents read their memory and drain a mailbox; the router moves
  messages between inboxes; Ramon assigns, adjudicates and escalates only what needs you.
- **Memory that lasts.** Markdown memory per agent, mined into a shared, searchable store, so agents
  remember across sessions.

## How it works

```
            you ── talk to ──►  ┌─────────────┐
                                │    Ramon    │  orchestrator at the head desk
                                │ (god agent) │  roster · routing · adjudication
                                │             │  board · task ledger
                                └──────┬──────┘
                                       │ assigns · routes · escalates
              ┌────────────────────────┼────────────────────────┐
              ▼                         ▼                         ▼
        ┌───────────┐            ┌───────────┐            ┌───────────┐
        │  agent A  │  message   │  agent B  │  message   │  agent C  │
        │ provider  │ ─────────► │ provider  │ ─────────► │ provider  │
        │  + memory │            │  + memory │            │  + memory │
        └───────────┘            └───────────┘            └───────────┘
              └──────── shared hive: memory · mailbox · board · log ────────┘
```

1. **You hire agents**: each is a normal terminal process with its own working folder, identity and
   engine.
2. **Agents collaborate through the hive**: a local git repo of plain files. They write to their own
   `outbox/`; the router delivers into the recipients' `inbox/`. Only the harness commits, so agents
   never fight over git's lock.
3. **Ramon runs the floor**: he reads every request, settles routine ones himself and escalates only
   the critical ones (spend, destructive operations, scope changes) to you.
4. **Everything is visible**: watch the floor, read any terminal live, type back into it, browse its
   files and its git history.

See [`HIVE.md`](./HIVE.md) for the multi-agent design, [`SPEC.md`](./SPEC.md) for the terminal and
event plane, and [`DESIGN.md`](./DESIGN.md) for the visual system.

## Features

<table>
<tr>
<td width="50%" valign="top">

### Talk to one agent, not twelve

Ramon is the only agent you brief. He plans the work, hands it to the right agent, routes the
traffic between them and escalates the few things that actually need you. Turn on **Talk** to
brief him by voice.

</td>
<td width="50%" valign="top">

### Hire a whole team as one file

A **floor** is a team of agents you can import or export as one `.floor.json` file or an
`atmtlabs://floor` link. Try the ready-made **Online Seller Team**: a shop manager, a landing-page
designer and a product copywriter. See [FLOORS.md](./.documentations/FLOORS.md).

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Hire one agent in a few clicks

Pick the engine, the model and the autonomy, give it a desk, and it starts working. Share a single
agent as a **hire** manifest or link; importing only fills in the form, and you still press start.
See [docs/hires](./docs/hires/).

</td>
<td width="50%" valign="top">

### Let agents work in your shop

**Connections** let agents work inside Pancake POS (orders, products, stock, sales), Webcake
(landing pages), GitHub and more. Keys stay encrypted on your computer, and for hosted connectors
the agent never sees the key at all. See [CONNECTORS.md](./.documentations/CONNECTORS.md).

</td>
</tr>
<tr>
<td width="50%" valign="top">

### A whole building, not just one floor

Open a new floor for another repo or folder, each with its own agents, tasks and memory, up to
**200 floors** at once. Ramon manages the building, and agents on different floors can message
each other.

</td>
<td width="50%" valign="top">

### Autonomy with a leash

Set how far each agent may go on its own. Token budgets per agent and per floor, approvals for
spend and destructive operations, and a circuit breaker that steers, constrains, then stops anything
that loops or runs away.

</td>
</tr>
<tr>
<td width="50%" valign="top">

### Finished files come back to you

Agents hand back finished work (HTML, Markdown, PDF, DOCX, images, spreadsheets, slides) as
**Deliveries**. Review them in the Command Center tray and save them where you want.

</td>
<td width="50%" valign="top">

### Set up once

The onboarding wizard checks what you already have and offers to install what's missing. A missing
CLI shows as an **Install** card in the agent's terminal instead of an error.

</td>
</tr>
</table>

**The floor**
- **Every terminal is a real agent.** Twelve engines or a custom command, each in its own PTY, rendered with xterm.js.
- **Every agent is an avatar** on a Pixi.js office floor, with stations, desks and a head desk for Ramon.
- **Per-agent git worktrees.** Optional isolation so parallel agents never collide on a branch; the base checkout's `node_modules` is linked in.
- **New project floor.** Settings → General opens a clean floor for an existing repo or folder.
- **Reset with backup.** Clear a floor's agents, tasks and memory, with an optional restorable ZIP.

**Memory and coordination**
- **The hive**: per-agent memory, atomic-file mailboxes, a shared board, an append-only event log and single-committer git.
- **Shared memory search** across every agent, plus a knowledge graph of your own documents.
- **Restart & Continue**: redraw a garbled terminal without losing the conversation.

**Control and safety**
- **Human gates**: spend, scope and destructive operations come to you. Steer mid-run or stop gracefully.
- **Circuit breaker**: a steer → constrain → stop ladder for agents that loop, repeat errors or blow their budget.
- **Budgets and cost**: per-agent token caps and real cost read from transcripts.

**Command Center**
- Kanban tasks, an **Ask me** inbox for agent questions, weekday schedules, live fleet monitoring, memory search, activity log and Deliveries.
- **Skills**: browse and install skills from the [Jepoy Floor AI skills repository](https://github.com/jeffreycayao/atmt_labs_floor_agentskills). Each file is checked against a pinned commit and SHA-256 hash.
- **Built-in Monaco IDE**: file tree, editor tabs and git rails (changes, history, compare) with a commit graph and diffs.

**Getting work in and out**
- **Slack and webhooks**: message a channel or POST a webhook, and Ramon picks up the work and replies in the thread. Inbound servers listen on your computer only and are reached through a tunnel.
- **Voice**: talk to Ramon through OpenAI's Realtime API with your own key, or dictate into the message box with Free Flow (Groq Whisper).
- **Your language**: English, Simplified Chinese and Arabic, with right-to-left layout for Arabic.
- **Updates in one click** from the public releases feed; no GitHub account or token needed.

<div align="right">(<a href="#jepoy-floor-ai">↑ back to top</a>)</div>

## Getting started

### Download the app

**Most people want this one.** Jepoy Floor AI is free and open source, with no account or sign-in.
Installers for macOS, Windows and Linux are on [jepoy.dev](https://jepoy.dev/#download) and the
[releases page](https://github.com/jeffreycayao/ATMT_LABS_FLOOR-releases/releases/latest). Install it,
open it, and the wizard takes you the rest of the way.

You still need at least one agent CLI on your computer, signed in with that company's account.
**Settings → Prerequisites** lists what's missing.

### Build from source

Everything below is for contributors and for people who want an unreleased build.

#### Prerequisites

- **macOS, Windows or Linux**.
- **Node.js 18+** and npm.
- A **C/C++ toolchain** for the native modules (`node-pty`, `better-sqlite3`): Xcode Command Line
  Tools on macOS, **Visual Studio Build Tools (C++ workload)** on Windows.
- At least one supported agent CLI on your `PATH`.

#### Install and run

```bash
git clone https://github.com/jeffreycayao/Dev-Labs.git
cd Dev-Labs
npm install        # postinstall rebuilds the native modules against Electron
npm run dev        # launches the app with hot reload
```

No toolchain on Windows? Install with `npm install --ignore-scripts`, run
`node node_modules/electron/install.js`, fetch the prebuilt SQLite binary with
`npx prebuild-install --runtime electron --target <electron-version>` inside
`node_modules/better-sqlite3`, then run `node tools/patch-node-pty-conpty.cjs`.

#### Other scripts

| Script | What it does |
| --- | --- |
| `npm run typecheck` | TypeScript checks (main + renderer) |
| `npm run test:focused` | Node test suite |
| `npm run build` | Production build |
| `npm run dist` | Build installers into `dist/` |
| `npm run version:patch` / `:minor` / `:major` | Raise the app version before every source push. See [RELEASE.md](RELEASE.md) |

> If `node-pty` fails to load after an Electron upgrade, run `npm install` again (the `postinstall`
> hook rebuilds it against the current Electron).

## Architecture

Two data planes feed one renderer: a **terminal plane** that owns the PTYs, the filesystem and git,
and an **event plane** that runs the hive, the hook server and the router. The renderer reaches both
only through one typed bridge (`window.cth`).

The diagrams and the module-by-module map are in [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md).
Contributors and AI coding agents should read [`AGENTS.md`](./AGENTS.md) first. Brand names, slugs
and the release repo are in [`src/shared/brand.ts`](./src/shared/brand.ts); colors in
[`src/renderer/src/design/tokens.css`](./src/renderer/src/design/tokens.css).

<div align="right">(<a href="#jepoy-floor-ai">↑ back to top</a>)</div>

## Roadmap

Shipped through **v3.0.0**: open source under MIT with no account, the J monogram rebrand, new
project floors, agents that stay hired, Deliveries, a building of up to 200 floors, floors and hires
as shareable files, Pancake POS and Webcake connectors, the skills library, Restart & Continue for
every engine, and English, Simplified Chinese and Arabic. Full history in
[`CHANGELOG.md`](./CHANGELOG.md).

Next up:

- [ ] **Connectors for every engine**: today connectors attach to Claude Code agents only.
- [ ] **More Philippine business connectors** and ready-made floors.
- [ ] **One code editor**: move the remaining CodeMirror editors to Monaco.
- [ ] **Filipino interface language**.

<div align="right">(<a href="#jepoy-floor-ai">↑ back to top</a>)</div>

## Contributing

Contributions are welcome. Start with [`CONTRIBUTING.md`](./CONTRIBUTING.md) and
[`AGENTS.md`](./AGENTS.md). The short version: fork, `npm install && npm run dev`, keep
`npm run typecheck` and the tests green, put every UI string in all three languages, and derive any
new UI from the [`DESIGN.md`](./DESIGN.md) tokens.

Questions or bugs: [open an issue](https://github.com/jeffreycayao/Dev-Labs/issues). Security
problems: see [`SECURITY.md`](./SECURITY.md).

**Everyone whose code is in this project is listed in [`CONTRIBUTORS.md`](./CONTRIBUTORS.md)**,
including Chaitanya Giri and the Munder Difflin contributors whose work this fork is built on.

## Telemetry

Official builds can send a **small set of anonymous usage events** (app opened, agent started,
feature used), never prompts, code, file paths or agent output. Turn it off in Settings or with
`DO_NOT_TRACK`; builds you compile yourself send nothing. The full event list is in
[`TELEMETRY.md`](./TELEMETRY.md), and the [Privacy Policy](./PRIVACY.md) covers the rest.

## License

> [!IMPORTANT]
> **Asset licensing.** The bundled pixel art (tilesets and maps) is **Modern Interiors - RPG Tileset
> [16X16]** by [LimeZu](https://limezu.itch.io/moderninteriors), used under the **Complete Version
> licence**. **Credit to LimeZu is required by that licence** and must stay in place. The office cast
> is not LimeZu art; it is drawn in code in `portraitArt.ts`. See
> [`src/renderer/src/assets/ATTRIBUTION.md`](./src/renderer/src/assets/ATTRIBUTION.md).

The **source code** is licensed under the **[MIT License](./LICENSE)**, © 2026 Chaitanya Giri and
Automatika Consulting. The MIT grant covers the code only; the bundled pixel art is licensed
separately and carved out in [`LICENSE-ASSETS`](./LICENSE-ASSETS). Other third-party components are
listed in [`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md). Claude, Codex, Gemini, Cursor and
other names belong to their owners and are used only to describe compatibility.

## Acknowledgements

- [**Munder Difflin**](https://github.com/HarnessMD/munder-difflin) by [Chaitanya Giri](https://github.com/chaitanyagiri) and its [contributors](./CONTRIBUTORS.md): the open-source harness this app is forked from.
- [LimeZu](https://limezu.itch.io/) for the *Modern Interiors* pixel-art tilesets (Complete Version licence).
- [`shahar061/the-office`](https://github.com/shahar061/the-office) for the office tileset and map vendoring.
- [Pixi.js](https://pixijs.com/) · [xterm.js](https://xtermjs.org/) · [node-pty](https://github.com/microsoft/node-pty) · [electron-vite](https://electron-vite.org/) · [Monaco](https://microsoft.github.io/monaco-editor/) · [CodeMirror](https://codemirror.net/) for the libraries this is built on.
