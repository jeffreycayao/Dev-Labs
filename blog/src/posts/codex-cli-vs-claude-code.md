---
title: "Codex CLI vs Claude Code"
description: "Codex CLI and Claude Code compared firsthand: sandbox and approval flags, AGENTS.md vs CLAUDE.md, real pricing, and where each terminal agent wins."
date: 2026-09-10
category: comparisons
categoryLabel: Comparisons
type: Technical
primaryKeyword: "codex cli vs claude code"
secondaryKeywords: ["claude code vs codex cli", "codex cli vs claude code comparison", "codex cli approval mode", "codex cli permission mode", "does codex cli use agents md", "codex cli vs claude code reddit"]
tags: ["Comparisons", "Claude Code", "Codex", "Multi-Agent", "Engines"]
faq:
  - q: "Is Codex CLI free to use?"
    a: "There is a real free tier, but it is capped. OpenAI's own Codex pricing page lists a Free plan at $0 a month for quick coding tasks, a Go plan at $8, and a Plus plan at $20 that adds cloud-based runs and the GPT-5.6 model family, checked 10 Sep 2026. Claude Code has no equivalent free tier: it authenticates against a paid Claude subscription or an Anthropic API key."
  - q: "Does Codex CLI read AGENTS.md the way Claude Code reads CLAUDE.md?"
    a: "Yes, but they are separate files, and each CLI's docs describe only its own. Codex CLI's docs list /init as the command that creates an AGENTS.md with instructions for Codex, checked 10 Sep 2026. Claude Code instead reads a project's CLAUDE.md at the start of every session, per Anthropic's own docs checked the same day, and neither doc promises to read the other's file."
  - q: "What is the real difference between Codex CLI's sandbox and Claude Code's permission mode?"
    a: "Codex CLI splits the decision in two: --sandbox (read-only, workspace-write, or danger-full-access) decides what it can touch, and --ask-for-approval (on-request or never) decides when it has to stop and ask, confirmed against codex --help on 10 Sep 2026. Claude Code folds both into one --permission-mode flag with six named modes, confirmed against claude --help the same day. Neither approach is wrong, Codex's is more composable and Claude Code's is a single dial to reason about."
  - q: "Can I run Codex CLI and Claude Code together?"
    a: "Yes. Munder Difflin wraps both as real terminal processes and runs Codex and Claude Code agents side by side on the same office floor, so each can take its own task at the same time. Munder Difflin 0.5.0 (2026-09-08) added GPT-6 Astra to Codex's model picker, and that slug needs Codex 0.153.1 or newer to be accepted when the agent spawns."
  - q: "Codex CLI vs Claude Code, which one is actually better?"
    a: "Neither wins outright. Codex CLI is the better pick when you want an open source binary you can audit, a free way in, and separate dials for sandboxing and approval. Claude Code is the better pick when you already pay for Claude and want a single permission mode, CLAUDE.md, and hooks that run around every tool call."
---

Pick Codex CLI if you want an open source agent with a free plan and separate dials for sandboxing and approval. Pick Claude Code if you already pay for Claude and want one permission mode, `CLAUDE.md` and hooks around every tool call. Both run real commands in your repo; the difference is how each hands you control.

Both are real terminal agents from frontier labs, and the differences that matter show up in how each one is built and how it hands you control, not in vague claims about which model is smarter. It's the same lifecycle question we asked when comparing [GitHub Copilot CLI against Claude Code as hive workers](/blog/github-copilot-cli-vs-claude-code-for-hive-work/): which engine stays resident, and which one behaves the same way the second time you hand it control. If you're weighing whole categories of [multi-agent tooling built around Claude Code](/blog/best-claude-code-multi-agent-tools/) rather than just these two engines, start there instead. This post stays narrow: Codex CLI against Claude Code, checked on 10 Sep 2026.

## What's the real difference between Codex CLI and Claude Code?

Codex CLI is an open-source, Rust-based binary from OpenAI that wraps each shell command in an OS-level sandbox and asks for approval on a separate policy. Claude Code is Anthropic's CLI, and it folds sandboxing and approval into a single permission-mode setting instead of two.

We checked this ourselves on 10 Sep 2026, with both CLIs already installed (`command -v claude` and `command -v codex` both resolved). `codex --help` lists `-s, --sandbox <SANDBOX_MODE>` with three possible values (`read-only`, `workspace-write`, `danger-full-access`), and a separate `-a, --ask-for-approval <APPROVAL_POLICY>` (`on-request` or `never`). `claude --help` lists one `--permission-mode <mode>` flag instead, with six named modes: `acceptEdits`, `auto`, `bypassPermissions`, `manual`, `dontAsk`, `plan`. Same underlying job, two different shapes: Codex separates "what it's allowed to touch" from "when it must ask," Claude Code bundles both into one choice.

OpenAI's own docs describe `workspace-write` as the mode where Codex "can read files, make edits, and run commands in the workspace," and `on-request`, the policy the CLI runs by default, as the one where Codex "requires approval to edit outside the workspace or to access network" and otherwise carries on ([developers.openai.com/codex/agent-approvals-security](https://developers.openai.com/codex/agent-approvals-security), checked 10 Sep 2026). Both projects also named their full escape hatch the same way: Codex's is `--dangerously-bypass-approvals-and-sandbox`, Claude Code's is `--dangerously-skip-permissions`. Somebody in both API design rooms clearly wanted you to feel that flag before you typed it, which is about as close as a CLI flag gets to a performance review.

## Does Codex CLI read `AGENTS.md` the way Claude Code reads `CLAUDE.md`?

Yes, but the two files are separate, and each CLI's docs describe only its own. Codex CLI's docs list `/init` as the command to "create an `AGENTS.md` file with instructions for Codex" ([developers.openai.com/codex/cli](https://developers.openai.com/codex/cli/), checked 10 Sep 2026). Claude Code instead reads a project's `CLAUDE.md` at the start of every session, described by Anthropic as "a markdown file you add to your project root that Claude Code reads at the start of every session" ([code.claude.com/docs/en/overview](https://code.claude.com/docs/en/overview), checked 10 Sep 2026).

The two overlap heavily in practice: coding standards, architecture notes, a review checklist. What differs is delivery. Neither CLI's docs promise to read the other's file, so a repo that runs both engines usually keeps both `AGENTS.md` and `CLAUDE.md`, or keeps one and symlinks the other to it.

{% img "note-1" %}

## Is Codex CLI free to use?

There's a real free tier, but it's capped. OpenAI's Codex pricing page lists a Free plan at $0 a month for exploring Codex "on quick coding tasks," a Go plan at $8 a month, and a Plus plan at $20 a month that adds cloud-based runs and the GPT-5.6 model family ([developers.openai.com/codex/pricing](https://developers.openai.com/codex/pricing), checked 10 Sep 2026). Claude Code has no equivalent free tier of its own: it authenticates against a paid Claude subscription or an Anthropic API key from the first session. If you already pay for ChatGPT Pro, see [how to make the most of your Codex Max plan](/blog/codex-max-plan-tips/).

## Where does Codex CLI actually win?

Two places: openness and cost of entry. The CLI itself is Apache-2.0 licensed and public on GitHub, so you can read exactly what the sandbox and approval code does instead of trusting a closed binary ([github.com/openai/codex](https://github.com/openai/codex), checked 10 Sep 2026), and the free plan above gets a curious developer to a real sandboxed agent at no cost. If you want a run that never pauses to ask, `--ask-for-approval never` is also a cleaner single flag than composing Claude Code's mode and its skip flag together. None of that makes Codex CLI the better tool in general. It makes it the better tool when auditability and a no-cost start matter most.

{% img "note-2" %}

## Where does Claude Code actually win?

Two places: one engine across the tools you already use, and hooks. The terminal, VS Code, JetBrains, the desktop
app and the web all run the same Claude Code engine, so a repo's `CLAUDE.md`, settings and MCP servers behave the same
wherever you open it ([code.claude.com/docs/en/overview](https://code.claude.com/docs/en/overview), checked 10 Sep
2026). Hooks run shell commands before or after Claude Code's own actions, like formatting after every file edit or
running lint before a commit, so a rule you write once holds for every session instead of living in a README nobody
rereads. If you already pay for Claude, that is a lot of control for no extra setup.

Weighing Google's agent as well? Read [Claude Code vs Antigravity](/blog/claude-code-vs-antigravity/).

## Can you run Codex CLI and Claude Code together?

Yes, and running both inside one harness is often more useful than picking a single winner. Munder Difflin wraps CLIs like `claude` and `codex` as real processes in their own terminals and runs them side by side on the same office floor, so a Codex agent and a Claude Code agent can each work on their own task at the same time. Munder Difflin 0.5.0 (2026-09-08) added GPT-6 Astra to Codex's model picker, and that slug needs Codex 0.153.1 or newer to be accepted when the agent spawns; the Codex CLI checked for this piece, `codex-cli 0.153.4`, clears that bar.

For the wider field beyond these two, the [2026 field guide to AI coding agents](/blog/best-ai-coding-agents/) covers where in-editor and autonomous agents fit next to CLI ones. For this specific pair, the honest answer holds: reach for Claude Code when you already pay for Claude and want hooks and one permission mode, reach for Codex CLI when you want separate sandbox and approval dials and a free way to start, and don't feel obligated to pick just one.
