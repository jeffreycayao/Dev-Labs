#!/usr/bin/env node
'use strict';

/**
 * Release gate: every download link we advertise must actually resolve.
 *
 * WHY THIS EXISTS. Installer links in the release guide and website may use
 * `/releases/latest/download/DevLabs-<version>-<platform>.<ext>`. That URL
 * form requires the EXACT filename present in whichever release is currently
 * "latest", and electron-builder bakes ${version} into every artifact name — so a
 * version string left behind in RELEASE.md turns all four download links into
 * hard 404s the moment the next release ships.
 *
 * That is not hypothetical. A table once sat pinned at 0.3.2 from v0.3.4 through
 * v0.3.7, and mac DMG downloads fell from 118 and 76 on v0.3.2/v0.3.3 to single
 * digits on every release after. Nothing failed, nothing warned; the release
 * simply stopped being installable for anyone arriving through GitHub, and the
 * page even claimed the opposite ("stays correct across versions").
 *
 * Two modes:
 *   (default) offline — every advertised version string matches package.json.
 *             Run this BEFORE tagging, when the assets do not exist yet.
 *   --live    also HEADs each URL and requires 200. Run this AFTER publishing
 *             the release, which is the only moment the answer is meaningful.
 */

const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;
const releaseMd = fs.readFileSync(path.join(root, 'RELEASE.md'), 'utf8');
// Where the app expects public releases (src/shared/brand.ts). RELEASE.md is a
// release runbook, not the published release body; assets listed there are
// checked if present, but a runbook need not carry a download table.
const brandTs = fs.readFileSync(path.join(root, 'src/shared/brand.ts'), 'utf8');
const releaseRepo = (/export const GITHUB_REPO = '([^']*)'/.exec(brandTs) || [])[1] || '';

const problems = [];

// — 1. every pinned artifact name must carry the current version —
const assetRe = /DevLabs-(\d+\.\d+\.\d+)-([^\s`)]+)/g;
const assets = new Set();
for (const m of releaseMd.matchAll(assetRe)) {
  if (m[1] !== version) {
    problems.push(`RELEASE.md advertises DevLabs-${m[1]}-${m[2]} but package.json says ${version}`);
  }
  assets.add(`DevLabs-${m[1]}-${m[2]}`);
}

// — 2. source tarball tags too; a stale tag silently ships last release's source —
for (const m of releaseMd.matchAll(/archive\/refs\/tags\/v(\d+\.\d+\.\d+)/g)) {
  if (m[1] !== version) {
    problems.push(`RELEASE.md links source for tag v${m[1]} but package.json says ${version}`);
  }
}

async function head(url, label) {
  let status = 0;
  try {
    // GitHub 302s asset downloads to a CDN, so follow it; HEAD is enough.
    status = (await fetch(url, { method: 'HEAD', redirect: 'follow' })).status;
  } catch (e) {
    problems.push(`${label} — request failed: ${e.message}`);
    return;
  }
  if (status !== 200) problems.push(`${label} — HTTP ${status} (advertised but not downloadable)`);
  else console.log(`  ok  ${label}`);
}

async function checkLive() {
  if (!releaseRepo) {
    problems.push('--live needs GITHUB_REPO set in src/shared/brand.ts (no release repo to check against)');
    return;
  }
  const base = `https://github.com/${releaseRepo}/releases/latest/download/`;
  for (const name of [...assets, 'SHA256SUMS.txt']) await head(base + name, name);
}

(async () => {
  if (process.argv.includes('--live')) {
    console.log(`Checking advertised downloads for v${version} against the live latest release…`);
    await checkLive();
  }
  if (problems.length) {
    console.error(`\n✗ release links are wrong (${problems.length}):`);
    for (const p of problems) console.error(`  - ${p}`);
    console.error('\nFix RELEASE.md / docs/index.html / docs/llms.txt to match package.json before releasing.');
    process.exit(1);
  }
  console.log(`✓ release links consistent at v${version}`);
})();
