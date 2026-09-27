# Changelog

All notable changes to ATMT Labs. Versions are bumped with `npm run release:<patch|minor|major>` (see RELEASE.md).

## Unreleased

- **Fixed licensing checkout:** account page buttons now submit with a valid same-origin browser Origin, so buying a lifetime license no longer stops at Forbidden.
- **Licensing:** sign in with Google or Yahoo (auth.labs.atmt.dev); 7-day free trial with a card, charged once on day 7; one-time lifetime purchase via Stripe; a paid computer is stamped to its hardware ID and never checks the license again; up to 3 computers per email. Service in `services/licensing` (Vercel + Neon, Singapore).
- **Unlock codes:** single-use vouchers that grant a free lifetime license without Stripe. Redeem in the app ("Have an unlock code?"), on the account page, or via `auth.labs.atmt.dev/redeem?code=…`. Owners mint, list and revoke them with `npm run codes` in `services/licensing`.
- **Floors:** import a whole team from a `.floor.json` file or an `atmtlabs://floor?src=https://…` link, review it, then **Hire all** or **review one by one**; export your current team (no folders, keys or memory). Mixed-engine teams supported.
- **Connections:** Pancake POS and Webcake Landing connectors. Keys stay encrypted locally; Pancake POS goes through a local proxy so agents never see the key.
- **Fixed:** default MCP tool servers never loaded for Claude Code agents (they were written to `--settings`, which Claude Code ignores; now `--mcp-config`). Keyed servers no longer launch with an empty key.
- License screen and agent-spawn messages now describe the lifetime license instead of a "subscription"; License Agreement and Privacy links added to sign-in.
- Docs: user guide, AGENTS.md, draft EULA and Privacy Policy, go-live checklist.
- Replace the community skills catalog with the ATMT Skills Library, sourced from a separate public repository.
- Add pinned, hash-verified Claude Code skill installs and explicit updates with local-edit protection.
- Fixed Ramon switching from Claude to Codex: use a supported ChatGPT sign-in model, repair the old model if a failed switch saved it, surface Codex's folder-trust prompt, detect immediate startup exits, and restart the previous engine when a switch fails (with an explicit warning if its conversation cannot resume).

## v0.0.1 — 2026-09-27

- Initial ATMT Labs release: built on an MIT-licensed open-source codebase.
- New warm-dark lime color scheme, Filipino agent roster, version reset.
