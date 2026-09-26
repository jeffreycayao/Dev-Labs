---
title: "How to Use Claude Code Plan Mode"
description: "How Claude Code's plan mode works: turning it on, what it blocks, what a real headless plan mode run prints, and how to leave it."
date: 2026-09-11
category: guides
categoryLabel: Guides
type: Technical
primaryKeyword: "how to use claude code plan mode"
secondaryKeywords: ["how to use claude code plan mode effectively", "how to enable claude code plan mode", "how to exit claude code plan mode", "claude code plan mode shortcut", "claude code plan mode vs accept edits", "should i use claude code plan mode"]
tags: ["Guides", "Claude Code", "Getting Started", "Human-in-the-Loop"]
faq:
  - q: "What is Claude Code plan mode?"
    a: "It is one of Claude Code's permission modes. Claude reads files and runs shell commands to explore, then writes a plan, but does not edit your source. The official docs put it plainly: plan mode tells Claude to research and propose changes without making them, and edits stay blocked until you approve the plan."
  - q: "How do you enable plan mode in Claude Code?"
    a: "Press Shift+Tab during a session to cycle to it, prefix a single prompt with /plan, or start the session already in it with claude --permission-mode plan. The same flag works with -p for headless runs, so scripts and CI steps can start in plan mode too."
  - q: "How do you exit plan mode?"
    a: "Press Shift+Tab again to leave without approving anything, or approve the plan, which exits plan mode for you. The prompt offers Yes, and use auto mode (Yes, auto-accept edits when auto mode is unavailable), Yes, manually approve edits, or No, keep planning, which keeps you in plan mode so you can redirect Claude."
  - q: "Can plan mode edit files?"
    a: "No. Plan mode blocks edits to your source until you approve the plan, even when you ask for the edit directly, and in our headless run Claude declined exactly that request. It does write the plan itself, by default under ~/.claude/plans/ (the plansDirectory setting can move it). The exception is a session started with bypass permissions available, for example with --dangerously-skip-permissions or --allow-dangerously-skip-permissions: Claude is still told to plan, but an edit it attempts then runs without prompting."
  - q: "What is the difference between plan mode and accept edits mode?"
    a: "Accept edits mode auto-approves file writes and common filesystem commands like mkdir and mv, so you review changes afterward. Plan mode is the phase before that: read and explore only, meant to run first so you can approve or redirect the plan before anything gets written."
  - q: "Should you use plan mode for every task?"
    a: "No. Claude Code's own best practices docs, checked 11 Sep 2026, say planning matters most when you're uncertain about the approach, the change touches multiple files, or you don't know the code well, and that you can skip it when you could describe the diff in one sentence. For a small, obvious fix, just ask Claude to make it directly."
---

<div class="callout tldr"><span class="ic">TL;DR</span><p>Turn on <strong>plan mode</strong> with <code>claude --permission-mode plan</code>, the <code>/plan</code> prefix, or <code>Shift+Tab</code> until the status bar shows plan mode on. Claude reads your codebase and shell output but cannot edit your source, and writes a plan you read before approving it. Approving switches the session to auto mode (accept edits when auto mode is unavailable) or to approving each edit yourself; <code>Shift+Tab</code> again leaves without approving anything. The same flag works with <code>-p</code>, though a headless run has no approval prompt: it just writes the plan and exits.</p></div>

Plan mode is a Claude Code permission mode that makes Claude read your codebase and write a plan before it touches a single file. Turn it on with `claude --permission-mode plan`, the `/plan` prefix, or by pressing Shift+Tab until the status bar shows plan mode on. Nothing gets edited until you approve what it wrote.

The rest of this covers how the mode actually behaves, which commands run without asking while it plans, and what a headless run with `--permission-mode plan` really prints, since most writeups describe the behavior without pasting any output. Running several Claude Code sessions at once makes this matter more: a plan per session is one document to read before anything changes, not several diffs to untangle after ([manage multiple Claude Code sessions](/blog/manage-multiple-claude-code-sessions/)).

## How do you turn on plan mode in Claude Code?

Three ways, and they all land in the same mode. Press Shift+Tab during a session to cycle to it (the cycle runs `default`, `acceptEdits`, `plan`, then `bypassPermissions` and `auto` if they're available, then back to `default`; Pro, Max and Team sessions start in `auto`, so plan mode is three presses away), prefix a single prompt with `/plan`, or start the session already in it with `claude --permission-mode plan` (checked 11 Sep 2026, [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)). The same flag works with `-p` for non-interactive runs.

## What does plan mode actually let Claude do?

Reads, mostly, and not much else. The docs describe it as telling "Claude to research and propose changes without making them. Claude reads files, runs shell commands to explore, and writes a plan, but does not edit your source" (checked 11 Sep 2026, [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)). When auto mode is available and the `useAutoModeDuringPlan` setting is on, which it is by default, a classifier reviews the shell commands Claude wants to run while it plans, instead of prompting you for each one; when auto mode isn't available, anything past the built-in read-only command set still prompts as usual.

{% img "note-1" %}

## What does a plan mode run actually print?

We made a two-function `hello.py` in a scratch folder on 11 Sep 2026 and ran Claude Code with `-p --permission-mode plan`, first asking for a suggestion, then asking directly for an edit to see whether plan mode holds:

```
$ claude --version
2.1.268 (Claude Code)

$ claude -p --permission-mode plan "Add a multiply function to hello.py right now, actually edit the file."
I haven't edited `hello.py` yet. Plan mode is on, and it blocks every file change except the plan file, even when you ask me to edit right away. I also can't switch plan mode off from here: the tool for that isn't available in this session.
...
The plan is saved at `~/.claude/plans/add-a-multiply-function-buzzing-dolphin.md`. It includes a one-line `python3` check that `multiply(3, 4) == 12`, and that `add` and `subtract` still work.

Turn plan mode off (Shift+Tab in the CLI, or restart without plan mode) and tell me to go ahead, and I'll make the edit and run the check.
```

Told to actually edit the file, it wrote a memo about the edit instead. Fitting, for a paper company's blog.

The first prompt, "Read `hello.py` and suggest one small refactor. Do not edit any files.", told Claude not to edit, so it proves less: it printed type-hinted versions of both functions, wrote its plan to `~/.claude/plans/`, and left `hello.py` untouched. The second run above is the real test: asked directly to edit, it still didn't: it read `hello.py`, wrote the plan and never attempted an edit, with no approval prompt to accept.

## How do you get out of plan mode?

Two ways: reject everything with another Shift+Tab, or approve the plan, which exits plan mode for you. When the plan is ready, the CLI asks how to proceed: Yes, and use auto mode (it reads Yes, auto-accept edits when auto mode is unavailable), Yes, manually approve edits, or No, keep planning, which keeps you in plan mode so you can redirect Claude (checked 11 Sep 2026, [Choose a permission mode](https://code.claude.com/docs/en/permission-modes)). Press Ctrl+G first if you'd rather open the plan in your own text editor and change it before Claude proceeds.

{% img "note-2" %}

## Does plan mode work the same in scripts, not just the terminal?

Partly. Plan mode applies in a `-p` run, but there's no approval step: Claude writes the plan, prints its summary, and exits, as the run above shows. Claude Code's own headless docs are direct about the default: "the built-in starting permission mode is Manual on every plan, so pass the permission mode you want" (checked 11 Sep 2026, [Run Claude Code programmatically](https://code.claude.com/docs/en/headless)), unless a project's `permissions.defaultMode` setting already sets `plan`. Passing `--permission-mode plan` in a CI step gets you a proposed change with no edits. Set `plansDirectory` to a path inside the project (the default is `~/.claude/plans`) so a later step can upload the plan for review, the same gate as [approving AI agents without a queue](/blog/human-in-the-loop-approving-ai-agents/).

## Plan mode vs accept edits mode: which do you actually want?

Different phases of the same job, not competitors. `acceptEdits` mode auto-approves file writes and common filesystem commands like `mkdir` and `mv`, so you review changes afterward in `git diff`; plan mode blocks the edits and hands you a document to read first. Claude Code's best practices page says planning is most useful "when you're uncertain about the approach, when the change modifies multiple files, or when you're unfamiliar with the code being modified" (checked 11 Sep 2026, [Best practices](https://code.claude.com/docs/en/best-practices)). If you only want to gate one risky command rather than a whole session, [Claude Code's hooks](/blog/claude-code-hooks-explained/) can block a single tool call.

None of this needs Munder Difflin. Each Claude Code agent on the floor is a real `claude` process, but as of Munder Difflin 0.5.2, Auto Mode is on by default and starts it with `--permission-mode bypassPermissions`, and in a session like that Claude Code does not enforce plan mode's blocks (checked 11 Sep 2026, [Choose a permission mode](https://code.claude.com/docs/en/permission-modes#skip-all-checks-with-bypasspermissions-mode)). Turn Auto Mode off and restart the agent if you want plan mode to hold for your Claude Code agents. [Download Munder Difflin](https://munderdiffl.in/download) to try it, the classic office is free, and [pricing](https://munderdiffl.in/#pricing) covers the paid plans.
