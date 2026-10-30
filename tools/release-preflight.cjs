#!/usr/bin/env node
'use strict';

// Release gate. Runs on a cheap Linux runner BEFORE the macOS (10x billed) and
// Windows (2x) installer builds, and locally as `npm run release:check` before
// you push a tag. Every check here is something that, if wrong, would waste a
// full multi-platform build or ship a broken release.
//
//   node tools/release-preflight.cjs vX.Y.Z [--ci]
//
// --ci adds the checks that need GitHub: the tag commit is on main and CI
// passed on it (see waitForCi below).

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { renderReleaseBody } = require('./render-release-body.cjs');

const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

/** Pure checks on file contents; returns a list of problems (empty = pass). */
function checkContents({ tag, version, notes, changelog, prevNotes }) {
  const problems = [];
  try {
    renderReleaseBody(tag, version, notes, changelog); // tag format, tag = package.json, notes, CHANGELOG section
  } catch (e) {
    problems.push(e.message);
  }
  const bullets = notes.split(/\r?\n/).filter((l) => /^\s*[-*]\s+\S/.test(l));
  if (notes.trim() && (bullets.length < 1 || bullets.length > 5)) {
    problems.push(`build/release-notes.md should have 1-5 bullets (has ${bullets.length})`);
  }
  if (notes.trim().length > 280 * 5) problems.push('build/release-notes.md is too long for the in-app "What\'s new" toast');
  if (prevNotes != null && prevNotes.trim() === notes.trim()) {
    problems.push("build/release-notes.md is unchanged since the previous release; update the \"What's new\" bullets");
  }
  if (/^## Unreleased\s*\n\s*- /m.test(changelog)) {
    problems.push('CHANGELOG.md still has entries under "## Unreleased"; move them into the release section');
  }
  return problems;
}

function previousTag(tag) {
  try {
    return git('describe', '--tags', '--abbrev=0', '--match', 'v*', `${tag}^`);
  } catch {
    return null; // first release, or tags not fetched
  }
}

function fileAt(ref, file) {
  try { return git('show', `${ref}:${file}`); } catch { return null; }
}

/** Poll GitHub until the CI checks on `sha` finish. Requires GH_TOKEN + gh. */
async function waitForCi(sha, { required, timeoutMin = 25 }) {
  const repo = process.env.GITHUB_REPOSITORY;
  const deadline = Date.now() + timeoutMin * 60_000;
  for (;;) {
    const raw = execFileSync('gh', ['api', `repos/${repo}/commits/${sha}/check-runs?per_page=100`], { encoding: 'utf8' });
    const runs = JSON.parse(raw).check_runs;
    const latest = new Map();
    for (const r of runs) if (required.includes(r.name) && !latest.has(r.name)) latest.set(r.name, r);
    const missing = required.filter((n) => !latest.has(n));
    const pending = [...latest.values()].filter((r) => r.status !== 'completed');
    const failed = [...latest.values()].filter((r) => r.status === 'completed' && r.conclusion !== 'success');
    if (failed.length) return `CI failed on ${sha.slice(0, 7)}: ${failed.map((r) => `${r.name} (${r.conclusion})`).join(', ')}`;
    if (!missing.length && !pending.length) return null;
    if (Date.now() > deadline) {
      return `CI did not finish on ${sha.slice(0, 7)} within ${timeoutMin} min (waiting on: ${[...missing, ...pending.map((r) => r.name)].join(', ')}). Push the commit to main, let CI pass, then re-run this workflow.`;
    }
    console.log(`Waiting for CI: ${[...missing, ...pending.map((r) => r.name)].join(', ')}`);
    await new Promise((r) => setTimeout(r, 30_000));
  }
}

async function main() {
  const [tag, ...flags] = process.argv.slice(2);
  const ci = flags.includes('--ci');
  const version = JSON.parse(read('package.json')).version;
  const releaseTag = tag || `v${version}`;
  const notes = read('build/release-notes.md');
  const changelog = read('CHANGELOG.md');
  const prev = previousTag(releaseTag) || previousTag('HEAD');
  const prevNotes = prev ? fileAt(prev, 'build/release-notes.md') : null;

  const problems = checkContents({ tag: releaseTag, version, notes, changelog, prevNotes });

  try {
    execFileSync(process.execPath, [path.join(__dirname, 'check-release-links.cjs')], { cwd: root, stdio: 'pipe' });
  } catch (e) {
    problems.push(`Release links: ${String(e.stdout || e.stderr || e.message).trim()}`);
  }

  if (!ci) {
    if (git('status', '--porcelain')) problems.push('Working tree has uncommitted changes; commit them before tagging');
  } else {
    const sha = git('rev-parse', 'HEAD');
    try {
      git('merge-base', '--is-ancestor', sha, 'origin/main');
    } catch {
      problems.push(`Tag ${releaseTag} points at ${sha.slice(0, 7)}, which is not on main. Merge first, then tag main.`);
    }
    if (!problems.length) {
      const err = await waitForCi(sha, { required: ['Typecheck', 'Build'] });
      if (err) problems.push(err);
    }
  }

  if (problems.length) {
    console.error(`\nRelease ${releaseTag} is NOT ready (no installers were built):\n`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    console.error('');
    process.exitCode = 1;
    return;
  }
  console.log(`✓ Release ${releaseTag} passed preflight${prev ? ` (previous: ${prev})` : ''}.`);
}

if (require.main === module) main().catch((e) => { console.error(e); process.exitCode = 1; });

module.exports = { checkContents };
