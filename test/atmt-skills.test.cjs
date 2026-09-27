'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');
const {
  ATMT_CATALOG_URL, validateCatalog, loadAtmtCatalog, installAtmtSkill, prepareAtmtSkillUninstall
} = loadTs('src/main/atmtSkills.ts');

const id = 'taglish-customer-replies';
const commit1 = 'a'.repeat(40);
const commit2 = 'b'.repeat(40);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const skillMarkdown = (body) => `---\nname: taglish-customer-replies\ndescription: Draft replies in Taglish.\n---\n${body}\n`;
const fixture = (content, version = '0.1.0', commit = commit1) => ({
  schemaVersion: 1,
  publisher: 'ATMT Labs',
  skills: [{
    id, name: 'Taglish Customer Replies', description: 'Draft replies in Taglish.',
    category: 'Customer Support', version, sourceCommit: commit,
    files: [{ path: `skills/${id}/SKILL.md`, sha256: digest(Buffer.from(content)), size: Buffer.byteLength(content) }]
  }]
});
const tempHome = (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'atmt-skill-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
};
const paths = (home) => ({
  cache: path.join(home, 'appdata', 'atmt-skill-catalog.json'),
  target: path.join(home, '.claude', 'skills', id)
});
const fetchFixture = (catalog, contents, calls = []) => async (url, maxBytes) => {
  calls.push({ url, maxBytes });
  if (url === ATMT_CATALOG_URL) return Buffer.from(JSON.stringify(catalog));
  const commit = /\/([0-9a-f]{40})\/skills\//.exec(url)?.[1];
  if (!commit || !(commit in contents)) throw new Error('missing fixture');
  return Buffer.from(contents[commit]);
};

test('catalog schema rejects traversal, bad hashes, duplicates and omitted SKILL.md', () => {
  const good = fixture('# skill\n');
  const parsed = validateCatalog(good);
  assert.equal(parsed.skills[0].sourceUrl,
    `https://github.com/jeffreycayao/atmt_labs_floor_agentskills/blob/${commit1}/skills/${id}/SKILL.md`);
  assert.equal(parsed.skills[0].provider, 'claude');
  const bad = (mutate) => { const doc = structuredClone(good); mutate(doc); assert.throws(() => validateCatalog(doc)); };
  bad((d) => { d.skills[0].files[0].path = `skills/${id}/../secret`; });
  bad((d) => { d.skills[0].files[0].path = `skills/${id}/C:\\secret`; });
  bad((d) => { d.skills[0].files[0].sha256 = 'bad'; });
  bad((d) => { d.skills[0].files[0].size = 3 * 1024 * 1024; });
  bad((d) => { d.skills[0].files[0].path = `skills/${id}/README.md`; });
  bad((d) => { d.skills.push(structuredClone(d.skills[0])); });
  bad((d) => { d.skills[0].sourceCommit = 'main'; });
  bad((d) => { d.skills[0].version = 'latest'; });
  bad((d) => { d.skills[0].version = '9007199254740993.0.0'; });
  bad((d) => { d.skills[0].id = 'con'; });
  bad((d) => { d.skills[0].files[0].path = `skills/${id}/AUX.md`; });
  bad((d) => {
    d.skills[0].files.push({ path: `skills/${id}/skill.md`, sha256: d.skills[0].files[0].sha256, size: 1 });
  });
});

test('catalog uses validated last-good cache when refresh fails and recomputes local status', async (t) => {
  const home = tempHome(t);
  const { cache } = paths(home);
  const doc = fixture('# skill\n');
  const first = await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetchFixture(doc, {}) });
  assert.equal(first.stale, false);
  assert.equal(first.skills[0].installState, 'not-installed');
  const offline = await loadAtmtCatalog(cache, { homeDir: home, force: true,
    fetchBytes: async () => { throw new Error('offline'); } });
  assert.equal(offline.stale, true);
  assert.match(offline.error, /offline/);
  assert.equal(offline.skills[0].id, id);
  const malformed = await loadAtmtCatalog(cache, { homeDir: home, force: true,
    fetchBytes: async () => Buffer.from('{bad json') });
  assert.equal(malformed.stale, true);
  assert.equal(malformed.skills[0].id, id);
});

test('install pins URLs, verifies bytes, preserves edited installs and replaces clean versions', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source1 = skillMarkdown('# version one');
  const source2 = skillMarkdown('# version two');
  const doc1 = fixture(source1);
  const doc2 = fixture(source2, '0.2.0', commit2);
  const calls = [];
  const fetch1 = fetchFixture(doc1, { [commit1]: source1 }, calls);
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch1 })).stale, false);
  const installed = await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch1 });
  assert.equal(installed.ok, true);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), source1);
  assert.ok(calls.some((c) => c.url.includes(`/${commit1}/skills/${id}/SKILL.md`)));
  assert.ok(calls.every((c) => c.url.startsWith('https://raw.githubusercontent.com/jeffreycayao/atmt_labs_floor_agentskills/')));
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'installed');
  assert.equal((await installAtmtSkill('../escape', '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch1 })).ok, false);

  const fetch2 = fetchFixture(doc2, { [commit2]: source2 });
  await loadAtmtCatalog(cache, { homeDir: home, force: true, fetchBytes: fetch2 });
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'update-available');
  const corrupt = await installAtmtSkill(id, '0.2.0', commit2, cache, { homeDir: home,
    fetchBytes: fetchFixture(doc2, { [commit2]: 'tampered download' }) });
  assert.equal(corrupt.ok, false);
  assert.match(corrupt.error, /Integrity check/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), source1);
  assert.ok(!fs.readdirSync(path.dirname(path.dirname(target))).some((n) => n.startsWith('.atmt-stage-')));

  fs.appendFileSync(path.join(target, 'SKILL.md'), 'user edit\n');
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'modified');
  const refused = await installAtmtSkill(id, '0.2.0', commit2, cache, { homeDir: home, fetchBytes: fetch2 });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /local edits/);
  assert.match(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), /user edit/);

  // Restore the original bytes to model an unmodified ATMT-managed update.
  fs.writeFileSync(path.join(target, 'SKILL.md'), source1);
  const updated = await installAtmtSkill(id, '0.2.0', commit2, cache, { homeDir: home, fetchBytes: fetch2 });
  assert.equal(updated.ok, true);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), source2);
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installedVersion, '0.2.0');
});

test('existing unmanaged folder and newer installed version are never overwritten', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source1 = skillMarkdown('# skill');
  const doc1 = fixture(source1, '1.0.0', commit1);
  const fetch1 = fetchFixture(doc1, { [commit1]: source1 });
  await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch1 });
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'personal skill');
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'unmanaged');
  assert.equal((await installAtmtSkill(id, '1.0.0', commit1, cache, { homeDir: home, fetchBytes: fetch1 })).ok, false);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'personal skill');
  fs.rmSync(target, { recursive: true });
  assert.equal((await installAtmtSkill(id, '1.0.0', commit1, cache, { homeDir: home, fetchBytes: fetch1 })).ok, true);
  const olderFetch = fetchFixture(fixture('# old\n', '0.1.0', commit2), { [commit2]: '# old\n' });
  await loadAtmtCatalog(cache, { homeDir: home, force: true, fetchBytes: olderFetch });
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'newer-installed');
  assert.equal((await installAtmtSkill(id, '0.1.0', commit2, cache, { homeDir: home, fetchBytes: olderFetch })).ok, false);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), source1);
});

test('invalid SKILL.md frontmatter is refused before the skill becomes visible', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source = '# missing frontmatter\n';
  const fetch = fetchFixture(fixture(source), { [commit1]: source });
  await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch });
  const result = await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  assert.equal(result.ok, false);
  assert.match(result.error, /frontmatter/);
  assert.equal(fs.existsSync(target), false);
});

test('install is bound to the version and commit the user saw', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const v1 = skillMarkdown('# first');
  const v2 = skillMarkdown('# second');
  await loadAtmtCatalog(cache, { homeDir: home,
    fetchBytes: fetchFixture(fixture(v1), { [commit1]: v1 }) });
  const calls = [];
  const current = fetchFixture(fixture(v2, '0.2.0', commit2), { [commit2]: v2 }, calls);
  const refused = await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: current });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /Catalog changed; refresh/);
  assert.equal(fs.existsSync(target), false);
  assert.deepEqual(calls.map((c) => c.url), [ATMT_CATALOG_URL]);
  const wrongCommit = await installAtmtSkill(id, '0.2.0', commit1, cache, { homeDir: home, fetchBytes: current });
  assert.equal(wrongCommit.ok, false);
  assert.match(wrongCommit.error, /Catalog changed; refresh/);
  const accepted = await installAtmtSkill(id, '0.2.0', commit2, cache, { homeDir: home, fetchBytes: current });
  assert.equal(accepted.ok, true);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), v2);
});

test('verified backup is recovered after an interrupted swap; edited backup is preserved', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source = skillMarkdown('# recover me');
  const fetch = fetchFixture(fixture(source), { [commit1]: source });
  await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch });
  assert.equal((await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch })).ok, true);
  const backup = path.join(home, '.claude', `.atmt-backup-${id}`);

  fs.renameSync(target, backup); // crash after moving the old version away
  const recoveredByBrowse = await loadAtmtCatalog(cache, { homeDir: home });
  assert.equal(recoveredByBrowse.skills[0].installState, 'installed');
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(backup), false);

  fs.renameSync(target, backup);
  const recoveredByInstall = await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  assert.equal(recoveredByInstall.ok, true);
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(backup), false);

  fs.renameSync(target, backup);
  fs.appendFileSync(path.join(backup, 'SKILL.md'), '\nlocal edit');
  const blocked = await loadAtmtCatalog(cache, { homeDir: home });
  assert.equal(blocked.skills[0].installState, 'unmanaged');
  assert.equal(fs.existsSync(target), false);
  assert.equal(fs.existsSync(backup), true);
  const refused = await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  assert.equal(refused.ok, false);
  assert.match(refused.error, /backup needs review/);
  assert.match(fs.readFileSync(path.join(backup, 'SKILL.md'), 'utf8'), /local edit/);
});

test('recovery never overwrites an extant skill target', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source = skillMarkdown('# original');
  const fetch = fetchFixture(fixture(source), { [commit1]: source });
  await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch });
  await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  const backup = path.join(home, '.claude', `.atmt-backup-${id}`);
  fs.renameSync(target, backup);
  fs.mkdirSync(target);
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'personal replacement');
  const result = await loadAtmtCatalog(cache, { homeDir: home });
  assert.equal(result.skills[0].installState, 'unmanaged');
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'personal replacement');
  assert.equal(fs.existsSync(backup), true);
});

test('explicit uninstall clears only a verified matching backup before target removal', async (t) => {
  const home = tempHome(t);
  const { cache, target } = paths(home);
  const source = skillMarkdown('# original');
  const fetch = fetchFixture(fixture(source), { [commit1]: source });
  await loadAtmtCatalog(cache, { homeDir: home, fetchBytes: fetch });
  await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  const backup = path.join(home, '.claude', `.atmt-backup-${id}`);
  fs.cpSync(target, backup, { recursive: true });
  assert.deepEqual(prepareAtmtSkillUninstall(path.join(home, 'project', id), home), { ok: true });
  assert.equal(fs.existsSync(backup), true);
  assert.deepEqual(prepareAtmtSkillUninstall(target, home), { ok: true });
  assert.equal(fs.existsSync(backup), false);
  fs.rmSync(target, { recursive: true }); // the existing uninstallSkill step
  assert.equal((await loadAtmtCatalog(cache, { homeDir: home })).skills[0].installState, 'not-installed');

  await installAtmtSkill(id, '0.1.0', commit1, cache, { homeDir: home, fetchBytes: fetch });
  fs.cpSync(target, backup, { recursive: true });
  fs.appendFileSync(path.join(backup, 'SKILL.md'), '\nlocal edit');
  const refused = prepareAtmtSkillUninstall(target, home);
  assert.equal(refused.ok, false);
  assert.match(refused.error, /backup needs review/);
  assert.equal(fs.existsSync(target), true);
  assert.equal(fs.existsSync(backup), true);
});
