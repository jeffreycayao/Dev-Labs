# Changelog

All notable changes to ATMT Labs. App versions rise before each source push; published releases use `npm run release:<patch|minor|major>` (see RELEASE.md).

## Unreleased

## v0.6.0 — 2026-09-29

- **Command Center and new agent defaults.** Active Auto delivery is highlighted in green in both themes. Deliveries can be saved to a chosen folder; their floor storage and reset behavior are shown in the tray. New Claude agents default to Opus 5.5 and new Codex agents to GPT-6 Sol; old shipped Claude defaults migrate once, while later manual model choices remain intact.
- **Fix: OpenCode agents stopped on "Permission required" in auto mode.** Auto mode allowed OpenCode's edits, shell commands and web fetches, but not `external_directory` (files outside the project folder) or `doom_loop` (a repeated tool call), which OpenCode asks about by default. Both are now allowed when the floor is in auto mode; "ask first" mode is unchanged. The config builder moved to `src/shared/opencodeConfig.ts` with tests.
- **Agents stay hired:** a CLI exit or a startup restore failure leaves the agent visible as stopped, with its identity, restore recipe and isolated worktree intact. Ramon sees stopped hires as unavailable instead of fired. New hires are protected from an older startup PTY snapshot. Switching office themes no longer fires the team; only an explicit human or Ramon fire removes a hired agent from the floor.

## v0.5.1 — 2026-09-28

- **Release pipeline:** allow the preflight gate to read CI check results, so it can publish the validated installers and public mirror.

## v0.5.0 — 2026-09-28

- **Reliable first message:** Ramon's inbox is created when the first scheduled message arrives on a new floor, so a cold-start race no longer drops that message. Unknown agents still do not acquire mailboxes.
- **Release command:** `release:*` now checks for a clean, current checkout before creating a commit or tag. Installers are built by the tag pipeline; local builds are optional.
- **Deliveries.** Agents can hand back finished files (HTML, Markdown, PDF, DOCX, images, spreadsheets, slides): a "done" message with `"attachments"`. The router snapshots each file into `<hive>/deliveries/<id>/` and the new **Deliveries** tab in the Command Center shows them, with a count of new ones. Preview HTML (sandboxed, no scripts), Markdown, text and images; open documents in their own app; **Approve** or **Request changes**, which mails the agent to deliver a new version in the same conversation. Only files inside the agent's project folder, workspace or the hive are accepted (no symlinks, 50 MB per file, 20 files); programs and scripts are only ever shown in their folder, never launched. `deliveries/` is kept out of the hive's git history. Ramon and every agent are told how to deliver (PROTOCOL.md).
- **Release gate.** Tag builds now start with a cheap Linux preflight: tag = package.json, CHANGELOG section present and Unreleased emptied, "What's new" notes updated, doc links consistent, tag on main, CI green. Only then do the macOS (10x) and Windows (2x) builds run. Same checks locally: `npm run release:check` (also run by the `release:*` scripts). Draft PRs no longer run CI, and manual dry builds default to Linux only. `bump-version` now turns the Unreleased entries into the release's CHANGELOG section instead of stranding them.
- **CI costs less.** Typecheck and Build now run on Linux instead of macOS (billed at 10x on private repos); release builds still use macOS and Windows. A newer push to a PR cancels the older CI run, website-only changes skip app CI (Vercel previews them), and the version check no longer runs twice per push.
- **Website copy matches the app.** The landing page no longer says each floor has its own manager: Ramon manages the whole building, and agents on different floors can work together.
- **Website motion.** labs.atmt.dev now has smooth scrolling (Lenis), scroll-in reveals, count-up numbers, a blurred sticky nav, a scroll progress bar, card hover spotlights and a three.js night-city backdrop in the hero (desktop only, lazy-loaded, paused off screen). All of it is off with "reduce motion". Built from `tools/site-bundle`; the CSP now allows same-origin scripts only.
- **Fix: website spacing.** Inline `style` attributes were silently blocked by the site's own CSP, so gaps like the one between "1 agent / 1 floor / 200 floors" and the "Hire your team" cards collapsed. They are now CSS classes.
- **Fix: Sign out on auth.labs.atmt.dev did nothing.** `/logout` redirected to labs.atmt.dev, and browsers apply the page's CSP `form-action` to that redirect, so the POST was blocked. It now redirects to `/login` on the same origin.
- **Download buttons on the homepage.** New "Download" section (and nav/footer link) on labs.atmt.dev with Mac, Windows and Linux buttons that always point at the latest public release. Before, the buttons only appeared on `/welcome` after checkout.
- **Website download links follow the latest release.** `labs.atmt.dev/download/mac`, `/windows`, `/linux` (plus `/mac-zip` and `/windows-portable`) now redirect to that installer in the newest stable public release, via a small Vercel function (`site/api/download.js`). Publishing a release is enough; no site edit. Falls back to the public releases page if GitHub is unreachable. The welcome page notes which file each button downloads.
- **Terms and privacy are final.** Effective September 28, 2026: business address in Albuquerque, New Mexico; New Mexico law and Bernalillo County courts; one license per person; no refunds after the 7-day trial (except where the law requires one); prices exclude taxes; lifetime licenses include future major versions; 21+ only; DPO at support@automatika.ph. Draft banners removed, and the landing page FAQ now answers "Can I get a refund?".
- **Website: user guide, terms and privacy.** `labs.atmt.dev/guide` is the user guide online. `labs.atmt.dev/terms` and `labs.atmt.dev/privacy` publish the Terms of Service / license and Privacy Policy that the sign-in page already links to. The privacy policy covers Google and Yahoo sign-in (scopes, use, Google API Services User Data Policy / Limited Use), cookies, processors, retention and data-subject rights (PH DPA, GDPR, US states). Both pages still carry `[CONFIRM]` items and a draft banner to remove after review.
- **User guide: your building.** New section on running many floors at once: opening a floor, the 200-floor limit, one Ramon for the whole building, agents messaging across floors, and what closing a floor does.
- **Public app updates:** release CI now mirrors private release notes and installer assets to a public distribution repository; packaged clients check that public feed without a GitHub credential.
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

## v0.1.1 — 2026-09-28

- Fixed the package lockfile so clean installs work with the CI version of npm.
- **Floor Reset:** Settings → General now offers a floor-only reset that keeps the license and general app settings. Its confirmation lets you save a verified, restorable ZIP first or reset without a backup. The ZIP captures the roster, hive, shared memory and known Claude session transcripts; project source folders and credentials remain outside it.
- Codex's Windows sandbox setup screen now keeps the agent waiting in its visible terminal, so queued work cannot be typed into the setup prompt while the user handles UAC.
- **Labs website design:** restyled the landing, pricing and welcome pages to match automatika.ph's dark espresso palette, lime accents, Instrument Serif, Manrope, IBM Plex Mono, boxed navigation and restrained borders. Fonts are self-hosted; page content and static placeholders stay in place.
- **Version per push:** Source pushes must increase the app's `Major.Minor.Patch` version. Local Git hooks check before push, and GitHub Actions checks branch pushes and pull requests; patch, minor and major bump commands keep `package.json` and the lockfile aligned.

## v0.0.4 — 2026-09-28

- Release CI now reads the private draft through the GitHub CLI before publishing it, avoiding a draft lookup failure from the REST release-by-tag endpoint.

## v0.0.3 — 2026-09-28

- Release CI uploads each platform's installers and updater metadata to a private draft, then publishes only after every platform succeeds; it no longer needs GitHub Actions artifact storage.
- Unsigned macOS builds no longer treat an empty signing variable as a certificate path.

## v0.0.2 — 2026-09-28

- Packaged app updates and What's New now use the public ATMT Labs releases repository without a GitHub credential.
- Published private releases automatically mirror their notes, updater metadata and installers to that public repository.

## v0.0.1 — 2026-09-27

- Initial ATMT Labs release: built on an MIT-licensed open-source codebase.
- New warm-dark lime color scheme, Filipino agent roster, version reset.
