---
title: "How to Add an MCP Server to Claude Code"
description: "The claude mcp add command, its scope flag, editing .mcp.json by hand, and how Munder Difflin's Capabilities screen grants an MCP server to one agent at a time."
date: 2026-09-10
category: guides
categoryLabel: Guides
type: Technical
primaryKeyword: "how to add an mcp server to claude code"
secondaryKeywords: ["claude code mcp add", "claude code mcp json", "how to install mcp server claude code", "add mcp server to claude code globally", "claude code mcp add scope"]
tags: ["Guides", "MCP", "Claude Code", "Getting Started"]
faq:
  - q: "What is an MCP server?"
    a: "A program that gives an agent tools or data it does not have built in, such as a database, an issue tracker or a browser, and exposes them over the Model Context Protocol. Claude Code is one of many MCP clients, so once a server is added, its tools sit alongside Claude Code's built in ones."
  - q: "How do I add an MCP server to Claude Code from the command line?"
    a: "Run claude mcp add with a name you choose, then the command that starts the server after the separator Claude Code expects, or, for a hosted server, add a URL with the transport flag set to http. Run claude mcp list afterward to confirm it connected."
  - q: "What is the difference between local, project and user scope?"
    a: "Local scope, the default, is private to you and only active in the project where you added the server. Project scope writes the entry to a .mcp.json file you commit, so teammates who clone the project get the same server. User scope registers the server once for every project you open, still private to you."
  - q: "How do I add an MCP server that needs an API key?"
    a: "Pass it with the -e flag when you add the server, for example -e API_KEY=xxx. A server that signs in through a browser instead, such as ones that use OAuth, is added with just its URL and authenticated afterward from inside a session with the /mcp command."
  - q: "Does Munder Difflin let me control which agent gets which MCP server?"
    a: "Yes. Since Munder Difflin 0.4.7, the Capabilities screen in the Pro workspace can turn a server on for one agent and off for another, and servers that can write or hold secrets still need an explicit yes. Each Claude Code agent still picks up the servers you added at user or project scope, the same as any other claude session."
---

<div class="callout tldr"><span class="ic">TL;DR</span><p>Run <code>claude mcp add</code> with a name and the command that starts the server for a local tool, or add the transport flag set to <code>http</code> and a URL for a hosted one. The default scope is local to your project; add the scope flag set to <code>user</code> to use a server everywhere, or to <code>project</code> to share it with teammates through <code>.mcp.json</code>. Confirm the connection with <code>claude mcp list</code>, and edit <code>.mcp.json</code> directly if you would rather write the JSON yourself.</p></div>

You add an MCP server to Claude Code with one command: `claude mcp add`, a name you pick, and the command or URL that starts the server. Claude Code writes that entry to a config file, then loads the server's tools the next time it reads it.

That one command handles the common case. What's worth understanding is the scope flag, which decides who else sees the server, and the other ways to add one: editing `.mcp.json` yourself, or connecting from VS Code or the desktop app instead of the CLI. If you're already running more than one Claude Code session, each reads the same project scoped servers, which is one less thing to juggle when you [manage multiple Claude Code sessions](/blog/manage-multiple-claude-code-sessions/).

## What is an MCP server?

An MCP server is a program that gives an agent tools or data it doesn't have built in: a way to search issues, query a database, or drive a browser. The Model Context Protocol is the open standard those servers speak, described on its own site as "a standardized way to connect AI applications to external systems" (checked 10 Sep 2026, [modelcontextprotocol.io](https://modelcontextprotocol.io)). Anthropic open sourced MCP on 25 November 2024, with initial SDKs and a handful of reference servers (checked 10 Sep 2026, [Introducing the Model Context Protocol](https://www.anthropic.com/news/model-context-protocol)). Claude Code is one client among several now; any compliant server works with it. For the longer answer, with the host, client and server roles and how discovery works, see [What Is an MCP Server?](/blog/what-is-an-mcp-server/).

## How do you add an MCP server to Claude Code?

Run `claude mcp add`, pick a name, and tell it what starts the server: a local command, or a URL with the transport flag set to `http` for a hosted one. Here's what that looked like in a scratch folder, checked on 10 Sep 2026:

```bash
$ claude --version
2.1.267 (Claude Code)

$ mkdir -p mcp-demo && cd mcp-demo
$ claude mcp add --scope project demo-docs -- npx -y @modelcontextprotocol/server-everything
Added stdio MCP server demo-docs with command: npx -y @modelcontextprotocol/server-everything to project config
File modified: <your folder>/mcp-demo/.mcp.json

$ cat .mcp.json
{
  "mcpServers": {
    "demo-docs": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-everything"],
      "env": {}
    }
  }
}
```

`claude mcp add` wrote that block the moment the command ran; nothing else to save or restart beyond starting a fresh session in the folder. For a hosted server you swap the local command for the transport flag set to `http` and a URL, the same shape Anthropic's own quickstart uses for its docs server (checked 10 Sep 2026, [Connect to MCP servers](https://code.claude.com/docs/en/mcp-quickstart)).

{% img "note-1" %}

## What's the difference between local, project and user scope?

Local scope is the default: private to you, active only in the project where you ran the command. Project scope writes to the `.mcp.json` file you just saw above, which you commit so teammates get the same server; user scope registers a server once for every project you open, still private to you. Michael Scott would put everything in project scope and commit his API key for the whole office to read.

Pick project scope for anything the team needs in the repo, like a shared database or issue tracker server. Pick user scope for tools you personally want everywhere, like a search server you reach for across projects. Leave local scope for anything you're just trying out. The demo above used project scope on purpose, so you could see the `.mcp.json` file it writes.

## How do you add a server that needs an API key?

Pass it with the `-e` flag when you add the server, for example `-e API_KEY=xxx` after the server's name and command. A server that authenticates through a browser instead, like the hosted examples in Anthropic's own docs, is added with just its URL, then signed in afterward from inside a session with the `/mcp` command.

{% img "note-2" %}

## Can you edit .mcp.json directly instead of using the CLI?

Yes. Every scope writes the same JSON shape, so you can hand write an entry instead of running the command, which helps when a server needs several environment variables you'd rather template in one file:

```json
{
  "mcpServers": {
    "my-server": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "<the server's npm package>"],
      "env": {
        "API_KEY": "your key here"
      }
    }
  }
}
```

Claude Code reads `.mcp.json` at the start of a session, not while one is running. And a project scoped server needs a yes the first time Claude Code sees it: when we ran `claude mcp list` against the demo folder above, it showed `demo-docs` as pending approval rather than connected, which is the point. Approve a server because you've read what it does, not on reflex; a server's own tool descriptions are text Claude reads, and a rogue change to them is exactly the kind of attack [this blog has covered before](/blog/mcp-security-tool-poisoning/).

## Do MCP servers work the same way in VS Code or the desktop app?

Mostly, with a different entry point. VS Code and the Claude Code desktop app each have their own place to add a server instead of a terminal command, and Claude Code on the web just reads whatever `.mcp.json` is already checked into the repository. The CLI steps above are for a terminal session. The desktop app and the CLI read the same `~/.claude.json` and `.mcp.json` files, although a server in the desktop app's own `claude_desktop_config.json` wins when the names collide (checked 10 Sep 2026, [Claude Code desktop docs](https://code.claude.com/docs/en/desktop)).

## Can Munder Difflin grant an MCP server to just one agent?

Yes. Since Munder Difflin 0.4.7, the Capabilities screen in the Pro workspace can turn a server on for one agent and
off for another on the same floor, and servers that can write or hold secrets still need an explicit yes.

That sits on top of Claude Code's own setup, not instead of it. Each Claude Code agent in the office is a real
`claude` session, so it still picks up the servers you added at user or project scope, as
[an earlier post on MCP in a hive](/blog/mcp-and-skills-in-a-hive/) explains. Capabilities is the extra dial for
keeping a server away from one agent that could otherwise reach it.

None of this needs Munder Difflin: `claude mcp add` is Claude Code's own command and works the same in a bare
terminal. A harness earns its place once several agents are running and only one of them should hold a given key.
[Download Munder Difflin](https://munderdiffl.in/download); the classic office is free, and Capabilities comes with
[Pro](https://munderdiffl.in/#pricing).
