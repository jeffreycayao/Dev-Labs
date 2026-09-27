# Handoff — continue on your computer

State as of 2026-09-27. Everything is merged into `main`, with no open pull requests.

## 1. Get the code

```bash
git clone https://github.com/jeffreycayao/ATMT_LABS_FLOOR.git   # or, in an existing clone:
git checkout main && git pull
```

Old branches (`claude/zealous-franklin-490f8o`, `codex/*`) are fully merged. You can delete them.

## 2. Set up and check

```bash
npm ci                     # needs a C/C++ toolchain (Xcode CLT / VS Build Tools)
npm run typecheck
npm run test:focused       # proc-kill.test.cjs may fail in some environments; this is known and predates this work
npm run dev                # run the app

cd services/licensing
npm ci && npm run typecheck && npm test   # 35 tests
```

**Repo map, commands and rules:** [`AGENTS.md`](../AGENTS.md).
**Customer-facing guide:** [`docs/USER_GUIDE.md`](../docs/USER_GUIDE.md).

## 3. What's done

- **Licensing:**
  - Google/Yahoo sign-in, and a 7-day card trial charged once on day 7.
  - One-time lifetime purchase through Stripe.
  - Each computer is stamped once and never checks in again; up to 3 computers per email.
  - Service in `services/licensing`: Vercel + Neon, Singapore.
- **Unlock codes:** single-use free lifetime licenses. Create them with `npm run codes -- create` in `services/licensing`.
- **Floors:** import or export a whole team as a `.floor.json` file or an `atmtlabs://floor` link.
- **Connections:** Pancake POS and Webcake. MCP servers now actually load (`--mcp-config`).
- **Docs:** user guide, AGENTS.md, draft EULA and Privacy Policy, go-live checklist.
- **The app's licensing gate is still OFF** (`LICENSING.enabled = false` in `src/shared/brand.ts`). It stays off until the service is live and the public key is in the app.

## 4. Next: go live

Follow [`GO_LIVE.md`](GO_LIVE.md) step by step. Short version:

| # | Step | Where |
|---|---|---|
| 1 | Create the Vercel project `atmt-labs-licensing`: root `services/licensing`, framework Other, region `sin1` (from `vercel.json`), team AUTOMATIKA | Vercel dashboard or `vercel link` |
| 2 | Add domains `auth.labs.atmt.dev` + `api.labs.atmt.dev` | Vercel → Domains, then the **CNAMEs at Cloudflare** (atmt.dev DNS is on Cloudflare) |
| 3 | Add the Neon database, Singapore region | Vercel → Storage → Neon |
| 4 | Run `vercel env pull .env.local`, `npm run keygen`, `npm run db:migrate` | Your computer, in `services/licensing` |
| 5 | Set up Google OAuth (Yahoo optional), and Stripe in test mode (price, webhook with 5 events) | Google Cloud, Stripe |
| 6 | Run `npm run env:push` then `vercel --prod`, and check `/health` | Your computer |
| 7 | Put the public key into `src/shared/brand.ts` and set `enabled: true` | Claude can do this; send it the **public** key only |
| 8 | Website pages: `/`, `/welcome`, `/pricing`, `/terms`, `/privacy` | labs.atmt.dev |
| 9 | Legal: resolve the `[CONFIRM]` items in `EULA.md` and `PRIVACY.md`, then get a lawyer's review | You |
| 10 | Test end to end in Stripe test mode, then switch to live | You |
| 11 | Decide how installers and updates are hosted (this repo is private), and set up code signing (Apple + Windows) | You, then Claude |

**Vercel connector:** from the cloud session, Vercel returned `403 forbidden` on *create project*. Either do step 1 yourself, or reconnect the connector with a login that can create projects and start a new session.

**Never paste these into a chat or commit them:**
- `LICENSE_SIGNING_KEY`
- `SESSION_SECRET`
- `ACCESS_TOKEN_SECRET`
- `CRON_SECRET`
- Google/Stripe secrets
- `.env.local` itself

They only go from your computer to Vercel, with `npm run env:push`.

## 5. Open decisions

- Should shared hires and floors keep Claude-only flags (`--max-turns`, `--output-format`, `--verbose`) off Codex, Antigravity and Cursor agents? That needs each CLI's flag support confirmed first.
- On hold by your call: Meta Ads MCP and the Meta platform MCPs (WhatsApp, Devtools).
- Roadmap ideas already discussed:
  - one-click setup;
  - ATMT Labs as an MCP server;
  - Zapier/Make/n8n;
  - Telegram/Discord.

## 6. Prompt to continue with Claude Code locally

```
Read .documentations/HANDOFF.md and AGENTS.md. We're at the go-live stage (GO_LIVE.md).
Help me with step <N>. Don't generate or handle secrets; I push them with npm run env:push.
```
