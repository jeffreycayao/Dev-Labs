'use strict';

/**
 * The list of files kept out of an agent's mempalace/git index used to exist
 * TWICE (hive.ts at spawn, memory.ts on every mine cycle), and the memory.ts
 * copy followed symlinks: an agent could link its .gitignore to ~/.bashrc and
 * have main append to it, or plant a FIFO and freeze main. Now there is one,
 * link-safe writer in hive.ts. Pin both facts.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

test('memory.ts has no copy of the ignore list: it uses the hive.ts writer', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/memory.ts'), 'utf8');
  assert.doesNotMatch(src, /const MINE_IGNORE_LINES/);
  assert.match(src, /import \{ ensureMineIgnore \} from '\.\/hive'/);
  const hive = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.match(hive, /const MINE_IGNORE_LINES = \[[^\]]*'\.codex\/'/, 'Codex homes must stay out of the index');
});

test('a .gitignore planted as a link is replaced, never written through', (t) => {
  const { ensureMineIgnore } = loadTs('src/main/hive.ts');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mine-ignore-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const victim = path.join(dir, 'victim.txt');
  fs.writeFileSync(victim, 'precious\n');
  const agent = path.join(dir, 'agent');
  fs.mkdirSync(agent);
  try { fs.symlinkSync(victim, path.join(agent, '.gitignore'), 'file'); }
  catch (e) { if (e.code === 'EPERM') return t.skip('file symlinks not permitted here'); throw e; }
  ensureMineIgnore(agent);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'precious\n');
  assert.equal(fs.lstatSync(path.join(agent, '.gitignore')).isSymbolicLink(), false);
  assert.match(fs.readFileSync(path.join(agent, '.gitignore'), 'utf8'), /^mcp\.json$/m);
});
