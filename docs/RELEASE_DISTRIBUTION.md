# Public release distribution

The application source is in the public, MIT-licensed
`jeffreycayao/Dev-Labs` repository. Installers, updater metadata,
checksums, and release notes are mirrored to the
`jeffreycayao/ATMT_LABS_FLOOR-releases` repository. The installed application
uses only that public repository and needs no GitHub token.

## 1. Create the public repository

Create `jeffreycayao/ATMT_LABS_FLOOR-releases` as **Public** with a README
initial commit and default branch `main`. The initial commit gives GitHub a
target for the release tags; do not copy the private application source into
this repository. With GitHub CLI:

```bash
gh repo create jeffreycayao/ATMT_LABS_FLOOR-releases --public --add-readme \
  --description "Public Jepoy Floor AI installers and release notes"
```

Leave Releases enabled. The public repository's generated source archives will
contain only its README, while its release assets will contain the installers.
If you use the in-app **report a problem** link, leave Issues enabled.

## 2. Add the destination credential

Create a **fine-grained personal access token** under the `jeffreycayao`
account with access to **only**
`jeffreycayao/ATMT_LABS_FLOOR-releases`. Grant repository
**Contents: Read and write**; keep the expiration short and rotate it before
expiry. Add it to the **private source repository** at
**Settings → Secrets and variables → Actions → New repository secret** with
the exact name `PUBLIC_REPO_PAT`. Do not put it in Vercel, a source file, a
build environment variable, or the desktop application.

## 3. Publish or backfill a release

Update `build/release-notes.md` before tagging. The private release workflow
creates a private draft release with a body from those highlights and the
tagged `CHANGELOG.md` section. Each platform builds its installers and
`latest*.yml` files and uploads them directly to that draft. The workflow
publishes the private release only after every platform succeeds and the
updater channel files are present. Its final job calls
`.github/workflows/publish-public-release.yml` to mirror the release. A release
published manually also triggers the mirror via `release.published`.

The mirror reads the private release with its temporary `GITHUB_TOKEN` and
uses `PUBLIC_REPO_PAT` only for the public release step. It downloads **all**
private release assets, checks their sizes and any available SHA-256 digests,
then uses `gh release create` with the same tag, title, body, prerelease flag
and assets. Rerunning against an identical public release succeeds; a
different existing release fails rather than overwriting downloads.

To backfill a release published before this workflow existed:

```bash
gh workflow run publish-public-release.yml \
  --repo jeffreycayao/Dev-Labs -f tag=vX.Y.Z
```

Wait for **Publish public release mirror** to finish. Stable releases appear at
`/releases/latest`; prereleases do not become the normal updater's latest.

## 4. Verify the public feed and an installed build

1. On the public repository, compare the private and public release tag,
   title, notes, prerelease status, asset names and byte sizes. The mirror job
   already performs this comparison.
2. Open
   `https://api.github.com/repos/jeffreycayao/ATMT_LABS_FLOOR-releases/releases/latest`
   in a signed-out browser. It should return the current stable release
   without a 401 or 404. Check that the `latest*.yml` files and installers
   download from the public release without signing in.
3. Inspect a packaged build's `resources/app-update.yml` (on macOS,
   `Contents/Resources/app-update.yml`). It must say `provider: github`,
   `owner: jeffreycayao`, `repo: ATMT_LABS_FLOOR-releases` and contain no
   token. The release workflow runs electron-builder with `--publish never`
   and no GitHub credential in its packaging step.
4. Install an **older packaged version**, keep **Settings → General →
   Auto-update** enabled, then publish a higher stable version. After startup
   the app checks for updates (first check about 30 seconds after launch).
   Confirm the update badge offers the new version, the download completes,
   and a user-approved restart installs it. **What's New** should show the
   release highlights; the full notes link should open the public Releases
   page. If the native updater fails, inspect `updater.log` in the app's
   user-data folder and confirm the manual download points to the public repo.

Until the public repository and `PUBLIC_REPO_PAT` exist, mirroring cannot run
and the public update endpoint will return 404. Do not distribute a build that
expects this feed before publishing its first public release.

## 5. Website download buttons

The download buttons on `jepoy.dev` (`/download/mac`, `/download/windows`,
`/download/linux`, plus `/download/mac-zip` and `/download/windows-portable`)
read the public repository's latest stable release at request time and
redirect to the matching installer. Once the mirror job above finishes, the
site serves the new version within about 5 minutes (the CDN cache). No site
change or redeploy is needed. See `site/README.md` → "Download links".
