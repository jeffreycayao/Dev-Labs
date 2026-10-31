'use strict';

// The bundled Obsidian connector (resources/md-obsidian-mcp.cjs): notes with
// frontmatter/tags/links, daily notes, search, and the safety rules — contained
// to the vault, no dot-folders, never overwrite — plus the MCP stdio loop.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const obs = require('../resources/md-obsidian-mcp.cjs');
const { handle } = require('../resources/md-mcp-stdio.cjs');

function tempVault(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-vault-'));
  fs.mkdirSync(path.join(dir, '.obsidian'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

const NOW = new Date(2026, 9, 31, 14, 5); // 31 Oct 2026, 14:05 local

test('save_note writes frontmatter, tags and [[links]] under DevLabs/', (t) => {
  const vault = tempVault(t);
  const r = obs.saveNote(vault, { title: 'Release checklist', body: 'Run the tests.', kind: 'decision', tags: ['#release', 'ops team'], links: ['Build notes'] }, NOW);
  assert.deepEqual(r, { path: 'DevLabs/Release checklist.md', created: true });
  const text = fs.readFileSync(path.join(vault, r.path), 'utf8');
  assert.match(text, /^---\ntitle: "Release checklist"\nkind: "decision"\ntags:\n {2}- "devlabs"\n {2}- "release"\n {2}- "ops-team"\n/);
  assert.match(text, /source: "devlabs"\n---\n# Release checklist\n\nRun the tests\.\n\nRelated: \[\[Build notes\]\]\n$/);
  assert.deepEqual(obs.noteTags(text), ['devlabs', 'release', 'ops-team']);
});

test('saving the same title again appends an update; nothing is overwritten', (t) => {
  const vault = tempVault(t);
  obs.saveNote(vault, { title: 'Bug 42', body: 'First finding.' }, NOW);
  const r = obs.saveNote(vault, { title: 'Bug 42', body: 'Root cause found.', tags: ['fixed'] }, NOW);
  assert.equal(r.created, false);
  const text = fs.readFileSync(path.join(vault, 'DevLabs/Bug 42.md'), 'utf8');
  assert.match(text, /First finding\./);
  assert.match(text, /## Update 2026-10-31 14:05\n\nRoot cause found\.\n\n#devlabs #fixed\n$/);
});

test('titles become safe file names', () => {
  assert.equal(obs.safeName('a/b:c*?"<>|#^[x]'), 'a b c x');
  assert.equal(obs.safeName('  ..hidden.  '), 'hidden');
  assert.equal(obs.safeName('CON'), '_CON');
  assert.throws(() => obs.safeName('///'), /title is required/);
  assert.equal(obs.safeFolder('../../etc'), 'etc', 'a folder can never climb out');
});

test('append_daily creates today\'s note once, then adds timestamped lines', (t) => {
  const vault = tempVault(t);
  obs.appendDaily(vault, { text: 'Shipped v4.1', tags: ['release'] }, NOW);
  const r = obs.appendDaily(vault, { text: 'line one\nline two' }, NOW);
  assert.equal(r.path, 'Daily/2026-10-31.md');
  const text = fs.readFileSync(path.join(vault, r.path), 'utf8');
  assert.match(text, /^---\ndate: "2026-10-31"\ntags:\n {2}- "daily"\n/);
  assert.match(text, /# 2026-10-31\n\n- 14:05 Shipped v4\.1 #release\n- 14:05 line one line two\n$/);
});

test('paths stay inside the vault: traversal, absolute, dot-folders and symlinks are refused', (t) => {
  const vault = tempVault(t);
  assert.throws(() => obs.readNote(vault, { path: '../outside.md' }), /outside the vault/);
  assert.throws(() => obs.readNote(vault, { path: path.join(os.tmpdir(), 'x.md') }), /relative to the vault/);
  assert.throws(() => obs.readNote(vault, { path: 'C:/Windows/win.md' }), /relative to the vault/);
  assert.throws(() => obs.readNote(vault, { path: '.obsidian/app.json' }), /off limits/);
  const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'md-outside-'));
  t.after(() => fs.rmSync(outside, { recursive: true, force: true }));
  fs.writeFileSync(path.join(outside, 'secret.md'), 'nope');
  let linked = true;
  try { fs.symlinkSync(outside, path.join(vault, 'link'), 'junction'); } catch { linked = false; }
  if (linked) {
    assert.throws(() => obs.readNote(vault, { path: 'link/secret.md' }), /outside the vault/);
    assert.throws(() => obs.saveNote(vault, { title: 'x', body: 'y', folder: 'link' }), /outside the vault/);
  }
});

test('read_note and search_notes find notes by text and tag, never inside dot-folders', (t) => {
  const vault = tempVault(t);
  obs.saveNote(vault, { title: 'Caching', body: 'Use the CDN for images.', tags: ['perf'] }, NOW);
  obs.saveNote(vault, { title: 'Auth', body: 'Sessions expire after a day.', folder: 'Topics' }, NOW);
  fs.writeFileSync(path.join(vault, 'Topics', 'Inline.md'), 'Plain note #perf/images\n');
  fs.writeFileSync(path.join(vault, '.obsidian', 'hidden.md'), 'CDN CDN CDN');
  assert.match(obs.readNote(vault, { path: 'DevLabs/Caching' }), /Use the CDN/);

  const byText = obs.searchNotes(vault, { query: 'cdn' });
  assert.deepEqual(byText.map((h) => h.path), ['DevLabs/Caching.md']);
  assert.match(byText[0].snippet, /CDN/);
  const byTag = obs.searchNotes(vault, { tag: 'perf' }).map((h) => h.path).sort();
  assert.deepEqual(byTag, ['DevLabs/Caching.md', 'Topics/Inline.md'], 'nested tags match their parent');
  assert.deepEqual(obs.searchNotes(vault, { folder: 'Topics' }).map((h) => h.path).sort(), ['Topics/Auth.md', 'Topics/Inline.md']);
});

test('a missing vault says how to fix it', () => {
  assert.throws(() => obs.saveNote('', { title: 'a', body: 'b' }), /Settings → Connections → Obsidian/);
  assert.throws(() => obs.saveNote(path.join(os.tmpdir(), 'no-such-vault-xyz'), { title: 'a', body: 'b' }), /not found/);
});

test('MCP loop: initialize, tools/list, tools/call, errors as tool results', async (t) => {
  const vault = tempVault(t);
  const server = { name: 'devlabs-obsidian', version: '1.0.0', tools: obs.tools(vault) };
  const init = await handle({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26' } }, server);
  assert.equal(init.result.protocolVersion, '2025-03-26');
  assert.deepEqual(init.result.capabilities, { tools: {} });
  assert.equal(await handle({ jsonrpc: '2.0', method: 'notifications/initialized' }, server), null);
  const list = await handle({ jsonrpc: '2.0', id: 2, method: 'tools/list' }, server);
  assert.deepEqual(list.result.tools.map((x) => x.name), ['save_note', 'append_daily', 'read_note', 'search_notes']);
  assert.equal(list.result.tools[0].run, undefined, 'handlers are not serialized');

  const ok = await handle({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'save_note', arguments: { title: 'Hi', body: 'there' } } }, server);
  assert.match(ok.result.content[0].text, /"created": true/);
  const bad = await handle({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'read_note', arguments: { path: '../x' } } }, server);
  assert.equal(bad.result.isError, true);
  const unknown = await handle({ jsonrpc: '2.0', id: 5, method: 'nope' }, server);
  assert.equal(unknown.error.code, -32601);
});
