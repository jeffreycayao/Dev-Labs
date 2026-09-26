---
layout: page.njk
title: About this blog
heading: "The blog behind the office floor."
eyebrow: About
description: "About the Munder Difflin blog — who writes it, what it covers, and how Munder Difflin turns the Claude Code terminals you already run into a self-coordinating hive of agents."
seoTitle: "About — Munder Difflin Blog"
permalink: /about/index.html
---

**Munder Difflin** is a local, open-source multi-agent harness for [Claude Code](https://www.claude.com/product/claude-code). It turns the Claude Code terminals you already run into a self-coordinating **hive** of autonomous agents — they message each other, route work, and remember across sessions, all coordinated by a **GOD orchestrator** you talk to in plain language. A Pixi.js **office floor** renders the whole thing as pixel-art avatars at their desks, with animated envelopes flying between them.

This blog is where we write it all down: how the hive is built, how to get the most out of agentic coding, and the occasional dispatch from the break room.

## What you'll find here

- **Guides** — practical, copy-pasteable walkthroughs for setting up and running an agent office.
- **Engineering** — deep-dives into the harness internals: messaging, memory (MemPalace), the GOD orchestrator, and the Pixi.js floor.
- **Agentic Coding** — patterns, workflows, and habits for building with a team of agents.
- **Product** — what we're shipping and why.

## The stack

Munder Difflin is built on **Electron · React · TypeScript · Pixi.js · xterm.js · node-pty**, and it's **local-first** and **MIT-licensed**. Your agents run on your machine, on your Claude plan.

> Run an office of agents while you sleep.

Ready to start? [Download Munder Difflin]({{ site.origin }}/#install) or [star it on GitHub]({{ site.social.github }}).
