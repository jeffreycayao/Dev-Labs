---
title: "What Is a Multi-Agent Harness? A Plain English Guide"
description: "A multi-agent harness runs several AI coding agents as one team, with roles, messages, shared memory and an orchestrator. What it is, how it differs from a framework, subagents or agent teams, and when you need one."
date: 2026-05-22
updated: 2026-09-10
category: concepts
categoryLabel: Concepts
type: Non-technical
primaryKeyword: "claude code multi-agent"
secondaryKeywords: ["multi-agent harness", "what is an agent harness", "multi-agent ai framework", "ai agent harness", "claude code agent teams vs harness"]
tags: ["Concepts", "Multi-Agent", "Claude Code"]
author:
  name: Chaitanya Giri
  initials: CG
faq:
  - q: "What is a multi-agent harness?"
    a: "Software that runs several AI agents at the same time and makes them work as one team. Each agent gets a role, agents pass messages to each other, they share long term memory, and a coordinator hands out the work."
  - q: "How is a harness different from a framework like LangGraph or CrewAI?"
    a: "A framework is a library you write a new agent application with. A harness wraps agents you already run, like Claude Code or Codex in a terminal, and adds the coordination around them. You do not rebuild anything."
  - q: "Is Claude Code's agent teams feature a multi-agent harness?"
    a: "It covers part of the idea inside Claude Code. Agent teams are experimental and off by default. A lead session spawns teammates that share a task list and message each other, and a team belongs to that one session. A harness keeps agents working across sessions, remembers between them, and can mix CLIs from different vendors."
  - q: "Do I need a multi-agent harness to use Claude Code?"
    a: "No. One session is plenty for most tasks. A harness starts paying for itself when you run three or more agents at once and keeping them coordinated costs you more time than the work does."
  - q: "Is Munder Difflin a multi-agent harness?"
    a: "Yes. It is a free, open source harness that runs twelve terminal coding CLIs, including Claude Code, Codex, Gemini CLI and Copilot, on your own machine, with your clone Michael coordinating them."
---

<div class="callout tldr"><span class="ic">TL;DR</span><p>A <strong>multi-agent harness</strong> runs
several AI coding agents at once and makes them behave like a team: each has a role, they message each
other, they share memory, and a coordinator routes the work. It is the layer that turns five terminal
windows into one office.</p></div>

If you have ever run two AI coding agents at the same time, you already know the problem. They edit the
same file, neither knows what the other did, and you become the message bus, copying context from one
window to the next. A **multi-agent harness** is the software that takes that job off your hands.

## What is a multi-agent harness?

It is software that runs several AI agents at the same time and coordinates them. That coordination comes
down to four things: roles, messaging, shared memory and routing. Everything else is detail about how a
particular harness does those four things.

The easiest picture is an office. The agents are the staff. The harness is the building: desks, mailboxes,
a filing cabinet everyone can read, and a manager who decides who does what.

{% img "note-1" %}

## What does a harness add on top of a single agent?

Five things a lone agent does not have. A single coding agent is a loop: read the context, act, check the
result, repeat. A harness wraps many of those loops and adds:

- **Roles.** A researcher, a builder and a reviewer, instead of five generalists stepping on each other.
- **Messaging.** Agents hand findings to each other directly, not through you.
- **Shared memory.** What one agent learned on Monday is still there for another agent on Thursday.
- **Orchestration.** One coordinator turns your request into tasks and assigns them. In Munder Difflin that
  coordinator is Michael, a clone of you that you talk to in plain language.
- **Visibility.** A way to see what the whole team is doing without tailing five terminals.

## What is the difference between a harness, a framework, subagents and agent teams?

What you bring, and how long the team lasts. These four get mixed up constantly, so here they are side by side.

### Framework

A library such as LangGraph, CrewAI or AutoGen that you **build an agent application with**. You write the
graph, the tools and the prompts. Powerful, and a build from scratch.

### Subagents

One agent **spawning short lived helpers** inside its own run. Great for fanning out a search or a review.
The helpers report back to their parent and are gone when the job ends.

### Agent teams inside Claude Code

Claude Code's own [agent teams](https://code.claude.com/docs/en/agent-teams) sit in between, and they are
still experimental and off by default. A lead session spawns teammates that share a task list and message
each other directly. A team belongs to a single session, and every teammate is a Claude Code instance.

### Harness

Software that **wraps the agents you already run** and keeps them working together over time. You keep
using Claude Code, Codex or Gemini CLI. The harness adds messaging, memory that survives a restart, an
orchestrator, and a view of the floor. Because it sits outside any single CLI, it can put agents from
different vendors on the same team.

{% img "note-2" %}

## When do you actually need one?

When coordinating your agents costs more time than the agents save you. The usual signs:

- you run **three or more** sessions and lose track of which one is doing what,
- you keep **explaining the same context** because every session starts from zero,
- two agents **collide** on the same files,
- you want work to **keep moving** while you are in a meeting, with the machine left on.

If none of that sounds familiar, one session is fine, and you can stop reading here with a clear conscience.

## What does a harness look like in practice?

Here is how [Munder Difflin](https://munderdiffl.in/) does it. Every agent is a real terminal CLI running
on your machine, and twelve are supported: Claude Code, Codex, Gemini CLI, Antigravity, Grok, Kimi Code,
Qwen, OpenCode, Crush, Pi, Copilot and Cursor. Each agent gets a desk on a 2D office floor, a mailbox and
long term memory. Michael, your clone, takes your request, breaks it into tasks, hires workers and routes
messages between them. When something needs a human decision, it lands on the ASK ME board instead of
vanishing into a scrollback.

The floor is a simulation and uses no tokens. The real work happens in the terminals underneath, on the
subscriptions you already pay for and within their normal usage limits.

## Where to go next

- [How to manage multiple Claude Code sessions](/blog/manage-multiple-claude-code-sessions/) without losing
  track of them.
- [How to give Claude Code long term memory](/blog/give-claude-code-long-term-memory/) so the team stops
  forgetting.
- [The best tools to run multiple Claude Code agents](/blog/best-claude-code-multi-agent-tools/), compared.

---

Munder Difflin is free and open source under the MIT license. [Download it](https://munderdiffl.in/) for
macOS, Windows or Linux and watch a coordinated team work an office floor.
