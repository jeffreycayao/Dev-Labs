'use strict';

/**
 * Vendors pinned third-party agent skills into resources/skills/, which ships
 * with the app and is copied into every agent's skills folder on spawn.
 *
 *   node tools/sync-third-party-skills.cjs            re-download the pinned commits
 *   node tools/sync-third-party-skills.cjs --update   move each pin to the latest release
 *                                                     (default branch when there is none)
 *   node tools/sync-third-party-skills.cjs --check    offline: files on disk match the lock
 *
 * The sources are third-party code headed for every user's machine, so this
 * only COPIES files. Nothing downloaded is executed, every file is checked
 * against the git blob hash of the pinned commit, symlinks and submodules are
 * refused, and a maintainer reviews `git diff resources/skills` before commit.
 * Pins live in tools/third-party-skills.json.
 */

const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const LOCK = path.join(__dirname, 'third-party-skills.json');
const SKILLS_ROOT = path.join(ROOT, 'resources', 'skills');
const MAX_FILES = 60;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

/** A relative path we are willing to create: plain segments, no dot-dot, no
 *  leading dot, no Windows device names, at most five levels. */
function safeRelPath(rel) {
  if (typeof rel !== 'string' || !rel) return false;
  const parts = rel.split('/');
  return parts.length <= 5 && parts.every((p) =>
    SEGMENT.test(p) && !p.includes('..') && !p.endsWith('.') && !WINDOWS_RESERVED.test(p));
}

/** The hash git stores for a file, so a download can be tied to the pinned commit. */
function gitBlobSha(bytes) {
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
}

/** The regular files of one skill folder in a recursive git tree listing.
 *  Throws on anything that is not a plain file, an unsafe or duplicate path,
 *  or a folder over the size caps, rather than skipping it silently. */
function selectSkillFiles(tree, from) {
  const prefix = `${from}/`;
  const out = [];
  const seen = new Set();
  let total = 0;
  for (const e of tree) {
    if (!e.path.startsWith(prefix) || e.type === 'tree') continue;
    if (e.type !== 'blob' || e.mode === '120000') throw new Error(`${e.path}: not a regular file`);
    const rel = e.path.slice(prefix.length);
    const folded = rel.toLowerCase();
    if (!safeRelPath(rel) || seen.has(folded)) throw new Error(`${e.path}: unsafe or duplicate path`);
    if (!Number.isSafeInteger(e.size) || e.size > MAX_FILE_BYTES) throw new Error(`${e.path}: file too large`);
    total += e.size;
    if (total > MAX_SKILL_BYTES || out.length >= MAX_FILES) throw new Error(`${from}: skill folder too large`);
    seen.add(folded);
    out.push({ rel, path: e.path, sha: e.sha, size: e.size });
  }
  if (!out.some((f) => f.rel === 'SKILL.md')) throw new Error(`${from}: no SKILL.md at the pinned commit`);
  return out;
}

/** Same frontmatter bar the Skills Library applies before an agent sees a skill. */
function checkSkillMarkdown(bytes, where) {
  const md = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  const fm = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(md)?.[1];
  if (!fm || !/^name:[ \t]*\S/m.test(fm) || !/^description:[ \t]*\S/m.test(fm)) {
    throw new Error(`${where}: SKILL.md is missing name or description frontmatter`);
  }
}

/** Every vendored file on disk against the lock. Returns problems, empty when clean. */
function verifyVendored(lock, skillsRoot) {
  const problems = [];
  for (const src of lock.sources) {
    for (const skill of src.skills) {
      const dest = path.join(skillsRoot, skill.to);
      if (!Array.isArray(skill.files)) { problems.push(`${skill.to}: never synced`); continue; }
      const expected = new Map(skill.files.map((f) => [f.path, f.sha]));
      const walk = (dir) => {
        for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, ent.name);
          const rel = path.relative(dest, full).split(path.sep).join('/');
          if (ent.isDirectory()) { walk(full); continue; }
          if (!ent.isFile()) { problems.push(`${skill.to}/${rel}: not a regular file`); continue; }
          if (!expected.has(rel)) { problems.push(`${skill.to}/${rel}: not in the lock`); continue; }
          if (gitBlobSha(fs.readFileSync(full)) !== expected.get(rel)) problems.push(`${skill.to}/${rel}: edited`);
          expected.delete(rel);
        }
      };
      try { walk(dest); } catch { problems.push(`${skill.to}: missing`); continue; }
      for (const rel of expected.keys()) problems.push(`${skill.to}/${rel}: missing`);
    }
  }
  return problems;
}

async function getJson(apiPath) {
  const headers = { 'user-agent': 'devlabs-skill-sync', accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com${apiPath}`, { headers });
  if (!res.ok) { const err = new Error(`GET ${apiPath}: HTTP ${res.status}`); err.status = res.status; throw err; }
  return res.json();
}

/** Raw bytes of one blob at the pinned commit, verified against the tree's hash. */
async function download(src, entry) {
  const res = await fetch(`https://raw.githubusercontent.com/${src.repo}/${src.commit}/${entry.path}`);
  if (!res.ok) throw new Error(`${entry.path}: HTTP ${res.status}`);
  const bytes = Buffer.from(await res.arrayBuffer());
  if (bytes.length !== entry.size || gitBlobSha(bytes) !== entry.sha) {
    throw new Error(`${entry.path}: integrity check failed`);
  }
  return bytes;
}

/** Latest release tag, else the default branch tip. The pin is always a commit. */
async function latestPin(repo) {
  let ref;
  try { ref = (await getJson(`/repos/${repo}/releases/latest`)).tag_name; }
  catch (e) { if (e.status !== 404) throw e; ref = (await getJson(`/repos/${repo}`)).default_branch; }
  const commit = (await getJson(`/repos/${repo}/commits/${encodeURIComponent(ref)}`)).sha;
  return { ref, commit };
}

async function sync(lock, { update }) {
  for (const src of lock.sources) {
    if (!/^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(src.repo)) throw new Error(`bad repo: ${src.repo}`);
    if (update) {
      const pin = await latestPin(src.repo);
      if (pin.commit !== src.commit) console.log(`[skills] ${src.repo}: ${src.ref} -> ${pin.ref} (${pin.commit.slice(0, 7)})`);
      Object.assign(src, pin);
    }
    if (!/^[0-9a-f]{40}$/.test(src.commit)) throw new Error(`${src.repo}: pin must be a full commit sha`);
    const listing = await getJson(`/repos/${src.repo}/git/trees/${src.commit}?recursive=1`);
    if (listing.truncated) throw new Error(`${src.repo}: tree listing truncated`);
    const licenseEntry = listing.tree.find((e) => e.path === src.licenseFile && e.type === 'blob' && e.mode !== '120000');
    if (!licenseEntry) throw new Error(`${src.repo}: no ${src.licenseFile} at the pinned commit`);
    const license = await download(src, licenseEntry);

    for (const skill of src.skills) {
      if (!safeRelPath(skill.to) || skill.to.includes('/')) throw new Error(`bad destination: ${skill.to}`);
      const dest = path.join(SKILLS_ROOT, skill.to);
      // Only replace folders this lock already owns, never a first-party skill.
      if (fs.existsSync(dest) && !Array.isArray(skill.files)) {
        throw new Error(`${dest} exists and is not a vendored skill; pick another "to"`);
      }
      const files = selectSkillFiles(listing.tree, skill.from);
      // Stage beside resources/skills so a half-written copy can never ship.
      const stage = fs.mkdtempSync(path.join(SKILLS_ROOT, '..', `.skill-stage-${skill.to}-`));
      try {
        for (const f of files) {
          const bytes = await download(src, f);
          if (f.rel === 'SKILL.md') checkSkillMarkdown(bytes, `${src.repo}/${f.path}`);
          const out = path.join(stage, ...f.rel.split('/'));
          fs.mkdirSync(path.dirname(out), { recursive: true });
          fs.writeFileSync(out, bytes, { flag: 'wx' });
        }
        // Both licenses require the notice to travel with the copy.
        if (!files.some((f) => f.rel.toLowerCase() === 'license')) {
          fs.writeFileSync(path.join(stage, 'LICENSE'), license, { flag: 'wx' });
          files.push({ rel: 'LICENSE', sha: licenseEntry.sha });
        }
        fs.rmSync(dest, { recursive: true, force: true });
        fs.renameSync(stage, dest);
      } finally {
        fs.rmSync(stage, { recursive: true, force: true });
      }
      skill.files = files.map((f) => ({ path: f.rel, sha: f.sha })).sort((a, b) => a.path.localeCompare(b.path));
      console.log(`[skills] ${skill.to} <- ${src.repo}@${src.commit.slice(0, 7)} (${files.length} files)`);
    }
  }
  // shortcut: a skill removed from the lock stays in resources/skills; delete its folder by hand.
  fs.writeFileSync(LOCK, `${JSON.stringify(lock, null, 2)}\n`);
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const lock = JSON.parse(fs.readFileSync(LOCK, 'utf8'));
  const run = argv.includes('--check')
    ? Promise.resolve().then(() => {
      const problems = verifyVendored(lock, SKILLS_ROOT);
      if (problems.length) throw new Error(`vendored skills differ from the lock:\n  ${problems.join('\n  ')}`);
      console.log('[skills] vendored skills match the lock');
    })
    : sync(lock, { update: argv.includes('--update') }).then(() =>
      console.log('[skills] done. Review `git diff resources/skills tools/third-party-skills.json` before committing.'));
  run.catch((e) => { console.error(`[skills] ${e.message}`); process.exitCode = 1; });
}

module.exports = { safeRelPath, gitBlobSha, selectSkillFiles, checkSkillMarkdown, verifyVendored };
