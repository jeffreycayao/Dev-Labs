# Changelog

All notable changes to ATMT Labs. Versions are bumped with `npm run release:<patch|minor|major>` (see RELEASE.md).

## Unreleased

- Fixed Ramon switching from Claude to Codex: use a supported ChatGPT sign-in model, repair the old model if a failed switch saved it, surface Codex's folder-trust prompt, detect immediate startup exits, and restart the previous engine when a switch fails (with an explicit warning if its conversation cannot resume).

## v0.0.1 — 2026-09-27

- Initial ATMT Labs release: built on an MIT-licensed open-source codebase.
- New warm-dark lime color scheme, Filipino agent roster, version reset.
