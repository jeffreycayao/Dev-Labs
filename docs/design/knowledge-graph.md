# Knowledge Graph — Enterprise Multimodal Context for Agents (Design, v1)

**Feature:** Knowledge Graph (enterprise context store + agent access)
**Branch:** `feat/knowledge-graph` · **Author:** Stanley · **Status:** design + v1 vertical slice in this pass
**Flag:** `knowledgeGraph.enabled` (default **OFF** — zero behaviour change when off)

> **Naming note.** This is *not* `MEMORY_GRAPH_SPEC.md` (Jim's hive **message-graph visualization** — a renderer panel that draws who-talks-to-whom). This feature is the **enterprise knowledge store**: the user/enterprise adds multimodal artifacts (docs, PDFs, images, sheets, code, markdown…) that represent their context and business logic, and agents on the floor get a **CLI tool** to query that knowledge on demand. The two share no code. Config key here is `knowledgeGraph`; the manager class is `KnowledgeManager` and the agent CLI is `kg`.

---

## 1. Goal & shape

Give every agent on the floor on-demand access to the enterprise's own context — so a task like *"draft the onboarding email in our house style"* or *"what's our refund policy?"* can be answered from the company's real documents instead of guessed.

Two halves:

1. **Ingest → store (in-app):** the user adds files. The main process parses/extracts text per modality, chunks it, and writes it to a local file-backed store. The renderer manages the corpus (toggle on, add files, see counts).
2. **Retrieve (agent-facing):** a spawned agent runs `kg search "<query>"` via Bash and gets back ranked, source-attributed snippets it can act on — exactly the way the hive already exposes **MemPalace** (`mempalace search "<query>"`).

It is **read-mostly** for agents (they query; they do not write the corpus) and **opt-in** for the user (flag default off). It must never change harness behaviour when the flag is off.

---

## 2. Why these choices (the three load-bearing decisions)

### 2.1 Access mechanism — **CLI via Bash**, not MCP, not a built-in tool, not a skill file

| Option | Verdict |
|---|---|
| **CLI invoked via Bash** ✅ | This is the **established hive pattern**: MemPalace is surfaced to agents as `mempalace search …` documented in the injected system prompt (`hive.ts injectedPrompt`), with paths passed as spawn env. It is **provider-agnostic** — Claude, Codex, and Antigravity agents all have a shell, so all of them can query KG with zero per-provider work. No per-agent `settings.json`, no server handshake, no SDK. Mirrors the existing `md-slack-reply.cjs` helper (a bundled pure-JS `.cjs` that agents call as `node "<path>" …`). |
| MCP server | Rejected for v1. Heaviest option: requires writing/merging an MCP server config into **every** agent's Claude settings, a running stdio/SSE transport, and is Claude-specific (Codex/Antigravity agents wouldn't get it). Real value only once we need typed tool schemas or streaming — a clean **v2** upgrade that can sit *behind the same `kg` CLI contract*. |
| Built-in Claude tool | Not available to us — we don't control the model's tool set except via MCP. |
| Skill file (`.claude/skills/…`) | Viable, but it's just documentation pointing at a CLI anyway, and it's Claude-only. We instead document the CLI in the injected system prompt (one flag-gated line) — same effect, provider-agnostic, and consistent with how MemPalace is taught. A skill can be added later as sugar. |

**Decision:** ship a small **`kg` CLI** (pure-JS `.cjs`, no native deps) in `resources/`, injected into agents via env (`KG_CLI`, `KG_ROOT`) and taught via one flag-gated line in the injected system prompt. MCP is the documented v2.

### 2.2 Retrieval — **keyword (BM25-ish term scoring)**, not embeddings, for v1

The dispatch says *pick the simplest that works*. Embeddings would need a model + vector index + a new heavy dependency (and an embedding service the offline app can't assume). Keyword search over chunked text is:

- **Zero new deps** — pure string tokenization + term-frequency scoring with a title boost and exact-phrase bonus. Deterministic and trivially unit-testable.
- **Good enough** for a v1 enterprise corpus (policies, templates, specs, code) where users search with the literal vocabulary of their own documents.
- **Forward-compatible** — the agent contract is `kg search "<q>"`; swapping the index implementation (FTS5, then embeddings) is invisible to agents. See §8.

**Decision:** keyword scoring in v1. **SQLite FTS5** (BM25, ships free with the existing `better-sqlite3` dep) is the documented next step; **embeddings** (via MemPalace's existing local embedder, or a small model) is the v2 after that.

### 2.3 Store — **file-backed** (`index.jsonl` + per-doc folders), not SQLite, for v1

We deliberately do **not** put the v1 store in `better-sqlite3` even though it's an existing dep. Reason: **the agent CLI runs out-of-process under plain `node`**, while `better-sqlite3` is a **native module rebuilt for Electron's ABI** (`electron-rebuild -f`). A standalone `node tools/kg.cjs` opening that `.node` binary would hit an ABI/loader mismatch on user machines. A file-backed store the CLI reads with only `node:fs` sidesteps this entirely — and it's consistent with how the hive already works (agents read `memory.md`, `tasks.json`, `inbox/*` as plain files). The in-app management UI reads the same files over IPC.

> This is the same robustness reason `md-slack-reply.cjs` talks to a loopback endpoint instead of touching the DB directly. FTS5 (§8) becomes viable for agents the day we front it with an in-app loopback query endpoint — listed as v2.

---

## 3. Data model

### 3.1 On-disk layout

`KG_ROOT` defaults to `<userData>/knowledge` (override via `knowledgeGraph.rootPath`). It is injected into agents as the `KG_ROOT` env var.

```
<KG_ROOT>/
  index.jsonl            # the search index — ONE JSON line per CHUNK
  docs/
    <docId>/
      meta.json          # artifact metadata (see §3.3)
      original.<ext>     # the raw artifact, copied in verbatim (images, PDFs, binaries…)
      text.md            # the full extracted/normalized searchable text (for `kg get`)
```

- **`index.jsonl`** is the hot path: append-only, one line per chunk, streamed and scored by `kg search`. Rebuildable from `docs/*/text.md` + `meta.json` at any time (a `kg reindex` is a trivial follow-up).
- **`docs/<docId>/`** is the durable record of each artifact: the original bytes (so images/PDFs survive for future OCR/vision), the extracted text, and metadata. Removing a doc deletes its folder and filters its lines out of `index.jsonl`.

### 3.2 Chunk record (one line of `index.jsonl`)

```jsonc
{
  "docId":   "k7f3…",      // stable id of the parent artifact
  "title":   "Refund Policy 2026",
  "source":  "refund-policy.md",   // original filename
  "modality":"text",       // text | image | pdf | sheet | code | …
  "chunkIdx": 0,           // 0-based position within the doc
  "text":    "Customers may request a full refund within 30 days…"
}
```

### 3.3 Doc metadata (`meta.json`)

```jsonc
{
  "id":        "k7f3…",
  "title":     "Refund Policy 2026",   // user-supplied or derived from filename/first heading
  "source":    "refund-policy.md",
  "modality":  "text",
  "mime":      "text/markdown",
  "origExt":   "md",
  "bytes":     5120,
  "tags":      ["policy", "support"],   // optional, user-supplied
  "caption":   null,                    // images: user description folded into searchable text
  "chunkCount":3,
  "addedAt":   "2026-06-11T…Z",
  "extractor": "text-utf8@1"            // which extractor produced text.md (provenance)
}
```

This *is* the "graph" seed: `tags`, `modality`, and `source` are the edges a future graph view (or an embedding-cluster view) would draw on. v1 keeps it flat; the schema is forward-compatible with typed relations (§8).

---

## 4. Ingestion pipeline (per modality)

`ingest(KG_ROOT, { srcPath, title?, tags?, caption?, modality? })`:

1. **Detect modality** from extension/MIME (`detectModality`).
2. **Copy** the raw artifact to `docs/<docId>/original.<ext>` (so nothing is lost).
3. **Extract text** (`extractText`) per modality → `text.md`.
4. **Chunk** the text (`chunkText`) into ~1.2 KB windows on paragraph/line boundaries with small overlap.
5. **Append** one `index.jsonl` line per chunk; write `meta.json`.

| Modality | v1 extraction | Status |
|---|---|---|
| **Markdown / text / code / CSV / JSON / YAML / logs** | Read UTF-8 verbatim (already text). Title from first `# heading` or filename. | ✅ **v1** |
| **Images** (png/jpg/gif/webp/svg) | No OCR yet. Searchable text = `title + caption + tags + filename`. Original bytes stored for future vision/OCR. Demonstrates the multimodal data model end-to-end. | ✅ **v1** (metadata-level) |
| **PDF** | Best-effort: shell out to `pdftotext` (poppler) **if present on PATH**; else store original + mark `extractor:"pending"` so a later pass can fill it in. No new bundled dep. | ⏳ follow-up (hook present) |
| **Spreadsheets** (xlsx) | Flatten cells to CSV-like text. Needs a parser dep. | ⏳ follow-up |
| **Office docs** (docx/pptx) | unzip + XML text extraction. | ⏳ follow-up |
| **Image OCR / vision captions** | Run an OCR/vision pass over stored originals to enrich `text.md`. Originals are already retained for exactly this. | ⏳ follow-up |

**v1 ships 2 modalities end-to-end** (text-family + images), exactly as the dispatch suggested, with PDF wired as a best-effort hook and everything else listed as honest follow-up rather than half-built.

---

## 5. Retrieval (the `kg` CLI — agent-facing)

A pure-JS `.cjs` (`resources/kg.cjs`) using only `node:fs`/`node:path`. Resolved at spawn the same way as `md-slack-reply.cjs` and injected as `KG_CLI`; the store as `KG_ROOT`.

```
kg search "<query>" [--limit N] [--json]   # ranked snippets (default human-readable)
kg list                                     # all artifacts (title, modality, tags, id)
kg get <docId>                              # full extracted text of one artifact
```

**Scoring (`scoreChunk`):** tokenize the query (lowercase, alphanumeric, drop stopwords); a chunk's score = Σ term-frequency over query terms, **+ title-match boost**, **+ exact-phrase bonus** when the full query substring appears. Rank desc, return top-K with `{ docId, title, source, modality, score, snippet }` where `snippet` is a window around the best match. Deterministic; no deps; same code path the in-app search uses, so results match.

**Empty/zero states:** flag off → CLI prints a one-line "Knowledge Graph is disabled" and exits 0; no results → "no matches".

### 5.1 How the agent learns about it

One flag-gated line appended to the injected system prompt (`hive.ts injectedPrompt`), beside the MemPalace line, **volatile-free** (references the `$KG_CLI`/`$KG_ROOT` env vars, not interpolated absolute paths or counts — preserves the prompt-cache invariant):

> *Enterprise knowledge: this org has a private knowledge base of its own documents, policies, and business context. When a task needs that context, run `node "$KG_CLI" search "<query>"` to retrieve relevant passages (use `kg list` to see what's available, `kg get <id>` for a full document). Prefer it over guessing about company-specific facts.*

The line only appears when `knowledgeGraph.enabled` is true (the manager's `active()`), so agents in a default install never see it.

---

## 6. Where it plugs into the harness (all additive)

Mirrors the MemPalace / Slack wiring 1:1 so it composes with existing code and other in-flight branches:

| Layer | File | Change |
|---|---|---|
| **Core logic** | `src/main/kg-core.cjs` (NEW) | Pure-JS: `ingest`, `search`, `list`, `getDoc`, `removeDoc`, `detectModality`, `extractText`, `chunkText`, `tokenize`, `scoreChunk`. Shared by main, the CLI, and the test (same pattern as `slack-trigger.cjs`). |
| **Agent CLI** | `resources/kg.cjs` (NEW) | Thin `node:fs` wrapper over `kg-core.cjs` exposing `search`/`list`/`get`. Added to `electron-builder.yml` `extraResources` + `tools/copy-main-assets.cjs` + `electron.vite.config.ts` sidecar copy. |
| **Manager** | `src/main/knowledge.ts` (NEW) | `KnowledgeManager`: `active()`, `env()` (→`KG_CLI`,`KG_ROOT`), `ingestFile()`, `search()`, `list()`, `get()`, `remove()`, `status()`. `require()`s `kg-core.cjs` like `slack.ts` does its sidecar. |
| **Config** | `src/main/config.ts` | Add `KnowledgeGraphConfig { enabled?; rootPath? }` + `knowledgeGraph?` on `HarnessConfig`; default `{ enabled: false }`. |
| **Config mirror** | `src/renderer/src/store/config.ts`, `src/preload/index.d.ts` | Mirror the type (hand-mirrored, per repo convention). |
| **Spawn** | `src/main/index.ts` (~1251), `src/main/hive.ts` (`ensureAgent`, `injectedPrompt`) | Pass `knowledgeGraph: knowledge.active()` into `ensureAgent`; merge `knowledge.env()` into spawn env; add the flag-gated `knowledgeLine`. |
| **IPC** | `src/main/index.ts` | `kg:status`, `kg:list`, `kg:search`, `kg:ingestFiles`, `kg:get`, `kg:remove`. |
| **Preload** | `src/preload/index.ts` (+`.d.ts`) | `window.cth.kgStatus/kgList/kgSearch/kgIngestFiles/kgGet/kgRemove`. |
| **Settings UI** | `src/renderer/src/components/SettingsModal.tsx` | A "Knowledge Graph" section: enable toggle + doc count + "Add files…" (OS dialog) — minimal, mirrors the Slack/webhook blocks. |
| **Tests** | `test/kg-core.test.cjs` (NEW) | `node test/kg-core.test.cjs` — tokenize/chunk/score + ingest→search round-trip over text + image fixtures (matches `test/slack.test.cjs` convention). |

**Boundary discipline:** every edit to a shared file (`index.ts`, `preload`, `hive.ts`, `config.ts`, `SettingsModal.tsx`) is a self-contained additive block — no reordering, no reformatting of unrelated code — so it merges cleanly alongside other agents' branches.

---

## 7. Security & safety

- **Flag default OFF.** When off: `active()` is false → no env injected, no prompt line, no IPC effect, no store created. Provably zero behaviour change.
- **Local only.** The store lives under `userData`; nothing is uploaded. The `kg` CLI is read-only over local files.
- **No secret handling.** Unlike Slack/webhook, KG has no tokens; the CLI needs no auth because it only reads local files the user already owns.
- **Path safety.** `docId`s are app-generated (never user-controlled path segments); ingestion copies into `docs/<docId>/` so a malicious filename can't escape `KG_ROOT`.
- **Size guards.** Per-file and total-corpus byte caps (configurable) prevent a huge artifact from bloating `index.jsonl`; oversize files are stored but truncated in the index, surfaced in `meta.json` (never silently dropped).

---

## 8. Forward path (explicitly deferred — listed, not half-built)

1. **More modalities:** PDF (poppler hook → bundled parser), xlsx/docx/pptx, image **OCR/vision** enrichment over the already-stored originals.
2. **FTS5 index:** swap the keyword scorer for SQLite FTS5/BM25 (free with `better-sqlite3`), fronted by a loopback query endpoint so the out-of-process CLI keeps its native-free contract. Agent interface unchanged.
3. **Embeddings / semantic search:** reuse MemPalace's local embedder to add a vector index; `kg search` blends keyword + semantic. Agent interface unchanged.
4. **True graph layer:** promote `tags`/`source`/`modality` + extracted entities into typed relations; optionally a renderer view (distinct from Jim's message graph).
5. **MCP surface:** wrap the same store in an MCP server for typed tool-call access when an agent benefits from schema'd queries — behind the same data + the same flag.
6. **Renderer management panel:** drag-drop ingestion, per-doc preview, re-index, delete — beyond the minimal Settings toggle shipped in v1.
7. **Packaging verification:** confirm `KG_CLI` resolves under `process.resourcesPath` in a packaged build (v1 is validated in dev/worktree via tests + direct CLI runs, matching the dispatch bar of typecheck + tests green).

---

## 9. Definition of done (this pass)

- ✅ This design doc, committed to `feat/knowledge-graph`.
- ✅ v1 vertical slice behind `knowledgeGraph.enabled` (default off): **ingest → store → agent-retrieval** for **text/markdown + images**, with the `kg` CLI taught to agents via the injected prompt.
- ✅ `npm run typecheck` clean; `node test/kg-core.test.cjs` green.
- ✅ Remaining modalities/work listed above as follow-up, not half-implemented.
- ✅ Done report to god (god QAs + merges to local main; this branch is not pushed/merged by me).
