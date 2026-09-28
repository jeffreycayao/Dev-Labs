# ATMT Labs — User Guide

ATMT Labs turns the AI coding tools you already use into a **team of agents in a virtual office**:
- Each agent has its own desk, terminal, project folder, memory and inbox.
- **Ramon**, your orchestrator at the head desk, plans work, hands it out and keeps the floor moving.

Download: **https://labs.atmt.dev** · Help: **hello@automatika.ph**

---

## 1. Before you start

You need **at least one AI coding tool** installed and signed in on your computer:

| Tool | Command it runs |
|---|---|
| Claude Code | `claude` |
| OpenAI Codex | `codex` |
| Gemini CLI / Antigravity | `gemini` / `agy` |
| Cursor | `cursor-agent` |
| Others: Grok, Kimi, Qwen, Copilot, OpenCode, Crush, pi, or any command | see Settings → Agents & Models |

ATMT Labs doesn't include AI usage. **Each tool bills you through your own account with that company.**

## 2. Get a license

When ATMT Labs opens, it asks you to sign in. Signing in happens in your browser, with **Google or Yahoo**; afterwards the browser sends you back to the app.

Then choose one:

| Option | What happens |
|---|---|
| **Start 7-day free trial** | Enter a card on Stripe's secure page. **Nothing is charged for 7 days.** On day 7 your card is charged **once** for a lifetime license. Cancel before then with **Account → Cancel Free Trial…** in the app menu (or at `auth.labs.atmt.dev/account`) and you pay nothing. One trial per person and per card. |
| **Buy lifetime license** | Pay once. No subscription, no renewals. |
| **Have an unlock code?** | Click it on the sign-in screen (after signing in), paste the code (`ATMT-XXXXX-XXXXX-XXXXX-XXXXX`) and press **redeem**. You get a free lifetime license. Each code works once. If you got a link like `auth.labs.atmt.dev/redeem?code=…`, open it, sign in, and press **Redeem code**. |

**Your license belongs to your email.** Sign in with the same email on another computer to use it there, up to **3 computers**. Free a seat at `auth.labs.atmt.dev/account` → **Computers** → **Remove**.

**Once a computer has a lifetime license, it never needs the internet again for licensing.** It's activated for good. Reinstalling your operating system counts as a new computer: sign in again.

## 3. First run

1. **Pick a harness config.** This is the folder where ATMT Labs keeps one workspace: settings, agents, memory and history. Choose **create new config…** the first time.
2. **Set up, in 4 steps:** a home for the app, Ramon's engine, your projects, and permissions.
3. **You land on the office floor.** Ramon boots at the head desk.

## 4. Hire agents

Click **add agent**. Give the agent a name, a look, a project folder, an engine and model, and a standing goal. Then press **spawn**.

| Shortcut | How |
|---|---|
| **Role templates** | Pick a ready-made role (Technical or Non-technical) to fill in everything. |
| **import hire…** | Load one agent from a `.json` file someone shared. |
| **generate one with AI…** | Copy the prompt into any AI chat, describe the agent you want, and save its reply as a `.json` file to import. |

Nothing starts until you press **spawn**.

## 5. Floors: hire a whole team at once

A **floor** is a whole team saved in one file (`.floor.json`).

**Import a floor:** **add agent** → **import floor…**, or open an `atmtlabs://floor?src=https://…` link. The review screen shows every agent and the tools they need. Then:
- **hire all:** hires everyone into the project folder you pick;
- **review one by one:** opens each agent in the normal form, so you can change or skip it;
- **cancel:** hires nobody.

**Export your floor:** **add agent** → **export floor…** → name it → **save file…** The file includes each agent's name, role, goal, look, engine, model and token budget. It never includes your folders, keys, memory or conversations.

**Reset your floor:** **Settings → General → reset floor**. Confirm with **back up ZIP & reset** or **reset without backup**. This ends running agents and removes the floor's roster, messages, tasks, board and shared memory across all floor windows. Your license, app settings (including schedules) and project source folders remain. If you choose a backup, cancelling the file picker changes nothing; the app verifies the ZIP before resetting.

The ZIP contains `floor/` (roster, hive and shared memory), matching Claude session transcripts under `claude-projects/`, a manifest and `RESTORE.txt`. It can contain private prompts and messages, so keep it in a private place. To restore, quit ATMT Labs, extract `floor/` into the original home folder named in the manifest and `claude-projects/` into your Claude projects folder, then reopen the app. Restore into an empty floor. Project source folders and account credentials are not bundled.

**Try it:** the *Online Seller Team* is a shop manager, a landing-page designer and a product copywriter. It's built for Pancake POS and Webcake.

## 6. Your building: many floors at once

A **building** is every floor you have open at the same time. Each floor is its own office window with its own agents. Use floors to split your business into teams, for example:

| Floor | Team |
|---|---|
| Floor 0 | Product research and economics (5 agents) |
| Floor 1 | Coding and infrastructure (15 agents) |
| Floor 2 | Marketing and social media research (5 agents) |
| Floor 3 | Product improvement (2 agents) |

**Open a new floor:** app menu → **New Floor**, or press **Cmd+Shift+N** (Mac) / **Ctrl+Shift+N** (Windows, Linux). You can have up to **200 floors** open at once. If you try to open more, the app says your building is full; close a floor you no longer need first.

**How floors work together:**
- **Ramon runs the whole building.** There is one Ramon, at the head desk of your first window. He sees every agent on every floor and can hand work to any of them.
- **Agents can reach agents on other floors.** Floors don't wall agents off. Any agent can message any other agent in the building, and Ramon can send a Floor 1 task to an agent on Floor 2. If a floor doesn't have the skill you need, ask Ramon to use the agent on the floor that does.
- **Before hiring someone new, Ramon checks who is already in the building.** He reuses an agent who fits instead of hiring a duplicate.
- **Closing a floor stops its agents.** The app asks first. Other floors keep running. The agents' history and memory are kept, but they don't answer messages until you hire them again.

**Tips:**
- Agents don't know which floor they're on. Put the team in the name, like `F2 Marketing - Liza`, so you and Ramon can tell who belongs where.
- Save each team as a floor file (**export floor…**) so you can set up the same building again in a few clicks.
- Every running agent uses your AI tool's account. A big building costs more; keep open only the floors you need, and set token budgets in **Settings → Autonomy & Budgets**.

**Not available yet:** a separate manager for each floor. Today every floor reports to Ramon.

## 7. Connections (connectors)

Connectors let agents work inside other apps. Set them up in **Settings → Connections**:

1. Paste your key and press **Save**. The key is stored encrypted on your computer and never shown again.
2. Switch the connector **On**.
3. **Start a new agent.** Agents already running keep the connectors they started with.

| Connector | Agents can |
|---|---|
| **Pancake POS** | read and change orders, products, stock and sales |
| **Webcake Landing** | design, edit and publish landing pages |
| GitHub, Database, Email & Calendar, Web Search | as described in Settings |

**Connectors can change real data.** Use keys with the least access you need.

Today, connectors only reach **Claude Code** agents.

## 8. Staying safe

- Agents run **with your permissions** on your computer. In **auto mode** they don't ask before running commands or editing files. Switch Settings → Autonomy & Budgets to **ask first** if you want them to ask before acting.
- Give each agent only the project folder it needs. Use **git isolation** (its own worktree) when you want to review changes before merging.
- **Review shared hires and floors before hiring them.** A shared file can't run commands of its own, and the app builds every command from your settings, but it can still give an agent a goal you didn't expect.

## 9. Privacy

- Your code, prompts, agent output and connector keys stay on your computer.
- Licensing only knows your email, your license status, and which computers are activated.
- Anonymous usage stats are optional: Settings → General → **Anonymous usage stats**.

Details: [Privacy Policy](https://labs.atmt.dev/privacy) · [Terms / License Agreement](https://labs.atmt.dev/terms) · [Telemetry](../TELEMETRY.md).

This guide is also online at **https://labs.atmt.dev/guide**.

## 10. Updates and What's New

Packaged builds check the public ATMT Labs release feed while auto-update is
enabled in **Settings → General**. When a newer version is ready, the update
badge tells you; you choose when to restart and install it. **What's New**
shows the release highlights, and **full changelog** opens the public Releases
page. The app does not need a GitHub sign-in or token for updates.

## 11. Troubleshooting

| You see | Do this |
|---|---|
| "Your plan's device limit is reached" | Remove an old computer at `auth.labs.atmt.dev/account`, then **try again**. |
| "That code has already been used" | Each unlock code works once. Ask the person who gave it to you for a new one. |
| "Your account already has a lifetime license, so the code was not used" | You're all set. The code still works, so pass it on. |
| "LICENSE CHECK NEEDED" | A trial computer needs to go online briefly. Lifetime computers never see this. |
| An agent exits right away | Open its terminal. The tool is usually not installed or not signed in, or it doesn't accept the model name. |
| Codex says "Set up Agent sandbox to continue" on Windows | Open the agent's terminal, choose **Set up**, and approve the Windows administrator prompt if your computer allows it. If setup is blocked by company policy, ask IT or use Codex's `unelevated` sandbox fallback (below). |
| A connector doesn't work | Check it's **On** with a key saved, start a **new** agent, and use a Claude Code agent. |
| "Your building is full" | You have 200 floors open. Close a floor you no longer need, then open a new one. |

For the Windows fallback, add the following to `%USERPROFILE%\.codex\config.toml`, then restart the Codex agent. ATMT Labs copies that setting into each agent's Codex configuration when it starts. The fallback keeps a sandbox but has weaker isolation than administrator-approved setup. Company policy may disallow it.

```toml
[windows]
sandbox = "unelevated"
```

Still stuck? Email **hello@automatika.ph** with your app version (Settings → General → Updates).
