/**
 * Third-party skills (SkillSpector, ponytail, Cloudflare security-audit) are
 * vendored into resources/skills/ by tools/sync-third-party-skills.cjs and
 * reach every agent on spawn. These tests pin the three things that matter:
 * the sync refuses unsafe trees, the committed files are exactly what the lock
 * pinned, and Claude and Codex agents actually get the skills folder.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const ROOT = path.join(__dirname, '..');
const SKILLS = path.join(ROOT, 'resources', 'skills');
const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'third-party-skills.json'), 'utf8'));
const {
  safeRelPath, gitBlobSha, selectSkillFiles, checkSkillMarkdown, verifyVendored
} = require('../tools/sync-third-party-skills.cjs');
const { HiveManager } = loadTs('src/main/hive.ts');

test('safeRelPath accepts plain skill paths and refuses escapes', () => {
  for (const ok of ['SKILL.md', 'references/api.md', 'validate-findings.cjs']) assert.equal(safeRelPath(ok), true, ok);
  for (const bad of ['', '../x', 'a/../b', '/etc/passwd', 'C:\\x', '.hidden', 'a/.git/config', 'AUX.md', 'x.', 'a/b/c/d/e/f']) {
    assert.equal(safeRelPath(bad), false, bad);
  }
});

test('gitBlobSha is the hash git stores, so downloads are tied to the pinned commit', () => {
  assert.equal(gitBlobSha(Buffer.from('hello\n')), 'ce013625030ba8dba906f756967f9e9ca394464a');
});

test('selectSkillFiles keeps only the skill folder and refuses links, submodules and oversize trees', () => {
  const blob = (p, size = 10) => ({ path: p, type: 'blob', mode: '100644', sha: 'a'.repeat(40), size });
  const tree = [blob('README.md'), { path: 'skills/x', type: 'tree' }, blob('skills/x/SKILL.md'),
    blob('skills/x/ref/a.md'), blob('skills/xy/SKILL.md')];
  assert.deepEqual(selectSkillFiles(tree, 'skills/x').map((f) => f.rel), ['SKILL.md', 'ref/a.md']);

  assert.throws(() => selectSkillFiles([blob('skills/x/a.md')], 'skills/x'), /no SKILL\.md/);
  assert.throws(() => selectSkillFiles([...tree, { ...blob('skills/x/l'), mode: '120000' }], 'skills/x'), /not a regular file/);
  assert.throws(() => selectSkillFiles([...tree, { path: 'skills/x/sub', type: 'commit', sha: 'b'.repeat(40) }], 'skills/x'), /not a regular file/);
  assert.throws(() => selectSkillFiles([...tree, blob('skills/x/skill.md')], 'skills/x'), /duplicate/);
  assert.throws(() => selectSkillFiles([...tree, blob('skills/x/.env')], 'skills/x'), /unsafe/);
  assert.throws(() => selectSkillFiles([blob('skills/x/SKILL.md', 600 * 1024)], 'skills/x'), /too large/);
});

test('checkSkillMarkdown requires name and description frontmatter', () => {
  checkSkillMarkdown(Buffer.from('---\nname: a\ndescription: b\n---\nbody'), 't');
  assert.throws(() => checkSkillMarkdown(Buffer.from('# no frontmatter'), 't'), /frontmatter/);
});

test('committed vendored skills match the pinned lock exactly', () => {
  for (const src of lock.sources) assert.match(src.commit, /^[0-9a-f]{40}$/, `${src.repo} must pin a commit`);
  assert.deepEqual(verifyVendored(lock, SKILLS), [], 'run `node tools/sync-third-party-skills.cjs`, never hand-edit');
  for (const skill of lock.sources.flatMap((s) => s.skills)) {
    checkSkillMarkdown(fs.readFileSync(path.join(SKILLS, skill.to, 'SKILL.md')), skill.to);
    assert.ok(fs.existsSync(path.join(SKILLS, skill.to, 'LICENSE')), `${skill.to} ships its license`);
  }
});

test('verifyVendored reports an edited, extra or missing file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-vendor-'));
  fs.mkdirSync(path.join(dir, 's'));
  fs.writeFileSync(path.join(dir, 's', 'SKILL.md'), 'changed');
  fs.writeFileSync(path.join(dir, 's', 'extra.md'), 'x');
  const fake = { sources: [{ skills: [{ to: 's', files: [
    { path: 'SKILL.md', sha: gitBlobSha(Buffer.from('original')) },
    { path: 'gone.md', sha: 'c'.repeat(40) }
  ] }] }] };
  assert.deepEqual(verifyVendored(fake, dir).sort(), ['s/SKILL.md: edited', 's/extra.md: not in the lock', 's/gone.md: missing']);
  fs.rmSync(dir, { recursive: true, force: true });
});

function isolatedHome(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'md-skills-'));
  const realHome = process.env.HOME;
  const realProfile = process.env.USERPROFILE;
  process.env.HOME = process.env.USERPROFILE = path.join(base, 'user');
  t.after(() => {
    if (realHome === undefined) delete process.env.HOME; else process.env.HOME = realHome;
    if (realProfile === undefined) delete process.env.USERPROFILE; else process.env.USERPROFILE = realProfile;
    fs.rmSync(base, { recursive: true, force: true });
  });
  assert.equal(os.homedir(), path.join(base, 'user'), 'home redirect failed');
  return path.join(base, 'harness');
}

test('a Claude agent loads the bundled skills through --add-dir on its agent folder', async (t) => {
  const harness = isolatedHome(t);
  const hive = new HiveManager(() => harness);
  const inj = await hive.ensureAgent({ id: 'jim-1', name: 'Jim', provider: 'claude', cwd: harness }, { skillsDir: SKILLS });
  const agentDir = path.join(harness, 'hive', 'agents', 'jim-1');
  const i = inj.args.indexOf('--add-dir');
  assert.equal(inj.args[i + 1], agentDir);
  assert.match(inj.args[i + 2], /^--/, '--add-dir is variadic; a flag must follow');
  for (const id of ['skill-inspector', 'ponytail', 'security-audit']) {
    assert.ok(fs.existsSync(path.join(agentDir, '.claude', 'skills', id, 'SKILL.md')), id);
  }
});

test('a link planted in the agent folder cannot redirect the unsandboxed skills copy', async (t) => {
  const harness = isolatedHome(t);
  const hive = new HiveManager(() => harness);
  const meta = { id: 'eve-1', name: 'Eve', provider: 'claude', cwd: harness };
  await hive.ensureAgent(meta, {});
  const agentDir = path.join(harness, 'hive', 'agents', 'eve-1');
  const victim = path.join(harness, 'victim');
  fs.mkdirSync(victim, { recursive: true });
  fs.writeFileSync(path.join(victim, 'SKILL.md'), 'precious');
  const link = (target, at) => {
    fs.mkdirSync(path.dirname(at), { recursive: true });
    fs.symlinkSync(target, at, process.platform === 'win32' ? 'junction' : 'dir');
  };

  // A skill folder that is a link: replaced by a real folder, target untouched.
  link(victim, path.join(agentDir, '.claude', 'skills', 'ponytail'));
  await hive.ensureAgent(meta, { skillsDir: SKILLS });
  assert.equal(fs.readFileSync(path.join(victim, 'SKILL.md'), 'utf8'), 'precious');
  const skill = path.join(agentDir, '.claude', 'skills', 'ponytail');
  assert.equal(fs.lstatSync(skill).isSymbolicLink(), false);
  assert.ok(fs.readFileSync(path.join(skill, 'SKILL.md'), 'utf8').startsWith('---'));

  // The skills root itself behind a link: nothing is copied through it.
  fs.rmSync(path.join(agentDir, '.claude'), { recursive: true, force: true });
  link(victim, path.join(agentDir, '.claude'));
  await hive.ensureAgent(meta, { skillsDir: SKILLS });
  assert.equal(fs.existsSync(path.join(victim, 'skills', 'ponytail')), false);
  assert.equal(fs.readFileSync(path.join(victim, 'SKILL.md'), 'utf8'), 'precious');
});

test('a Codex agent gets the bundled skills in its isolated CODEX_HOME', async (t) => {
  const harness = isolatedHome(t);
  const hive = new HiveManager(() => harness);
  const inj = await hive.ensureAgent({ id: 'kev-1', name: 'Kevin', provider: 'codex', cwd: harness }, { skillsDir: SKILLS });
  assert.ok(inj.env.CODEX_HOME, 'codex spawn is isolated');
  for (const id of ['skill-inspector', 'ponytail-review', 'security-audit']) {
    assert.ok(fs.existsSync(path.join(inj.env.CODEX_HOME, 'skills', id, 'SKILL.md')), id);
  }
});
