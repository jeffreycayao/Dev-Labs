# Releasing ATMT Labs

Versions follow [semver](https://semver.org) and start at `0.0.1`.

## Every source push

Increase the app version in `package.json` and `package-lock.json` **for every push that advances a source branch**. Choose the level for the changes being pushed:

| Command | When | Example |
| --- | --- | --- |
| `npm run version:patch` | Fixes, docs, and routine updates | 1.2.3 → 1.2.4 |
| `npm run version:minor` | New backwards-compatible features | 1.2.3 → 1.3.0 |
| `npm run version:major` | Breaking changes | 1.2.3 → 2.0.0 |

Commit both version files with the work before pushing. `npm ci` installs a local Git pre-push check; run `npm run hooks:install` if dependencies were installed another way. The GitHub **App version** workflow also checks branch pushes and pull requests, including changes made from the cloud. A failed workflow reports a missed bump after the push; protect `main` with its required check to prevent unversioned changes from merging. A push that only creates a branch at an existing commit, or pushes a tag, does not introduce a new app version.

These commands change the app version without making a release tag or installer. The release commands below remain for published installers.

## Publishing a release

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

Publish: `git push --follow-tags`. The tag workflow first creates the
private release, then mirrors its notes and assets to the public distribution
repository. See [Public release distribution](docs/RELEASE_DISTRIBUTION.md)
for the one-time repository and `PUBLIC_REPO_PAT` setup.

Before each release, edit `build/release-notes.md` (3–5 bullets, ≤280 chars) — it is the in-app "What's new" toast.

## Auto-update destination

Packaged clients use `jeffreycayao/ATMT_LABS_FLOOR-releases` through
`electron-builder.yml` and `src/shared/brand.ts`. The public repository
contains release assets, not application source. Remote model and hero
catalogs remain on bundled defaults until a separate public catalog source
is configured.
