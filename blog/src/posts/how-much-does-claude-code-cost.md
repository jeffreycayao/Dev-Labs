---
title: "How Much Does Claude Code Cost?"
description: "What Claude Code actually costs: free plan access, Claude Pro and Max pricing, per token API rates, and what running several agents does to the bill."
date: 2026-09-10
category: concepts
categoryLabel: Concepts
type: Non-technical
primaryKeyword: "how much does claude code cost"
secondaryKeywords: ["claude code pricing", "claude code cost per month", "is claude code free", "claude pro vs max", "claude code api pricing", "claude code cost india"]
tags: ["Concepts", "Cost", "Claude Code", "Getting Started"]
faq:
  - q: "Is Claude Code free to use?"
    a: "No, not on its own. Anthropic's free Claude plan lists chat, web search, memory and several other surfaces, but Claude Code is not among them; it first appears on Claude Pro and up (claude.com/pricing, checked 10 Sep 2026). The other way in is an Anthropic API key billed per token."
  - q: "How much does Claude Code cost per month?"
    a: "If you already pay for Claude Pro or Claude Max, nothing extra. Claude Pro is $20 a month billed monthly, or works out to $17 a month billed annually, and includes Claude Code at no added charge; Claude Max starts at $100 a month for more usage (claude.com/pricing, checked 10 Sep 2026)."
  - q: "What is the difference between Claude Pro and Claude Max for Claude Code?"
    a: "Mostly headroom. Anthropic describes the $100 a month Max tier as five times the usage of Pro per session, and a $200 a month tier as twenty times, both on a rolling five hour window with a weekly cap shared across every model (support.claude.com, checked 10 Sep 2026). Neither page states an exact Claude Code prompt count for any tier."
  - q: "How much does the Claude API cost per token for Claude Code?"
    a: "It depends on the model. As of 10 Sep 2026, Anthropic's pricing page lists Claude Sonnet 5 (Claude Code's default on Pro and Team Standard) at $2 per million input tokens and $10 per million output tokens, and Claude Opus 5 (the default on Max, Team Premium, Enterprise and a bare API key) at $5 and $25; Claude Haiku 4.5 runs $1 and $5 and is not a default anywhere (platform.claude.com/docs/en/about-claude/pricing and code.claude.com/docs/en/model-config)."
  - q: "Does Claude Code cost extra for teams or enterprise use?"
    a: "Team plans add a per seat charge on top of usage: a Standard seat is $20 a seat per month billed annually, a Premium seat is $100 a seat per month billed annually, and Enterprise starts at $20 a seat with usage billed on top (claude.com/pricing, checked 10 Sep 2026). All three still include Claude Code."
  - q: "How do I see what Claude Code is actually spending?"
    a: "Run /usage inside a session for a live breakdown by model and by attribution (skills, subagents, MCP servers), or the Session block for a running total in dollars computed at list price (code.claude.com/docs/en/costs, checked 10 Sep 2026). For an API key or cloud billed account, the Claude Console's usage page is the source of truth, not the CLI's own estimate."
---

Claude Code has no price of its own. As of 10 Sep 2026 it comes with Claude Pro at $20 a month and with Claude Max from $100 a month, the free Claude plan does not include it, and without a subscription you pay per token through the API (Anthropic, claude.com/pricing).

Which of those fits depends on how you already work. If you are the kind of developer running more than one Claude Code window already, it is worth reading [how to keep several Claude Code sessions straight](/blog/manage-multiple-claude-code-sessions/) first, because tracking spend gets harder exactly when you add more terminals. The rest of this post breaks down each option, names its source, and says when it was checked, because Anthropic changes these numbers without much warning.

## Is Claude Code free to use?

No. Anthropic's free Claude plan covers chat, web search, memory, file creation, code execution and a few other surfaces, but Claude Code does not appear on that list; it starts on Claude Pro (claude.com/pricing, checked 10 Sep 2026). The other route in skips the subscription entirely: connect an Anthropic API key and Claude Code bills per token instead.

## How much does Claude Code cost with a Claude subscription?

Claude Pro is $20 a month billed monthly, or $17 a month on the annual plan billed up front, and Claude Code comes included at no extra charge (Anthropic, claude.com/pricing, checked 10 Sep 2026). Claude Max sits above it at $100 a month for a five times usage tier and $200 a month for a twenty times tier, with both figures set against Pro's own usage, and both plans meter Claude Code and Claude chat together rather than as two separate allowances ([support.claude.com](https://support.claude.com/en/articles/11145838-use-claude-code-with-your-pro-or-max-plan), checked 10 Sep 2026). Already on Max? Our guide on [how to get the most out of your Claude Code Max plan](/blog/claude-code-max-plan-tips/) covers stretching that allowance.

{% img "note-1" %}

## What's the difference between Claude Pro and Claude Max for Claude Code?

Mostly how much you can burn through before you wait. Anthropic states usage on a rolling five hour window plus a weekly cap shared across models, and Max simply multiplies that ceiling by five or twenty depending on which tier you pick ([support.claude.com](https://support.claude.com/en/articles/11049741-what-is-the-max-plan), checked 10 Sep 2026). What neither official page states is an exact number of Claude Code prompts per window; specific figures like "10 to 40 prompts" that circulate on comparison blogs are not on Anthropic's own pages as checked for this post, so treat them as someone's estimate rather than a published limit.

## How much does the Claude API cost per token?

It scales with the model. Which model Claude Code even starts on depends on your plan: Sonnet 5 by default on Pro and Team Standard, Opus 5 by default on Max, Team Premium, Enterprise and a bare API key (code.claude.com/docs/en/model-config, checked 10 Sep 2026). As of 10 Sep 2026, Anthropic's pricing page lists Claude Sonnet 5 at $2 per million input tokens and $10 per million output tokens, Claude Opus 5 at $5 and $25, and Claude Haiku 4.5 at $1 and $5 (platform.claude.com/docs/en/about-claude/pricing). Routine edits on a cheap model and hard reasoning on an expensive one, the habit our guide on [matching tasks to the right model size](/blog/do-more-with-less-model-routing/) covers, is where most of the saving actually lives. The same page notes that Sonnet 5's $2/$10 rate, originally an introductory price, became the standard rate once August 2026 ended, so it is not a limited time deal anymore. Prompt caching cuts the input side further, down to roughly a tenth of the base rate on a cache hit, the same lever our [multi-agent cost playbook](/blog/the-multi-agent-cost-playbook/) covers for a whole fleet of agents rather than one session.

{% img "note-2" %}

## Does Claude Code cost more in India?

Anthropic does not publish a separate India price on the pages checked for this post. Claude.com/pricing showed only USD figures as fetched on 10 Sep 2026 for this check, and neither the Pro nor the Max support article names an INR amount. Rupee figures circulating on third party blogs are not traceable to an Anthropic page, so this post is not repeating them; check claude.com/pricing directly for the number your account sees.

## What does running several Claude Code agents do to the bill?

It multiplies, because every agent is its own Claude Code process with its own context window and its own token meter running in parallel, not a shared allowance split between them. Munder Difflin, the harness this blog belongs to, does not change what any of that costs: every agent it hires still runs on your own Claude Code subscription or API key, never a resold or marked up rate. What it adds is a lever on the multiplication rather than a discount on it: per agent token budgets cap what a single hired agent can spend, and a circuit breaker steers, then constrains, then stops an agent that loops, storms errors, or blows its budget, instead of a person finding out from the invoice ([Munder Difflin README](https://github.com/chaitanyagiri/munder-difflin#readme), checked 10 Sep 2026).

Claude Code itself carries the same instinct for a single run. Checked on 10 Sep 2026, running `claude --help` on Claude Code 2.1.267 turns up its own per session guard:

```
--max-budget-usd <amount>   Maximum dollar amount to spend on API
                             calls (only works with --print)
```

Set that on one agent and it stops on its own. Set it on ten, running at once with nobody watching, and it is the difference between a surprise and a line item; Oscar in accounting would call that the bare minimum. Claude Code's own `/usage` command and Session block give a running dollar estimate at list price for a single session too, covered in Anthropic's [cost management docs](https://code.claude.com/docs/en/costs), though a fleet of separate agents means reading that number once per agent rather than once for the whole job.

None of the figures above are permanent. Anthropic revises pricing on its own pages with little notice, the way Sonnet 5's introductory rate became its standard rate after 31 August 2026, so treat this post as accurate for 10 Sep 2026 and check [claude.com/pricing](https://claude.com/pricing) or the [Claude Platform pricing docs](https://platform.claude.com/docs/en/about-claude/pricing) before you commit a team to a plan.
