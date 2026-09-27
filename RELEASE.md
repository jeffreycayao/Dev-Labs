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
