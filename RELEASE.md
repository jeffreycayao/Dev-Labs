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

Publish: `git push --follow-tags`.

Before each release, edit `build/release-notes.md` (3–5 bullets, ≤280 chars) — it is the in-app "What's new" toast.

## Enabling auto-update

Auto-update and the remote model/hero catalogs are **off** until a release repo exists:

1. Set `GITHUB_REPO = 'owner/repo'` in `src/shared/brand.ts`.
2. Uncomment `publish:` in `electron-builder.yml` with the same owner/repo.
3. Publish GitHub releases with the installers produced by `npm run dist`.
