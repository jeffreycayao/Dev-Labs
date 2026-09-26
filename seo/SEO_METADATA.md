# Munder Difflin — SEO & AEO Metadata (Single Source of Truth)

> **Author:** Kevin (SEO strategist) · **Status:** v1 · **Scope:** marketing site
> (`https://munderdiffl.in/`) **and** the blog (`https://munderdiffl.in/blog/`, GitHub Pages).
> **Repo:** `https://github.com/chaitanyagiri/munder-difflin`
>
> This file is copy-paste-ready. Titles, descriptions, JSON-LD, robots, and sitemap entries are
> real values, not placeholders. Where a fact is genuinely unknowable (e.g. patron URL, GA ID),
> it is flagged `‹FILL›`. Search-demand figures are **estimates** and labelled as such — we do not
> have keyword-tool data, so prioritization is by intent + winnability, not volume claims.

---

## 0. Ground-truth reconciliation (read before editing)

Confirmed against `README.md`, `docs/index.html`, `docs/DESIGN.md` on this branch:

| Claim in old briefs | Reality in repo (use this) |
|---|---|
| "macOS only" | Site copy says **macOS · Windows · Linux**; README badge still says macOS-first (just behind). **Resolution (god/Chaitanya sign-off 2026-06-03):** the live site copy is the source of truth — claim **all three: macOS, Windows, Linux** in metadata, JSON-LD `operatingSystem`, and platform wording. |
| "dark-minimal Inter + gold landing" | **False.** Landing is **neo-brutalist warm-paper** — Geist + JetBrains Mono, cream `#FFFDF7`, hard offset shadows, accents yellow `#FFCA54` / sky `#72C2DF` / maroon `#B23A4E`. The *app* is pixel/Animal-Crossing; the *site* is not. |
| "memory layer = MemPalace" | Confirmed. Site calls it **MemPalace**, "a memory layer the whole office shares", "best-performing memory layer we know of." Use the MemPalace brand name in content. |
| Theme color | Site `<meta name="theme-color">` = `#F5F2E8` (cream). Keep consistent. |
| Single-page site | The marketing site is **one page** with anchor sections `#why #what #how #claude #opensource #install #support`. There are **no** separate `/features` or `/download` HTML pages today — they are anchors. Metadata below treats them as anchors but provides standalone specs in case sections are split out later. |

**Brand voice:** dry Office-parody wit ("The world's best agents. The world's worst paper
company."), but technically credible. Metadata should be confident and concrete, never cutesy at
the expense of the keyword.

---

## 1. Keyword strategy — prioritized taxonomy + keyword→URL map

**Winnability principle:** Munder Difflin is a brand-new, low-authority site. We chase **long-tail,
question, and "alternative" terms first** (achievable + high-intent), build topical authority via
the blog, and only then compete for head terms like `claude code multi-agent`. Volume labels below
are **rough estimates** (Low/Med/High relative within this niche), not measured data.

### 1.1 Priority tiers (what to target first)

| Tier | Why | Examples |
|---|---|---|
| **P0 — Branded** | Must own 100%. Zero competition. | `munder difflin`, `munder difflin claude code`, `munderdiffl` |
| **P1 — Long-tail / question** | Winnable now; powers blog + AEO + featured snippets. | `how to run multiple claude code agents`, `how to give claude code long-term memory` |
| **P2 — Competitor / alternative** | High commercial intent; people comparison-shop tools. | `claude squad alternative`, `conductor claude code alternative` |
| **P3 — Secondary / concept** | Builds topical authority via cluster posts. | `semantic memory for ai agents`, `single committer git multi agent` |
| **P4 — Head terms** | Aspirational; earn after authority accrues. | `claude code multi-agent`, `claude code orchestration` |

### 1.2 Full keyword → target-URL map

URL key: `/` = home, `#x` = home anchor, `/blog/...` = blog post (see BLOG_IDEAS.md), `GH` = GitHub repo.

#### Branded (P0)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| munder difflin | navigational | Low→ | `/` |
| munder difflin app | navigational | Low | `/` |
| munder difflin claude code | navigational | Low | `/` |
| munder difflin download | transactional | Low | `/#install` |
| munder difflin github | navigational | Low | `GH` |
| munderdiffl | navigational | Low | `/` |

#### Primary / head terms (P4)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| claude code multi-agent | informational/commercial | Med | `/` + `/blog/what-is-a-multi-agent-harness` |
| claude code orchestration | informational/commercial | Med | `/#how` + `/blog/claude-code-orchestration-guide` |
| multi-agent harness | informational | Low-Med | `/` |
| ai agent harness | informational | Low | `/` |
| run multiple claude code agents | informational/how-to | Med | `/blog/how-to-run-multiple-claude-code-agents` |
| claude code orchestrator | informational | Low-Med | `/#how` |
| claude code agents | informational | Med-High | `/blog/what-are-claude-code-agents` |

#### Secondary (P3)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| claude code subagents | informational | Med | `/blog/claude-code-subagents-vs-multi-agent-harness` |
| multi-agent ai framework | informational | Med | `/blog/what-is-a-multi-agent-harness` |
| autonomous coding agents | informational | Med | `/blog/autonomous-coding-agents-overnight` |
| local ai agent orchestration | informational | Low | `/#why` + `/blog/local-first-ai-agent-orchestration` |
| claude code automation | informational | Low-Med | `/blog/claude-code-automation-while-you-sleep` |
| agentic coding tools | informational/commercial | Med | `/blog/best-claude-code-multi-agent-tools` |
| ai coding agent teams | informational | Low | `/blog/run-an-office-of-ai-agents` |
| claude code parallel agents | informational/how-to | Low-Med | `/blog/how-to-run-multiple-claude-code-agents` |
| claude code git worktrees | informational/how-to | Med | `/blog/claude-code-git-worktrees-vs-hive` |

#### Long-tail / question (P1 — primary blog fuel + AEO)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| how to run multiple claude code agents | how-to | Med | `/blog/how-to-run-multiple-claude-code-agents` |
| how to orchestrate claude code agents | how-to | Low-Med | `/blog/claude-code-orchestration-guide` |
| how to give claude code long-term memory | how-to | Low-Med | `/blog/give-claude-code-long-term-memory` |
| can claude code agents talk to each other | informational | Low | `/blog/can-claude-code-agents-talk-to-each-other` |
| how to run claude code while you sleep | how-to | Low | `/blog/claude-code-automation-while-you-sleep` |
| best way to coordinate ai coding agents | informational | Low | `/blog/coordinating-ai-coding-agents` |
| local-first ai agent orchestration | informational | Low | `/blog/local-first-ai-agent-orchestration` |
| claude code multi-agent setup | how-to | Low-Med | `/blog/how-to-run-multiple-claude-code-agents` |
| how to manage multiple claude code sessions | how-to | Low-Med | `/blog/manage-multiple-claude-code-sessions` |

#### Competitor / alternative (P2 — high commercial intent)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| claude squad alternative | commercial | Low-Med | `/blog/claude-squad-alternative` |
| conductor claude code alternative | commercial | Low | `/blog/conductor-claude-code-alternative` |
| crystal claude code alternative | commercial | Low | `/blog/crystal-claude-code-alternative` |
| agent-deck alternative | commercial | Low | `/blog/best-claude-code-multi-agent-tools` |
| vibe kanban alternative | commercial | Low | `/blog/vibe-kanban-alternative` |
| claude code multi-agent tool | commercial | Low-Med | `/blog/best-claude-code-multi-agent-tools` |
| best claude code multi-agent tools | commercial | Low-Med | `/blog/best-claude-code-multi-agent-tools` |

#### Comparison (P2)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| claude squad vs munder difflin | commercial | Low | `/blog/claude-squad-vs-munder-difflin` |
| best tools to run multiple claude code agents | commercial | Low-Med | `/blog/best-claude-code-multi-agent-tools` |
| claude code orchestration tools compared | commercial | Low | `/blog/claude-code-orchestration-tools-compared` |

#### Feature / concept (P3 — topical authority)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| semantic memory for ai agents | informational | Low-Med | `/blog/semantic-memory-for-ai-agents` |
| ai agent long-term memory | informational | Med | `/blog/give-claude-code-long-term-memory` |
| single committer git multi agent | informational | Low | `/blog/single-committer-git-pattern` |
| xterm.js terminal app | informational | Low-Med | `/blog/building-a-terminal-ui-xterm-node-pty` |
| node-pty electron | informational/how-to | Low-Med | `/blog/node-pty-electron-real-terminals` |
| claude code hooks | informational | Med | `/blog/claude-code-hooks-explained` |
| human in the loop ai agents | informational | Med | `/blog/human-in-the-loop-ai-agents` |
| ai agent visualization | informational | Low | `/blog/visualizing-ai-agents-pixijs` |

#### Use-case (P3)
| Keyword | Intent | Est. vol | Target URL |
|---|---|---|---|
| autonomous software team ai | informational | Low | `/blog/run-an-office-of-ai-agents` |
| overnight ai coding | informational | Low | `/blog/autonomous-coding-agents-overnight` |
| ai pair programming team | informational | Low | `/blog/run-an-office-of-ai-agents` |
| local ai dev environment | informational | Low | `/blog/local-first-ai-agent-orchestration` |

### 1.3 Top 10 priority keywords (track these first in GSC)
1. munder difflin *(+ all branded variants)*
2. how to run multiple claude code agents
3. claude code multi-agent
4. claude squad alternative
5. how to give claude code long-term memory
6. claude code orchestration
7. best claude code multi-agent tools
8. how to manage multiple claude code sessions
9. claude code subagents
10. autonomous coding agents

---

## 2. Site-wide defaults

| Field | Value |
|---|---|
| Site name | `Munder Difflin` |
| Legal/org name | `Munder Difflin` (project; affectionate Office parody — not affiliated with NBC/Dunder Mifflin) |
| Canonical origin | `https://munderdiffl.in` |
| Default locale | `en_US` |
| Title template | `%s — Munder Difflin` (home uses full title verbatim, no suffix) |
| Default `<title>` (home) | `Munder Difflin — Local multi-agent harness for Claude Code` (60 chars) |
| Default meta description | `Munder Difflin turns the Claude Code terminals you already run into a self-coordinating hive of agents — they message, route, and remember, run by a GOD orchestrator you talk to. Local, open source.` *(trim to ≤155 for tag, see §3 home)* |
| Brand OG image | `https://munderdiffl.in/media/og.png` (2880×1640, PNG) |
| Twitter card | `summary_large_image` |
| Twitter handle | `‹FILL — none currently; omit twitter:site/creator until a handle exists›` |
| theme-color | `#F5F2E8` |
| Author / publisher | `Chaitanya Giri` (publisher: `Munder Difflin`) |
| Favicon / apple-touch | `/logo.png` |
| Fonts | Geist (sans), JetBrains Mono (mono) — already preconnected |

---

## 3. Per-page / per-section metadata

> The marketing site is currently **one HTML document**. The home `<title>`/description below is
> what ships on `docs/index.html`. The remaining blocks are the canonical specs to use **if** a
> section is ever split into its own page, and they double as the recommended in-page H1/H2 and the
> anchor descriptions for sitemap/snippet purposes. The blog blocks are live specs for Angela.

### 3.1 Home — `https://munderdiffl.in/`
- **title** (≤60): `Munder Difflin — Local multi-agent harness for Claude Code`
- **description** (≤155): `Run a self-coordinating hive of Claude Code agents that message, route, and remember — orchestrated by a GOD agent you talk to. Local & open source.` *(151)*
- **canonical:** `https://munderdiffl.in/`
- **H1:** `Agents that build while you do your thing.` *(keep existing brand hero; SEO carried by title/description + section H2s)*
- **OG:** `og:title` = `Munder Difflin — multi-agent harness for Claude Code` · `og:description` = `A local hive of Claude Code agents that message, route, and remember — coordinated by a GOD orchestrator you talk to. macOS, Windows & Linux.` · `og:type` = `website` · `og:url` = `https://munderdiffl.in/` · `og:image` = `https://munderdiffl.in/media/og.png`
- **Twitter:** `twitter:card` = `summary_large_image` · `twitter:title` / `twitter:description` mirror OG · `twitter:image` = og.png

> ✅ **APPLIED on `docs/index.html` (2026-06-03):** (1) trimmed the meta description to the ≤155 version above; (2) platform claim kept at all three (macOS, Windows, Linux) per sign-off; (3) added the `SoftwareApplication` + `Organization` + `WebSite` JSON-LD from §4; (4) added `twitter:title` + `twitter:description`; (5) added the blog RSS `<link rel="alternate">`. Additive head-only changes — page structure untouched.

### 3.2 "Why" section/anchor — `/#why`
- **(if split) title:** `Why a local Claude Code hive beats one terminal — Munder Difflin`
- **description:** `Four reasons a coordinated, local hive of agents does more than a lone Claude Code session: cost-smart orchestration, full control, built-in memory, high-agency outcomes.`
- **H2:** `Yes, it's fun to watch. It's also genuinely useful.`

### 3.3 "What it is" — `/#what`
- **(if split) title:** `What is Munder Difflin? Multi-agent harness for Claude Code`
- **description:** `Munder Difflin is an intelligent multi-agent harness for Claude Code agents that live locally in your terminal — wired into a hive mind with long-term memory and a GOD orchestrator.`
- **H2:** `An intelligent multi-agent harness for Claude Code`

### 3.4 "How it works" — `/#how`
- **(if split) title:** `How Munder Difflin orchestrates Claude Code agents`
- **description:** `See how the office floor works: many terminal agents managed and visualized, MemPalace shared memory, and a GOD agent that runs the floor through a hive mind.`
- **H2:** `An office you can actually see.`

### 3.5 "Claude" (integration) — `/#claude`
- **(if split) title:** `Use your existing Claude Code setup — Munder Difflin`
- **description:** `Munder Difflin plugs into the Claude Code you already run — your tools, MCP, and skills — and lets you remote-control the whole office. Just orchestrated.`
- **H2:** `Your Claude Code. Just orchestrated.`

### 3.6 "Open source" — `/#opensource`
- **(if split) title:** `Open source multi-agent harness (MIT) — Munder Difflin`
- **description:** `Munder Difflin is built in the open under the MIT license. Read the code, file issues, and contribute on GitHub.`
- **H2:** `Built in the open, on purpose.`

### 3.7 Download / Install — `/#install`
- **(if split) title:** `Download Munder Difflin — free for macOS, Windows, Linux`
- **description:** `Download Munder Difflin free for macOS, Windows & Linux, or build from source in two commands. Open source, local-first multi-agent harness for Claude Code.`
- **H2:** `Download, or build from source.`
- **Note:** this anchor is the target for `munder difflin download`. The download button links to `…/releases/latest`. If a standalone `/download/` page is ever created, give it its own canonical + `SoftwareApplication` JSON-LD.

### 3.8 Support — `/#support`
- **H2:** `Keep the office running.` *(star + patron CTAs; no dedicated metadata needed)*

### 3.9 Blog index — `https://munderdiffl.in/blog/`
- **title** (≤60): `Blog — Munder Difflin` *(or `Multi-agent & Claude Code blog — Munder Difflin`)*
- **description** (≤155): `Guides, deep dives, and comparisons on running multi-agent Claude Code: orchestration, agent memory, automation, and the tooling landscape.`
- **canonical:** `https://munderdiffl.in/blog/`
- **H1:** `The Munder Difflin Blog`
- **OG:** `og:type` = `website` · image = og.png (or a dedicated blog OG) · url = `/blog/`
- **JSON-LD:** `Blog` + `Breadcrumb` (Home › Blog) — see §4.

### 3.10 Blog post template — `https://munderdiffl.in/blog/<slug>/`
- **title** (≤60): `‹Post title — keep ≤60; lead with primary keyword›`
- **description** (≤155): `‹One-sentence answer/benefit with primary keyword; click-driven.›`
- **canonical:** `https://munderdiffl.in/blog/<slug>/`
- **H1:** the post title (exactly one H1)
- **OG:** `og:type` = `article` · `og:title`/`og:description` per post · `og:image` = per-post hero (1200×630) or fallback og.png · `article:published_time`, `article:modified_time`, `article:author`, `article:tag` per post
- **Twitter:** `summary_large_image`
- **JSON-LD:** `BlogPosting` + `BreadcrumbList` (+ `FAQPage` when the post has a Q&A block) — see §4.

### 3.11 FAQ block (embeddable on home + posts)
- Use the `FAQPage` JSON-LD in §4. Recommended seed Q&As (AEO-optimized, one-sentence answers):
  - **What is Munder Difflin?** — "Munder Difflin is a local, open-source desktop app that turns the Claude Code terminals you already run into a self-coordinating hive of agents with shared memory, messaging, and a GOD orchestrator you talk to."
  - **Is Munder Difflin free?** — "Yes. Munder Difflin is free and open source under the MIT license; you can download a build or run it from source."
  - **Does it run my data in the cloud?** — "No. Munder Difflin is local-first — the harness, agents, and memory live on your own machine."
  - **What platforms does it support?** — "macOS, Windows, and Linux."
  - **Can Claude Code agents talk to each other?** — "Yes. Each agent has a mailbox; the harness router delivers messages between agents, and a GOD orchestrator routes and adjudicates work."
  - **How is this different from running several Claude Code terminals?** — "Munder Difflin adds coordination: shared long-term memory (MemPalace), inter-agent messaging, a GOD orchestrator, and a visual office floor — so the sessions act as one team instead of isolated windows."

---

## 4. Structured data (JSON-LD) — copy-paste ready

> Place each block as `<script type="application/ld+json"> … </script>` in `<head>`. Use the
> blocks relevant to the page (home: SoftwareApplication + Organization + WebSite; blog index: Blog
> + Breadcrumb; post: BlogPosting + Breadcrumb [+ FAQPage]). Dates/values marked `‹FILL›` per post.

### 4.1 SoftwareApplication (home)
```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Munder Difflin",
  "description": "Local, open-source multi-agent harness for Claude Code. Turns the Claude Code terminals you already run into a self-coordinating hive of agents with long-term memory, inter-agent messaging, and a GOD orchestrator you talk to.",
  "url": "https://munderdiffl.in/",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS, Windows, Linux",
  "softwareVersion": "0.1.3",
  "downloadUrl": "https://github.com/chaitanyagiri/munder-difflin/releases/latest",
  "softwareHelp": "https://github.com/chaitanyagiri/munder-difflin#readme",
  "license": "https://github.com/chaitanyagiri/munder-difflin/blob/main/LICENSE",
  "isAccessibleForFree": true,
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "author": {
    "@type": "Person",
    "name": "Chaitanya Giri"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Munder Difflin",
    "url": "https://munderdiffl.in/"
  },
  "image": "https://munderdiffl.in/media/og.png",
  "screenshot": "https://munderdiffl.in/media/og.png",
  "keywords": "claude code multi-agent, multi-agent harness, claude code orchestration, autonomous coding agents, ai agent memory"
}
```
> Note: no `aggregateRating` — we have no real review data; do **not** fabricate ratings (Google
> penalizes self-serving/invalid review markup).

### 4.2 Organization (home)
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Munder Difflin",
  "url": "https://munderdiffl.in/",
  "logo": "https://munderdiffl.in/logo.png",
  "description": "Open-source local multi-agent harness for Claude Code.",
  "sameAs": [
    "https://github.com/chaitanyagiri/munder-difflin"
  ]
}
```

### 4.3 WebSite + SearchAction (home)
> Only include `potentialAction` once the blog has a real search endpoint. If there is no search,
> omit the `potentialAction` object (don't point it at a non-existent URL).
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Munder Difflin",
  "url": "https://munderdiffl.in/",
  "inLanguage": "en-US"
}
```
*Optional, only if a working search exists:*
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Munder Difflin",
  "url": "https://munderdiffl.in/",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://munderdiffl.in/blog/?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

### 4.4 Blog (blog index)
```json
{
  "@context": "https://schema.org",
  "@type": "Blog",
  "name": "Munder Difflin Blog",
  "url": "https://munderdiffl.in/blog/",
  "description": "Guides and deep dives on running multi-agent Claude Code: orchestration, agent memory, automation, and tooling.",
  "publisher": {
    "@type": "Organization",
    "name": "Munder Difflin",
    "logo": { "@type": "ImageObject", "url": "https://munderdiffl.in/logo.png" }
  }
}
```

### 4.5 BlogPosting (per post template)
```json
{
  "@context": "https://schema.org",
  "@type": "BlogPosting",
  "headline": "‹Post title (≤110 chars)›",
  "description": "‹Meta description›",
  "image": "https://munderdiffl.in/blog/assets/‹slug›-hero.png",
  "datePublished": "‹YYYY-MM-DD›",
  "dateModified": "‹YYYY-MM-DD›",
  "author": { "@type": "Person", "name": "‹Author name›" },
  "publisher": {
    "@type": "Organization",
    "name": "Munder Difflin",
    "logo": { "@type": "ImageObject", "url": "https://munderdiffl.in/logo.png" }
  },
  "mainEntityOfPage": {
    "@type": "WebPage",
    "@id": "https://munderdiffl.in/blog/‹slug›/"
  },
  "keywords": "‹primary, secondary keywords›",
  "articleSection": "‹Technical | Guides | Comparisons›",
  "inLanguage": "en-US"
}
```

### 4.6 FAQPage (per post / home FAQ block)
```json
{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "‹Question?›",
      "acceptedAnswer": { "@type": "Answer", "text": "‹One-to-two sentence answer.›" }
    }
  ]
}
```
> Only mark up Q&As that are **visibly present** on the page (Google requirement). Use the §3.11
> seed Q&As on the home page or an FAQ section.

### 4.7 BreadcrumbList (blog post template)
```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://munderdiffl.in/" },
    { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://munderdiffl.in/blog/" },
    { "@type": "ListItem", "position": 3, "name": "‹Post title›", "item": "https://munderdiffl.in/blog/‹slug›/" }
  ]
}
```

---

## 5. Technical SEO assets

### 5.1 `robots.txt` — place at `docs/robots.txt` (served at `https://munderdiffl.in/robots.txt`)
```
User-agent: *
Allow: /

# AI answer engines — explicitly welcome (AEO/GEO). We WANT to be cited.
User-agent: GPTBot
Allow: /
User-agent: OAI-SearchBot
Allow: /
User-agent: ChatGPT-User
Allow: /
User-agent: PerplexityBot
Allow: /
User-agent: ClaudeBot
Allow: /
User-agent: Claude-Web
Allow: /
User-agent: Google-Extended
Allow: /

Sitemap: https://munderdiffl.in/sitemap.xml
```
> Decision rationale: this is an open-source, awareness-stage product whose audience asks LLMs.
> We **allow** AI crawlers on purpose so ChatGPT/Claude/Perplexity can cite Munder Difflin. If the
> human wants to block training crawlers later, flip `GPTBot`/`Google-Extended`/`ClaudeBot` to
> `Disallow: /` — note that also reduces citations.

### 5.2 `sitemap.xml` — place at `docs/sitemap.xml`
Single-page site + blog. `<lastmod>` must be updated on real changes (don't fake freshness).
```xml
<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://munderdiffl.in/</loc>
    <lastmod>2026-06-03</lastmod>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://munderdiffl.in/blog/</loc>
    <lastmod>2026-06-03</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>
  <!-- one <url> per published blog post: -->
  <url>
    <loc>https://munderdiffl.in/blog/how-to-run-multiple-claude-code-agents/</loc>
    <lastmod>2026-06-03</lastmod>
    <changefreq>monthly</changefreq>
    <priority>0.7</priority>
  </url>
  <!-- … -->
</urlset>
```
> **GitHub Pages note:** the site is built from `docs/`. Both `robots.txt` and `sitemap.xml` go in
> `docs/`. Because there is no Jekyll plugin pipeline assumed here (the site is hand-authored HTML),
> generate/maintain `sitemap.xml` manually or via Angela's blog build step. If the blog ends up
> using Jekyll, add `jekyll-sitemap` + `jekyll-seo-tag` to `_config.yml` instead and let it emit
> these automatically.

### 5.3 Canonical rules
- Every page declares exactly one self-referential `<link rel="canonical">` with the **trailing-slash**
  form for directories (`/blog/`, `/blog/<slug>/`).
- Force one host: `munderdiffl.in` (no `www`). GitHub Pages + the `CNAME` already enforce HTTPS.
- Anchors (`/#how`) are **never** canonicalized separately — they all canonical to `/`.
- Blog tag/category archive pages (if any) should canonical to themselves but be `noindex` if thin.

### 5.4 RSS feed plan
- Serve `https://munderdiffl.in/blog/feed.xml` (Atom or RSS 2.0).
- Link it from `<head>` on every page:
  `<link rel="alternate" type="application/rss+xml" title="Munder Difflin Blog" href="https://munderdiffl.in/blog/feed.xml">`
- Include full or generous-excerpt content, `<pubDate>`, `<guid isPermaLink="true">` = post URL.
- If Jekyll: add `jekyll-feed` (emits `/feed.xml`). Otherwise Angela's build emits it.

### 5.5 Image `alt` guidelines
- Describe content + function, include a keyword **only when natural**. No keyword stuffing.
- Good (already in repo): *"Munder Difflin running a floor of Claude Code agents — avatars at their desks, the GOD orchestrator in Michael's office, and a live terminal session."*
- Decorative images (pure ornament): `alt=""`.
- Blog hero images: `alt` = post topic in plain language, e.g. *"Diagram of a GOD orchestrator routing tasks to three Claude Code agents."*
- Provide `width`/`height` on every `<img>` (prevents CLS — the repo already does this on the logo).

### 5.6 Heading rules
- Exactly **one `<h1>`** per page (home: the hero; posts: the title).
- Logical, non-skipping hierarchy: `h1 → h2 → h3`. Section H2s should carry the topic keywords
  (the site's H2s like "An office you can actually see" are brand-y — that's fine for the marketing
  page, but blog posts must use descriptive, keyword-bearing H2/H3s for snippet eligibility).
- Blog long-form posts: include a **TL;DR** and a **table of contents** (jump links) — strong for
  AEO and for "People also ask" capture.

### 5.7 Internal-linking rules (pillar ↔ cluster)
- **Pillars** = home anchors: `#what` (what is a harness), `#how` (orchestration), MemPalace (memory).
- **Clusters** = blog posts. Every post links **up** to its pillar with a descriptive anchor
  (e.g. anchor text "multi-agent harness" → `/#what`) and **sideways** to 2–4 sibling posts.
- Every post includes a contextual CTA link to `/#install` (download) with anchor "download Munder Difflin".
- Comparison/alternative posts link to the relevant guide posts and vice-versa.
- Use descriptive anchor text, never "click here". The `Internal links` column in BLOG_IDEAS.md
  pre-specifies these for each post.
- Avoid orphan posts: the blog index lists all posts; each new post is added to `sitemap.xml`.

---

## 6. GitHub SEO (off-page foundation — the repo IS a ranking surface)

### 6.1 Repo "About" description (≤350 chars; keyword-led)
```
Local, open-source multi-agent harness for Claude Code. Turn the Claude Code terminals you already run into a self-coordinating hive of agents — with long-term memory, inter-agent messaging, and a GOD orchestrator you talk to. macOS, Windows & Linux. Electron · Pixi.js · xterm.js · node-pty.
```

### 6.2 Repo website field
Set to `https://munderdiffl.in/`.

### 6.3 Recommended GitHub topics (add via repo → ⚙ Topics)
```
claude-code · multi-agent · ai-agents · agentic-coding · llm · orchestration ·
autonomous-agents · electron · typescript · node-pty · xterm-js · pixijs ·
ai-orchestration · agent-memory · local-first · developer-tools · hive · mcp
```

### 6.4 README first-paragraph rewrite (keyword-front-loaded for GitHub + Google)
> Keep the brand line, but ensure the **first sentence** contains the head keyword. Suggested:

```markdown
**Munder Difflin is a local, open-source multi-agent harness for [Claude Code](https://claude.com/claude-code).**
It turns the Claude Code terminal sessions you already run into a self-coordinating **hive of
autonomous agents** — each with long-term memory and a mailbox — coordinated by a **GOD orchestrator
agent you talk to**, and visualized as avatars working a shared office floor. Run a whole office of
Claude Code agents locally on macOS or Windows, message and route work between them, and let them
build while you do your thing.
```
> Rationale: current README opens with the brand tagline image and a softer line; leading the prose
> with "multi-agent harness for Claude Code" helps both GitHub search and the Google snippet that
> indexes the README.

### 6.5 Social-preview image spec (repo → Settings → Social preview)
- **1280×640 PNG/JPG**, <1 MB. Reuse/derive from `docs/media/og.png` (crop to 2:1).
- Must show the product (office floor) + wordmark + one-line value prop. Already have `og.png`
  (2880×1640) — resize/crop to 1280×640 for the GitHub social card.

### 6.6 Release SEO
- Every GitHub Release gets a keyword-aware title + notes (the `releases/latest` URL is the download
  target for `munder difflin download`). Tie into the existing release process
  ([[release-process]]): tag `v*`, update landing page, CHANGELOG, RELEASE.md.

---

## 7. Off-page / distribution checklist (recommendations, not on-page metadata)

> Sequenced by effort/reward for a new dev tool. All are launch/awareness plays.

- [ ] **Google Search Console** — verify `munderdiffl.in`, submit `sitemap.xml`.
- [ ] **Bing Webmaster Tools** — verify + submit sitemap (also feeds ChatGPT search).
- [ ] **awesome-claude-code** and **awesome-ai-agents** lists — submit PRs (highest-intent dev traffic).
- [ ] **Show HN** — "Show HN: Munder Difflin — run an office of Claude Code agents locally". Link site + repo.
- [ ] **Product Hunt** launch — gallery from `og.png` + the hero clip.
- [ ] **Reddit** — r/ClaudeAI, r/LocalLLaMA, r/programming, r/SideProject (value-first posts, not spam).
- [ ] **dev.to / Hashnode cross-posts** — republish 2–3 top blog posts with `rel=canonical` back to `munderdiffl.in/blog/...` (avoid duplicate-content dilution).
- [ ] **AI-tool directories** — There's An AI For That, Futurepedia, aitools.fyi, etc.
- [ ] **Claude Code / Anthropic community** Discord/forum presence (where allowed).
- [ ] **X/Twitter & LinkedIn** — short demo clips of the office floor; create a handle and then add `twitter:site`.
- [ ] **YouTube** — a 60–90s screen recording (the office floor is inherently demo-able) → embeds + a video result surface.
- [ ] **Backlinks from comparison posts** — once "alternative" posts rank, pitch them to roundup authors.

---

## 8. Measurement plan

| Tool | Purpose | Setup |
|---|---|---|
| **Google Search Console** | Impressions/clicks/position per query, indexation, Core Web Vitals, sitemap status | Verify domain; submit sitemap; watch the §1.3 top-10 |
| **Bing Webmaster Tools** | Bing + ChatGPT-search surface | Verify; submit sitemap |
| **Privacy-friendly analytics** | Traffic, top pages, referrers without cookies | Plausible / GoatCounter / Cloudflare Web Analytics — `‹FILL choice›`. Avoids a cookie banner; fits the local-first/privacy ethos |
| **GitHub Insights** | Stars over time, referring sites, clones | Built into the repo |

**KPIs (first 90 days):**
1. Indexed: home + blog index + all published posts (GSC coverage).
2. Rank top-3 for **all branded** terms.
3. ≥1 page-1 ranking among the long-tail P1 set (`how to run multiple claude code agents` is the
   target).
4. GitHub stars trend (proxy for awareness).
5. **AEO check (manual, monthly):** ask ChatGPT/Claude/Perplexity *"how do I run multiple Claude
   Code agents"* / *"Claude Squad alternative"* and log whether Munder Difflin is mentioned/cited.

**Cadence:** weekly GSC glance, monthly full review + AEO citation check.

---

## 9. FOR ANGELA — exactly what the blog must implement

> Angela, this is the contract. Build the blog (GitHub Pages, at `https://munderdiffl.in/blog/`) so
> each post can declare the following. Everything is templated above; this is the checklist.

**Per-post front-matter the templates must support** (whatever your generator uses — Jekyll
front-matter, JSON, etc. — expose these fields):

| Field | Maps to | Required |
|---|---|---|
| `title` | `<title>` (append ` — Munder Difflin`, keep ≤60 incl. suffix where possible) + `<h1>` + OG/Twitter title | ✅ |
| `description` | meta description (≤155) + OG/Twitter description | ✅ |
| `slug` | URL `/blog/<slug>/` + canonical | ✅ |
| `date` / `updated` | `article:published_time` / `dateModified` in BlogPosting | ✅ |
| `author` | BlogPosting author | ✅ |
| `primary_keyword` / `secondary_keywords` | `keywords` in BlogPosting + internal use | ✅ |
| `type` | `articleSection` (Technical / Non-technical → Guides/Comparisons/Deep-dive) | ✅ |
| `hero_image` + `hero_alt` | `og:image` (1200×630) + in-page hero `alt` | ✅ (fallback to `/media/og.png`) |
| `internal_links` | rendered in-post links (from BLOG_IDEAS.md `Internal links` column) | ✅ |
| `faq` (optional list of Q/A) | renders visible FAQ + emits `FAQPage` JSON-LD | ⬜ when present |
| `toc` (bool) | renders table of contents on long posts | ⬜ recommended for >1500 words |

**Site-wide things the blog layout must emit on every page:**
1. `<title>`, `<meta name="description">`, **self-referential canonical** (trailing slash).
2. OpenGraph (`og:title/description/image/url/type=article` for posts, `website` for index) +
   Twitter `summary_large_image` (title, description, image).
3. `<meta name="theme-color" content="#F5F2E8">`.
4. JSON-LD per §4: **BlogPosting + BreadcrumbList** on every post (+ **FAQPage** when `faq` present);
   **Blog + BreadcrumbList** on the index.
5. `<link rel="alternate" type="application/rss+xml" href="https://munderdiffl.in/blog/feed.xml">`.
6. Exactly one `<h1>`; descriptive, keyword-bearing `<h2>/<h3>`.
7. Every post: a **TL;DR** at top, link **up to a home pillar anchor**, **2–4 sibling-post links**,
   and a **"download Munder Difflin" CTA** to `/#install`.
8. Add each post's URL to `docs/sitemap.xml` and the blog index list on publish (no orphans).
9. Images: `width`/`height` set, meaningful `alt`, lazy-load below the fold.
10. Match the marketing site's neo-brutalist warm-paper system (Geist + JetBrains Mono, cream
    `#FFFDF7`, hard `#1B1B1B` offset shadows, accents yellow `#FFCA54` / sky `#72C2DF` / maroon
    `#B23A4E`) — see `docs/DESIGN.md` and `docs/index.html`. Do **not** use the app's pixel aesthetic.

**Performance bar (Core Web Vitals):** static HTML, self-hosted/preconnected fonts (already done),
no heavy JS, hero images sized + lazy below fold. Target green LCP/CLS/INP — GitHub Pages serves
static well; keep it that way.

**Deliverable order for you:** (1) blog index + post template wired with the above; (2) implement
`BlogPosting`/`Breadcrumb`/`FAQ` JSON-LD; (3) `feed.xml` + sitemap integration; (4) pull the first
batch of posts from `BLOG_IDEAS.md` (start with the P1 long-tail + P2 alternative rows — highest
winnability).

---

*End of SEO_METADATA.md — questions or domain/handle decisions go to god (conversation: munder-blog-seo).*
