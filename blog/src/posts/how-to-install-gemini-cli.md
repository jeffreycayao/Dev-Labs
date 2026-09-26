---
title: "How to Install Gemini CLI, and Who Can Still Use It in 2026"
description: "Install Google's Gemini CLI with npm on Mac, Windows or Linux, why Homebrew is stuck on 0.46.0, and which sign in still works after 18 Jun 2026."
date: 2026-09-15
category: guides
categoryLabel: Guides
type: Technical
primaryKeyword: "how to install gemini cli"
secondaryKeywords: ["gemini cli install", "how to install gemini cli on windows", "how to install gemini cli on mac", "gemini cli install npm", "how to update gemini cli", "does gemini cli still work"]
tags: ["Guides", "Getting Started", "CLI Agents", "Engines", "Open Source"]
faq:
  - q: "Does Gemini CLI still work in 2026?"
    a: "Yes, for some accounts. Google's announcement of 19 May 2026 said Gemini CLI would stop serving free, Google AI Pro and Ultra users on 18 Jun 2026, while paid API keys and Gemini Code Assist Standard or Enterprise licences keep working. The project is still shipping: stable release 0.59.0 came out on 8 Sep 2026."
  - q: "Is Gemini CLI free?"
    a: "The software is open source under Apache 2.0, but free use of Google's models through it largely ended on 18 Jun 2026. Google's quota page still lists an unpaid API key tier of 250 requests a day on Flash models, yet the transition announcement only promises paid keys. If your work depends on it, plan on a paid key or a work licence."
  - q: "What Node version does Gemini CLI need?"
    a: "Node 20 or newer. Google's installation page lists Node 20.0.0 as the runtime, and the npm package's engines field read >=20 when we checked on 14 Sep 2026. The Homebrew formula and the MacPorts port both pull in Node for you."
  - q: "What is the difference between Gemini CLI and Antigravity CLI?"
    a: "Gemini CLI is the open source agent you install from npm as @google/gemini-cli and start with gemini. Antigravity CLI is the newer Google tool, started with agy, that Google moved unpaid and Google One users to on 18 Jun 2026. Homebrew now points gemini-cli users at an antigravity-cli cask, but the two are separate products."
  - q: "Can I run Gemini CLI without installing it?"
    a: "Yes. Google's installation page gives npx @google/gemini-cli, which runs the package from npm's cache without a global install. You still need Node 20 and a sign in Google still serves. Google's uninstall doc says to clear the _npx folder inside your npm cache when you're done, which also removes anything else you ran with npx."
---

To install Gemini CLI, get Node 20 or newer, run `npm install -g @google/gemini-cli`, then type `gemini` in a project folder and sign in. MacPorts and `npx` work too. One catch: since 18 Jun 2026, Google no longer serves free, AI Pro or Ultra accounts in Gemini CLI, so you need a paid API key, Vertex AI or a work licence.

This is Google's open source terminal agent, published on npm as `@google/gemini-cli` under Apache 2.0. It is not Antigravity CLI (`agy`), the tool Google moved individual users to, and it is not the Gemini app. The npm registry listed 0.59.0 as the latest stable release on 14 Sep 2026.

You can install it and keep it current by hand, or use [Munder Difflin](https://harnessmd.com/download), a free and open source desktop app that runs Gemini CLI agents next to Claude Code, Codex and other CLIs in one office. As of 0.5.2, Gemini CLI is a built-in engine. Start a Gemini agent on a machine without `gemini` and the app runs `npm install -g @google/gemini-cli` in that agent's terminal, tries to install Node first if npm is missing or its Node is older than 20, then relaunches the agent. The app's hook bridge goes into a per agent settings file, so your own `~/.gemini/settings.json` is left alone. It can't restore access Google has stopped serving, though. The [Munder Difflin install guide](/blog/how-to-install-and-use-munder-difflin/) walks through setup.

## Who can still use Gemini CLI after June 2026?

Organisations on a Gemini Code Assist Standard or Enterprise licence can, and so can anyone paying for API access. Paid Vertex AI still works too, since Google now calls it [Gemini Enterprise Agent Platform](https://cloud.google.com/products/gemini-enterprise-agent-platform). [Google's announcement of 19 May 2026](https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/) said that on 18 Jun 2026 Gemini CLI would "stop serving requests for Google AI Pro and Ultra, as well as those using it free of charge" (Code Assist for individuals), and that it "will remain accessible via paid Gemini and Gemini Enterprise Agent Platform API keys". Every page of the Gemini CLI docs now carries a banner saying that for unpaid tier and Google One users, Gemini CLI "was replaced by Antigravity CLI" on that date.

The [quota page](https://geminicli.com/docs/resources/quota-and-pricing/), last updated 18 Jun 2026, still shows 1,000 free requests a day for a personal Google sign in, which is history now. It also lists an unpaid API key tier of 250 requests a day on Flash, but the announcement only names paid keys, so don't build a workflow on the free one. If you are an individual on AI Pro or Ultra, Google's route is Antigravity, and [Claude Code vs Antigravity](/blog/claude-code-vs-antigravity/) covers what that tool does.

## How do I install Gemini CLI with npm?

Check that Node is version 20 or newer, then install the package globally:

```bash
node --version
npm install -g @google/gemini-cli
gemini --version
```

Node 20 is the floor on [Google's installation page](https://geminicli.com/docs/get-started/installation/) and in the package's own `engines` field, which we read from the registry on 14 Sep 2026:

```text
$ npm view @google/gemini-cli version engines.node
version = '0.59.0'
engines.node = '>=20'
```

The same page lists MacPorts (`sudo port install gemini-cli`), a conda environment for locked down machines, a Docker sandbox image, and `npx @google/gemini-cli` if you want to try it without installing anything. Stable releases land weekly on the `latest` tag. `@preview` also ships weekly and `@nightly` daily, for people who enjoy surprises.

{% img "note-1" %}

## Why is brew install gemini-cli stuck on an old version?

Homebrew deprecated its `gemini-cli` formula on 18 Jun 2026 as not supported upstream, and it is still at 0.46.0. Google's installation page still lists `brew install gemini-cli`, but that page was last updated on 14 May 2026. Here is the Mac this post was written on, checked on 14 Sep 2026:

```text
$ which -a gemini
/opt/homebrew/bin/gemini
$ gemini --version
0.46.0
$ brew info gemini-cli
==> gemini-cli: stable 0.46.0 (bottled)
Interact with Google Gemini AI models from the command-line
https://geminicli.com
Deprecated because it is not supported upstream! It will be disabled on 2026-12-18.
Replacement:
  brew install --cask antigravity-cli
```

That leaves this machine thirteen minor versions behind npm. The suggested replacement is a different product, not a newer Gemini CLI. To stay on Gemini CLI, run `brew uninstall gemini-cli` and use the npm command above. MacPorts had 0.59.0 on the same day.

## How do I install Gemini CLI on Windows?

Use npm in PowerShell. Homebrew and MacPorts don't apply on Windows, though conda and `npx` from the same install page work there too. Google's recommended specs name Windows 11 24H2 or newer, Node 20 and PowerShell as a supported shell. Windows 10 isn't on that list. Install Node, open a fresh PowerShell window, and run the same `npm install -g @google/gemini-cli`.

To pass an API key for the current session, the authentication doc gives `$env:GEMINI_API_KEY="YOUR_GEMINI_API_KEY"`. To keep it, put the variable in `%USERPROFILE%\.gemini\.env`, which Gemini CLI loads automatically when no closer `.env` file exists.

## How do I sign in to Gemini CLI?

Run `gemini` in a project folder and choose Sign in with Google, Use Gemini API key, or Vertex AI. [Google's authentication doc](https://geminicli.com/docs/get-started/authentication/), last updated 17 Aug 2026, says the Google option opens a browser and caches your credentials locally. After the June change, that route is for organisation accounts, such as a company or Workspace account with a Code Assist Standard or Enterprise licence, and those also need a Google Cloud project set.

{% img "note-2" %}

For a key from Google AI Studio, set it and start the CLI, then pick the API key option:

```bash
export GEMINI_API_KEY="YOUR_GEMINI_API_KEY"
gemini
```

Vertex AI needs `GOOGLE_CLOUD_PROJECT` and `GOOGLE_CLOUD_LOCATION` set, plus one of `gcloud auth application-default login`, a service account JSON key, or a Google Cloud API key. Headless runs with `-p` reuse cached credentials when they exist; otherwise they need the API key or Vertex AI variables.

## How do I update or uninstall Gemini CLI?

Reinstall with the `latest` tag to update, and use npm's uninstall command to remove it:

```bash
npm install -g @google/gemini-cli@latest
npm uninstall -g @google/gemini-cli
```

The [configuration reference](https://geminicli.com/docs/reference/configuration/) also lists `general.enableAutoUpdate`, described as "Enable automatic updates" and on by default, but compare `gemini --version` with npm now and then anyway, as the Homebrew copy above shows. Google's uninstall doc gives `brew uninstall gemini-cli` and `sudo port uninstall gemini-cli` for the other package managers. If `gemini --version` still shows an old number after updating, `which -a gemini` lists every copy on your `PATH` in the order your shell tries them, which is how you spot a leftover Homebrew copy shadowing a fresh npm one.

Running Codex as well? [How to install Codex CLI](/blog/how-to-install-codex-cli/) covers OpenAI's agent with its own installer and sign in quirks.
