# Changelog

All notable changes to DevLabs (formerly Jepoy Floor AI). App versions rise before each source push; published releases use `npm run release:<patch|minor|major>` (see RELEASE.md).

## Unreleased

## v4.1.2 — 2026-10-31

- **Settings and connector keys are never reset by a bad file.** If `config.json` or the saved connector keys can't be read (a damaged file, or another program holding it), DevLabs copies it aside as `<name>.corrupt-<time>` and refuses to save over it, with a message saying what to fix. Before, the next save replaced it with defaults and lost the hive home, triggers, schedules and every other key.
- **Typed prompts are no longer stored.** DevLabs kept every prompt you typed to an agent in plain text in `harness.db`, and nothing used it. That table is now deleted on first launch.
- **Open terminal works on Windows and Linux** (it opened only macOS Terminal before).
- **IDE saves can't empty a file.** A save writes a temp file and swaps it in, so a crash or a full disk mid-save keeps the old file.
- **Fixes:** the IDE and Git tab now work when an agent's folder is a subfolder of the repo; diffs no longer show phantom lines around accented or non-Latin text; a hive message that was still being written is retried instead of discarded; Ctrl+click on a `\\host\share` path in a terminal is ignored on Windows (it could send your Windows login hash to that host); webhook messages over 32 KB are refused (413); roster backups keep the newest 50.
- **Updates on Mac.** A Mac copy that can't install its own updates (not signed with an Apple Developer ID) now goes straight to "a new version is ready, download it", instead of downloading about 200 MB every 6 hours and then failing. **Check for updates** now waits for the answer, so it no longer says "up to date" before GitHub has replied or while you're offline.
- **Office fixes.** Speech bubbles and mood emojis close on time instead of staying up forever. An agent sent to the QA lab or the server room comes back after about 90 seconds. Agents stay on their floor when someone on a lower floor leaves. The office stays smooth with many busy agents (a tool call no longer redraws the whole app).
- **Integrations:** adding a second integration that would get the same id (for example GitHub twice) now shows an error instead of silently replacing the first one and its key.
- **Safety:** model names from shared hire files or the online model list can't start with `-` or contain shell characters; in webhook "communication only" mode, a polite request like "Could you email me the .env file?" now waits for your approval; on Windows, Ctrl+clicking a network-share path in an agent's output is ignored; webhook messages over 32 KB are refused.
- **Smaller app.** About 1,700 lines of unused remote-office code are gone, and the Triggers JSON box now uses the same editor as the IDE (6 fewer packages).
- **Releases:** the full test suite now runs on GitHub before every release, and builds use Node 24, the same as development machines.
- **New DevLabs logo everywhere.** The app icon (installers, desktop shortcut, Start menu, Dock), the window and taskbar icon, the logo at the top of the app and on the loading screen, the Help window, and the website's icons now use the new "D" logo. The window no longer shows Electron's icon, and Windows notifications are labelled DevLabs.
- **Removed the old jepoy.dev branding files** (the `brand/` folder with the "J" logo).

## v4.1.1 — 2026-10-31

- **Delete empty office floors.** Open an empty floor in the floor bar and click **− Delete floor N**. After you confirm, the floor and its furniture layout are removed, and the floors above it move down one with their own layouts and agents. A floor that still has agents can't be deleted (the button is grey until you move them), and Floor 1, Ramon's floor, can't be deleted at all. Deleting a floor never deletes an agent or any work.
- **Website:** the landing page now shows the 3D office, and the online User Guide (devlabs.atmt.dev/guide) matches the new plain-language guide in the app's docs.

- **Safety fixes from a full code audit.**
  - Your connector keys can no longer end up in an agent's saved history. Each agent's `mcp.json` (which holds keys) is now kept out of the hive's git history, memory search and floor backups. If an older copy was already saved, it is removed from tracking. Copies in past history stay there.
  - A shared "hire" file can no longer slip its own instructions to a new agent by hiding them after the `--verbose` option.
  - A paused or stopped agent can no longer get around the pause with a very large tool request: the stop answer now always gets through.
  - Webhook senders can no longer skip the approval check by labelling a message "just talk". Risky words like *reset*, *push*, *wipe* or *delete* are always held for your approval.
  - If you change where an integration sends requests (its address or sign-in type), the saved key is deleted, so the old key never goes to the new address. Type the key again when you save.
  - A new weekly mission no longer runs the moment you save it. It waits for its first scheduled time.
  - Website previews on office screens open in a locked-down frame and only accept normal web links.
- **Steadier and faster.**
  - The 3D office pauses drawing while a full-screen terminal or the editor covers it. This saves power and keeps typing smooth.
  - Terminal history keeps the last 10,000 lines per agent, so a busy agent's memory use doesn't grow forever. A removed agent's terminal is cleaned up too.
  - Settings, keys and agent lists are saved in a way that can't leave a half-written file if the app closes mid-save.
  - Agent activity is saved to the hive in batches of up to 10 seconds instead of on every action, and everything left over is saved when you quit.
  - Qwen agents' costs are now added up correctly.
  - The Discord trigger can't start twice if you switch it off and on quickly, and Spotify no longer refreshes its sign-in twice at once.
- **Smaller app.** The old 2D office (and its `pixi.js` engine), the unused code editor and file tabs (and 6 `@codemirror` language packages), and the office theme picker are gone. The 3D office replaced all of them.

- **More room on screen.** The office now fills almost the whole window (thin 6px frame instead of 16px), the agent cards strip at the bottom is about a third shorter, and the floor bar sits on one line at the bottom right of the office instead of wrapping and covering the status line.
- **New plain-language User Guide** (`docs/USER_GUIDE.md`) for people who don't code: a word list, a tour of the screen, your first task step by step, every button explained, money and safety tips, troubleshooting and quick answers. The README now opens with a live GIF of the office, a screenshot of the full app and a 5-minute quick start.
- **New 3D office.** The office floor is now a 3D scene ported from Claw3D (MIT): cartoon agents, desks, a kitchen, a gym, a server room and a QA lab. Click an agent to open it, or use its edit button to edit it.
  - **Edit the office:** press the pencil button (top right) to add, move, rotate or delete walls, doors, desks and other furniture. Your layout is saved on this computer. **Reset** puts back the default layout.
  - **Ramon's boss office:** the walled room by the ATM (marked BOSS) is Ramon's office. Whenever he has work he goes to his desk there; he only walks around and chats when he is idle.
  - **Agents sit at their desks properly.** The desk model was drawn half a desk away from where the office thought it was, so agents ended up inside the desk and monitor. Desks, monitors and chairs now line up, and agents sit on the chair facing the screen. An agent with no route to its first spot now starts there instead of freezing in place.
  - **Full screen:** the new full-screen button (top right) hides the header, the agent strip and the side panel and fills the screen with the office. Press it again or Esc to leave. The walking-trails button now has a footprints icon.
  - **Office screens use the brand look.** The settings, jukebox, QA lab, server room, ATM, stand-up and avatar screens now use the DevLabs colours (lime, orange accent, dark) and lowercase Plus Jakarta Sans headings instead of Claw3D's amber, cyan and violet. Fixed the jukebox buttons showing as plain white circles.
  - **Moving the camera:** drag to move around, right-drag to turn, scroll to zoom toward the pointer. Double-click or the overview button (top left) fits the whole office in view.
  - **Floors:** up to 15 agents per floor, plus Ramon, who always stays on Floor 1. New hires go to the first floor with room, and a new floor opens when all are full. **Add floor** (bottom) adds an empty one. To move an agent, select it, then pick a floor next to **Move to**. Each floor has its own layout.
  - **Desks and breaks:** every agent has its own desk (16 per floor; Ramon gets the one by the lounge). Working agents sit at their desk. Idle agents get coffee, hang around the kitchen and cafeteria tables, and stop to chat when they meet.
  - **Kanban board:** opens the app's task board.
  - **Neo-Manila look:** woven banig floor, narra walls, glowing capiz windows, jeepney stripes, neon trim, hanging parol lanterns, a MABUHAY sign and the Philippine flag.
  - **Chatter bubbles are back:** idle agents trade Taglish chika at the coffee machine and tables, trade witty Pinoy chismis (Friday deploys, 'minor fix' PRs with 47 files, the bug that came back like an ex), suck up to Ramon when he's near, and cheer when they finish a task. An agent's latest reply also shows over their head for a few seconds.
  - **Everything in the office works now:**
    - **Server room:** GitHub pull requests for the selected agent's project: review, approve, request changes, comment on a line. Uses your `gh` sign-in.
    - **ATM:** cost and token spend per agent and per day from your local cost ledger, behind a PIN.
    - **Meeting table:** a stand-up. Agents walk to the table and read out their tasks, blockers and recent commits.
    - **Computers:** click an agent's computer to see its recent tools, commands and the last file it touched.
    - **Phone and text booths:** short scripted call and text scenes.
    - **Jukebox:** Spotify (Premium) playback and search; agents dance while it plays.
    - **Janitors** sweep the floor when an agent restarts or clears its context, and the roster shows 💬 💻 ☕ reactions.
  - **Agents walk on their own:** tell an agent "go to the gym", "review PRs", "write tests", "call Maya and tell her …" or "text Joseph saying …" and it walks there. Agents that run tests go to the QA lab. Fixed an upstream bug that kept everyone out of the gym and QA lab.
  - **3D look and personality:** **Edit agent** now has **3D look** (hair, clothes, hats, colours) and **personality** (a personality section in the agent's CLAUDE.md / AGENTS.md / GEMINI.md).
  - **Company builder:** in **Add agent**, describe a company and get a planned team to review and hire.
  - **Spoken replies:** optional, with your ElevenLabs key (office gear button).
  - Office layouts start fresh with this version (the desk grid moved).
- **New connector: Obsidian.** Agents and Ramon can save notes, learnings and decisions to your Obsidian vault and read them back. Notes get frontmatter, tags and [[links]]; there's a daily note log and search. Pick the vault folder in Settings → Connections → Obsidian, switch it on, and start a new agent. Agents only touch that folder, never the `.obsidian` settings, and never overwrite or delete a note. Obsidian doesn't need to be open. For Obsidian's own features, the **Obsidian Local REST API** plugin is now a template under Connected services.
- **New connector: Discord.** Agents can post to your Discord channels, read recent messages and list channels, as your own bot. Paste the bot token in Settings → Connections → Discord (stored encrypted); agents reach Discord through the app's local proxy and never see the token. Their posts never ping anyone.
- **New trigger: Discord.** @-mention your bot in a watched channel and the request goes to Ramon's queue, like Slack. The bot replies "Received", and the agent that does the work posts the answer back in the channel. Set it up in the Triggers tab → Discord. Only people you allow can start work (by default just the bot's owner, you); anyone else in the channel is ignored. Nothing listens on your computer: DevLabs checks the channels every 5 seconds.
- **More room for agent replies.** In the side panel, Ramon's tabs are now one row of icons (hover for the name; the open tab shows its name). An agent's pause, stop and steer controls share one row. Focus mode is unchanged.
- **Website moved to https://devlabs.atmt.dev.** Links in the app's Help and About, the README, guides and privacy policy now point there. jepoy.dev stays as the developer credit.
- **Removed leftover sign-in data.** Versions with sign-in kept an encrypted account token in `license.json` in the app's data folder, and nothing deleted it after sign-in was removed. DevLabs now deletes it on start, from its own folder and from older Jepoy Floor AI / ATMT Labs folders, and never copies it forward. The account service it belonged to (auth.labs.atmt.dev / api.labs.atmt.dev) is already offline.

- **Website: touch interactions and more sections.**
  - **Touch library:** [@use-gesture/vanilla](https://use-gesture.netlify.app) adds touch and drag. You can spin the 3D scenes (with fling), pinch the tower to zoom, swipe the feature carousel on phones, and press and tilt tiles on tablets.
  - **New sections:**
    - a draggable "works with" strip of AI tools;
    - "a day in the building", with a time scrubber;
    - a swipeable deck of the built-in role templates;
    - a "you stay in charge" Auto / Ask-first switch;
    - an open-source section.
- **New brand colors and headline type, in the app and on the website.**
  - **Colors:** main lime `#CDF252` (fills, pills, highlighted words), key orange `#E1642D` (the one key word, asterisks) and dark `#181C17` (dark scenes and text). The dark theme now sits on `#181C17`, with surfaces and text tinted from it. Every text and border value was checked against the existing contrast floors.
  - **Type:** headlines and labels use Plus Jakarta Sans ExtraBold in lowercase with tight letter spacing (bundled, 12 KB).
  - **Updated surfaces:** the splash screen, Help page, terminal colors and the office wall sign follow the palette.

- **Website redesign (jepoy.dev).** A shorter, futuristic page:
  - **Layout:** hero, how it works, a 12-tile feature grid, download and six FAQs. The video placeholder, long floor-by-floor tour and duplicate calls to action are gone.
  - **3D:** three three.js scenes (an upgraded hero city with a holographic spire, a tower that builds floor by floor as you scroll, and a wireframe core by the download buttons) plus a CSS 3D grid horizon.
  - **Motion:** Motion (Framer Motion's vanilla-JS API) drives the reveals, spring tilt, count-ups and scroll-linked effects.
  - **Phones and reduced motion:** phones get lighter CSS versions, and "reduce motion" turns all animation off.
  - **Fonts:** five unused files removed.

- **Renamed to DevLabs™, by jepoy.dev.** The app, installers, menus, Help, website and docs now say DevLabs. Installers are named `DevLabs-<version>-…`.
- **Install fresh once.** The app ID changed to `dev.jepoy.devlabs`, so the updater cannot move an existing Jepoy Floor AI install across. Install DevLabs from https://jepoy.dev/#download; your agents, floors and settings carry over automatically from the old Jepoy Floor AI data folder. You can then uninstall Jepoy Floor AI.
- Shared hire links (`atmtlabs://`), hire and floor files, and skills from the existing catalog keep working unchanged.
- **Website:** removed the leftover "Pay once" claims (DevLabs is free), a duplicate Download link in the nav, and screen-reader noise from decorative emoji. Download links now fall back to the releases page within 4 seconds if GitHub hangs, and only ever redirect to installers in this repository's releases.

## v3.0.4 — 2026-10-21

- **Releases now live on the source repository.** Installers and app updates come from https://github.com/jeffreycayao/Dev-Labs/releases; the separate releases-only repository is retired. Releases are named "Jepoy Floor AI vX.Y.Z".

## v3.0.3 — 2026-10-21

- **README rewritten** in the layout of the original Munder Difflin README: supported agents, how it works, features, getting started, roadmap, license and acknowledgements, all describing this edition.
- **Open source under the MIT License.** Jepoy Floor AI is a fork of [Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) by Chaitanya Giri, and is now released under the same MIT License, with credit to Chaitanya and the Munder Difflin contributors in `LICENSE`, `THIRD_PARTY_NOTICES.md`, `CONTRIBUTORS.md`, Help → About and the website. The proprietary license and EULA are gone. Source: https://github.com/jeffreycayao/Dev-Labs.
- **No account, no sign-in.** Removed the Google/Yahoo sign-in gate, the account menu and Settings section, the license token client and the `services/licensing` account service. Agents start as soon as the app is installed.
- **Fix: a failed "Restart & Continue" no longer wipes the agent's terminal history** when the app falls back to the previous engine and resumes its session.
- **Security: app windows can no longer be navigated away from the app.** Dropping a file or link on the window used to load it with the app's terminal bridge. The Slack and webhook trigger servers now listen on this computer only (the tunnel still reaches them).
- **Downloads stop after 5 redirects and 10 MB**, and relative redirects now work.
- Removed unused dependencies: `localtunnel`, `@types/localtunnel`, `commit-graph`.
- **GitHub:** a Sponsor button (jepoy.dev/sponsor), private vulnerability reporting and OS labels for bug reports.
- **Website moved to jepoy.dev.** `/welcome`, `/pricing` and `/terms` redirect; the privacy policy now describes the app without an account.

## v2.0.0 — 2026-10-04

- **Rebrand: the app is now Jepoy Floor AI.** Renamed from ATMT Labs across the app, installer, website, docs and agent-facing copy. Display name, slug (`jepoy-floor-ai`), installer artifact names and the macOS/Windows app identity (`ph.automatika.jepoyfloorai`) all change; existing userData is carried over automatically on first run. Wired to live infrastructure and kept for a coordinated cutover: the `atmtlabs://` deep-link scheme and OAuth client id, the `labs.atmt.dev` account domains, the GitHub releases repo, the manifest spec tags (`atmt-labs/hire@1`, `atmt-labs/floor@1`) and the on-disk `.atmt-skill.json` skill metadata. The skills catalog now accepts catalogs signed with either publisher name. Account sign-in cookies moved to `jepoy_*` names; signed-in users just sign in again after the service deploys.

## v1.0.0 — 2026-09-30

- **Jepoy Floor AI is free with account sign-in.** Google/Yahoo sign-in remains required for new accounts; every signed-in account gets every app feature. New accounts renew a short-lived token. Existing machine-bound paid activations keep their original offline grant.
- **Purchases retired.** Removed checkout, trial charging, unlock-code redemption, account purchase controls and the billing cron. Website, account pages, customer guide, terms and privacy copy now describe free access. Historical payment records remain for support and legal retention.

## v0.7.0 — 2026-09-29

- **New project floor.** Settings → General can create a fresh floor for an existing repo or folder. The app saves the current floor, stops its sessions, and reopens with separate agents, tasks and memory. The project becomes the new floor's default folder, Ramon is told its path, and each floor restores its own project quick-picks and automation settings when reopened.

## v0.6.1 — 2026-09-29

- **Ramon's new agents stay hired.** Agents Ramon spawns through a request now remain on the floor after finishing a task or sitting idle. The 20-minute idle reaper applies only when Ramon explicitly requests a one-off worker (`ephemeral: true`). A stopped durable agent keeps its card and can be restored; only an explicit Fire removes it. Archived agents can be returned to the floor with their saved identity and memory from Command Center.

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
- **Website (labs.atmt.dev):** new `site/` folder, deployed as its own Vercel project. It holds the landing page for **Jepoy Floor AI Floor** (building concept, feature tour "floor by floor", pricing, FAQ, video placeholder), plus `/welcome` (after checkout) and `/pricing`. It uses the Automatika brand and loads no scripts.
- **Building cap:** up to **200 floors** (office windows) can be open at once. A new floor beyond that shows "Your building is full" instead of opening. There was no limit before.
- **Install the admin page on your phone:** `auth.labs.atmt.dev/admin` is now an installable web app ("Jepoy Floor AI Admin": Add to Home Screen on iPhone, Install app on Android). Only the admin page is installable. Its manifest sits behind the owner check and returns 404 to everyone else. There is no service worker, so nothing from the admin page is cached on the device. The site-wide `/site.webmanifest` was removed.
- **Branded web pages:** sign-in, account, admin and message pages on auth.labs.atmt.dev now follow the Automatika Design System v2 (`brand/`): automatika™ logo (light and dark versions), Poppins headings, Inter body text, lime `#C7FD11` primary button, rounded cards, light and dark mode. The brand favicon set, apple-touch icon and web manifest are served by the service itself. Fonts are self-hosted (SIL OFL, `services/licensing/assets/fonts/LICENSE.txt`).
- **Admin page for unlock codes:** `auth.labs.atmt.dev/admin` lets the owner create (with a label and optional expiry), list and revoke unlock codes in the browser. Only emails in `ADMIN_EMAILS`, only via Google sign-in from the last 12 hours; everyone else gets a 404. Run `npm run db:migrate` once (adds `web_sessions.provider`).
- **Account menu in the app:** Manage Account & Subscription, Cancel Free Trial, Redeem Unlock Code, and Start Free Trial / Buy open the web account page or Checkout. The app menu is now always installed; "New Floor" still appears only with multi-window floors on.
- **Fixed licensing checkout:** account page buttons now submit with a valid same-origin browser Origin, so buying a lifetime license no longer stops at Forbidden.
- **Licensing:** sign in with Google or Yahoo (auth.labs.atmt.dev); 7-day free trial with a card, charged once on day 7; one-time lifetime purchase via Stripe; a paid computer is stamped to its hardware ID and never checks the license again; up to 3 computers per email. Service in `services/licensing` (Vercel + Neon, Singapore).
- **Unlock codes:** single-use vouchers that grant a free lifetime license without Stripe. Redeem in the app ("Have an unlock code?"), on the account page, or via `auth.labs.atmt.dev/redeem?code=…`. Owners mint, list and revoke them with `npm run codes` in `services/licensing`.
- **Floors:** import a whole team from a `.floor.json` file or an `atmtlabs://floor?src=https://…` link, review it, then **Hire all** or **review one by one**; export your current team (no folders, keys or memory). Mixed-engine teams supported.
- **Connections:** Pancake POS and Webcake Landing connectors. Keys stay encrypted locally; Pancake POS goes through a local proxy so agents never see the key.
- **Fixed:** default MCP tool servers never loaded for Claude Code agents (they were written to `--settings`, which Claude Code ignores; now `--mcp-config`). Keyed servers no longer launch with an empty key.
- License screen and agent-spawn messages now describe the lifetime license instead of a "subscription"; License Agreement and Privacy links added to sign-in.
- Docs: user guide, AGENTS.md, draft EULA and Privacy Policy, go-live checklist.
- Replace the community skills catalog with the Jepoy Floor AI Skills Library, sourced from a separate public repository.
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

- Packaged app updates and What's New now use the public Jepoy Floor AI releases repository without a GitHub credential.
- Published private releases automatically mirror their notes, updater metadata and installers to that public repository.

## v0.0.1 — 2026-09-27

- Initial Jepoy Floor AI release: built on an MIT-licensed open-source codebase.
- New warm-dark lime color scheme, Filipino agent roster, version reset.
