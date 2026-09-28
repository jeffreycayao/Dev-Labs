# Releasing ATMT Labs

Versions follow [semver](https://semver.org) and start at `0.0.1`.

| Command | Bump | Example |
| --- | --- | --- |
| `npm run release:patch` | fixes only | 0.0.1 → 0.0.2 |
| `npm run release:minor` | new features, backwards compatible | 0.0.1 → 0.1.0 |
| `npm run release:major` | breaking changes | 0.0.1 → 1.0.0 |
| `npm run release` | auto — reads commits since the last `v*` tag | `feat:` → minor, `BREAKING CHANGE` / `type!:` → major, else patch |

Each command runs `tools/bump-version.cjs`, which:

1. bumps `version` in `package.json` and `package-lock.json`,
2. prepends a `## vX.Y.Z — date` section to `CHANGELOG.md` from the commit subjects,
3. commits `chore(release): vX.Y.Z` and tags `vX.Y.Z`,

then runs `npm run dist` to build installers into `dist/`.

Preview without changing anything: `node tools/bump-version.cjs auto --dry-run`.
Bump only (no build): `npm run version:bump -- minor`.

## Release gate (saves CI minutes)

Before the tag workflow spends any macOS (10x billed) or Windows (2x) minutes,
a cheap Linux **preflight** job must pass. It fails the release, with nothing
built, unless:

- the tag matches `package.json` (`v0.4.0` ↔ `"version": "0.4.0"`);
- `CHANGELOG.md` has a `## v0.4.0` section and nothing is left under `## Unreleased`
  (`bump-version.cjs` now turns your Unreleased entries into the release section);
- `build/release-notes.md` has 1–5 bullets and changed since the last release;
- every download link and version string in the docs matches (`check:links`);
- the tagged commit is on `main` and CI (Typecheck, Licensing service) passed on it.

Run the same checks locally, free, before pushing a tag: `npm run release:check`.
The `release:*` scripts run it automatically before `npm run dist`.

Other cost rules:
- Draft PRs run no CI. Checks start when you click **Ready for review**.
- A newer push to a PR cancels the older CI run.
- Website-only changes (`site/**`) skip app CI; Vercel previews them.
- Manual dry builds (**Actions → Release → Run workflow**) build Linux only by
  default; pick `linux+windows` or `all` when you really need them.

Publish: `git push --follow-tags`. The tag workflow creates the private
release, then mirrors its notes and assets to the public distribution
repository. See [Public release distribution](docs/RELEASE_DISTRIBUTION.md)
for the one-time repository and `PUBLIC_REPO_PAT` setup.

Before each release, edit `build/release-notes.md` (3–5 bullets, ≤280 chars) — it is the in-app "What's new" toast.

## Auto-update destination

Packaged clients use `jeffreycayao/ATMT_LABS_FLOOR-releases` through
`electron-builder.yml` and `src/shared/brand.ts`. The public repository
contains release assets, not application source. Remote model and hero
catalogs remain on bundled defaults until a separate public catalog source
is configured.
