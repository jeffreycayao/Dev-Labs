#!/usr/bin/env node
/*
 * Semver bump for releases: node tools/bump-version.cjs <patch|minor|major|auto> [--dry-run] [--no-git]
 *
 *   patch  0.0.1 -> 0.0.2   fixes only
 *   minor  0.0.1 -> 0.1.0   new features, backwards compatible
 *   major  0.0.1 -> 1.0.0   breaking changes
 *   auto   picks from Conventional Commits since the last v* tag:
 *          "BREAKING CHANGE" or "type!:" -> major, "feat:" -> minor, anything else -> patch
 *
 * Updates package.json + package-lock.json, prepends a CHANGELOG.md section
 * (commit subjects since the last tag), then commits and tags vX.Y.Z when run
 * inside a git repo. Tag push is left to you: git push --follow-tags
 */
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const kind = args.find((a) => !a.startsWith('--')) || 'patch';
const dryRun = args.includes('--dry-run');
const noGit = args.includes('--no-git');

if (!['patch', 'minor', 'major', 'auto'].includes(kind)) {
  console.error(`Unknown bump "${kind}". Use patch | minor | major | auto.`);
  process.exit(1);
}

const git = (...a) => execFileSync('git', a, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
let inGit = false;
try { inGit = !noGit && git('rev-parse', '--is-inside-work-tree') === 'true'; } catch { /* not a repo */ }

function lastTag() {
  try { return git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*'); } catch { return ''; }
}

function commitsSince(tag) {
  if (!inGit) return [];
  try {
    const range = tag ? `${tag}..HEAD` : 'HEAD';
    const out = git('log', range, '--format=%s%x1f%b%x1e');
    return out.split('\x1e').map((c) => c.trim()).filter(Boolean).map((c) => {
      const [subject, body = ''] = c.split('\x1f');
      return { subject: subject.trim(), body };
    });
  } catch { return []; }
}

function detect(commits) {
  if (commits.some((c) => /BREAKING[ -]CHANGE/.test(c.body) || /^\w+(\(.+\))?!:/.test(c.subject))) return 'major';
  if (commits.some((c) => /^feat(\(.+\))?:/.test(c.subject))) return 'minor';
  return 'patch';
}

function bump(version, level) {
  const [maj, min, pat] = version.split('-')[0].split('.').map(Number);
  if ([maj, min, pat].some(Number.isNaN)) throw new Error(`package.json version "${version}" is not semver`);
  if (level === 'major') return `${maj + 1}.0.0`;
  if (level === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj}.${min}.${pat + 1}`;
}

const pkgPath = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const tag = lastTag();
const commits = commitsSince(tag);
const level = kind === 'auto' ? detect(commits) : kind;
const next = bump(pkg.version, level);

console.log(`${pkg.version} -> ${next} (${level}${kind === 'auto' ? `, from ${commits.length} commit(s) since ${tag || 'start'}` : ''})`);
if (dryRun) process.exit(0);

// Refuse a release before touching files if this checkout cannot advance main.
// A stale checkout used to create a lower-version commit and tag that Git then
// rejected on push, leaving the operator to untangle both refs by hand.
const refuse = (message) => { console.error(`Release not prepared: ${message}`); process.exit(1); };
if (inGit) {
  if (git('status', '--porcelain')) {
    refuse('Commit or stash local changes before preparing a release.');
  }
  let remoteMain;
  try { remoteMain = git('ls-remote', 'origin', 'refs/heads/main').split(/\s+/)[0]; }
  catch { refuse('Could not reach origin. Check Git access and retry.'); }
  if (!/^[0-9a-f]{40}$/.test(remoteMain)) {
    refuse('Could not find origin/main. Fetch and check the remote before releasing.');
  }
  if (git('rev-parse', 'refs/remotes/origin/main') !== remoteMain) {
    refuse('Local origin/main is stale. Run git fetch origin main before releasing.');
  }
  try { git('merge-base', '--is-ancestor', remoteMain, 'HEAD'); }
  catch { refuse('This checkout is behind or diverged from origin/main. Integrate main before releasing.'); }
  if (git('tag', '--list', `v${next}`) || git('ls-remote', 'origin', `refs/tags/v${next}`)) {
    refuse(`Release tag v${next} already exists. Inspect the existing tag before retrying.`);
  }
}

pkg.version = next;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

const lockPath = path.join(root, 'package-lock.json');
if (fs.existsSync(lockPath)) {
  const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  lock.version = next;
  if (lock.packages && lock.packages['']) lock.packages[''].version = next;
  fs.writeFileSync(lockPath, JSON.stringify(lock, null, 2) + '\n');
}

const changelogPath = path.join(root, 'CHANGELOG.md');
const date = new Date().toISOString().slice(0, 10);
const bullets = commits.length
  ? commits.filter((c) => !/^chore\(release\)/.test(c.subject)).map((c) => `- ${c.subject}`).join('\n')
  : '- Maintenance release.';
const existing = fs.existsSync(changelogPath) ? fs.readFileSync(changelogPath, 'utf8') : '# Changelog\n\n';
// Hand-written "## Unreleased" entries become this release's section (they are
// better than commit subjects); a fresh, empty Unreleased heading stays on top.
// Without Unreleased entries, fall back to the commit subjects.
const unreleased = existing.match(/^## Unreleased[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m);
const pending = unreleased ? unreleased[1].trim() : '';
const section = `## v${next} — ${date}\n\n${pending || bullets}\n\n`;
let updated;
if (unreleased) {
  updated = existing.slice(0, unreleased.index) + '## Unreleased\n\n' + section + existing.slice(unreleased.index + unreleased[0].length);
} else {
  const headerEnd = existing.indexOf('\n## ');
  updated = headerEnd === -1 ? existing.trimEnd() + '\n\n' + section : existing.slice(0, headerEnd + 1) + section + existing.slice(headerEnd + 1);
}
fs.writeFileSync(changelogPath, updated);

if (inGit) {
  git('add', 'package.json', 'package-lock.json', 'CHANGELOG.md');
  git('commit', '-m', `chore(release): v${next}`);
  git('tag', '-a', `v${next}`, '-m', `v${next}`);
  console.log(`Committed and tagged v${next}. Push with: git push --follow-tags`);
}
