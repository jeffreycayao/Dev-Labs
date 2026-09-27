# Changelog

All notable changes to ATMT Labs. Versions are bumped with `npm run release:<patch|minor|major>` (see RELEASE.md).

## Unreleased

- **Website (labs.atmt.dev):** new `site/` folder, deployed as its own Vercel project. It holds the landing page for **ATMT Labs Floor** (building concept, feature tour "floor by floor", pricing, FAQ, video placeholder), plus `/welcome` (after checkout) and `/pricing`. It uses the Automatika brand and loads no scripts.
- **Building cap:** up to **200 floors** (office windows) can be open at once. A new floor beyond that shows "Your building is full" instead of opening. There was no limit before.
- **Install the admin page on your phone:** `auth.labs.atmt.dev/admin` is now an installable web app ("ATMT Admin": Add to Home Screen on iPhone, Install app on Android). Only the admin page is installable. Its manifest sits behind the owner check and returns 404 to everyone else. There is no service worker, so nothing from the admin page is cached on the device. The site-wide `/site.webmanifest` was removed.
- **Branded web pages:** sign-in, account, admin and message pages on auth.labs.atmt.dev now follow the Automatika Design System v2 (`brand/`): automatika™ logo (light and dark versions), Poppins headings, Inter body text, lime `#C7FD11` primary button, rounded cards, light and dark mode. The brand favicon set, apple-touch icon and web manifest are served by the service itself. Fonts are self-hosted (SIL OFL, `services/licensing/assets/fonts/LICENSE.txt`).
- **Admin page for unlock codes:** `auth.labs.atmt.dev/admin` lets the owner create (with a label and optional expiry), list and revoke unlock codes in the browser. Only emails in `ADMIN_EMAILS` (default `jeffreycayao@gmail.com`), only via Google sign-in from the last 12 hours; everyone else gets a 404. Run `npm run db:migrate` once (adds `web_sessions.provider`).
- **Account menu in the app:** Manage Account & Subscription, Cancel Free Trial, Redeem Unlock Code, and Start Free Trial / Buy open the web account page or Checkout. The app menu is now always installed; "New Floor" still appears only with multi-window floors on.
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
