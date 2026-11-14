'use strict';

// Owner feature switches (src/shared/features.ts) and the personal ATTITUDE.md
// layer: the switch defaults, the text cap, and that the block reaches every
// agent's instructions only when there is text — and that switched-off bundled
// skills are not copied to the agent.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const features = loadTs('src/shared/features.ts');
const attitude = loadTs('src/shared/attitude.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

test('a missing switch is its default; a stored boolean wins', () => {
  for (const k of features.FEATURE_KEYS) assert.equal(features.featureOn(undefined, k), features.FEATURE_DEFAULTS[k], k);
  assert.equal(features.featureOn({ attitudeFile: false }, 'attitudeFile'), false);
  assert.equal(features.featureOn({ attitudeFile: 'yes' }, 'attitudeFile'), features.FEATURE_DEFAULTS.attitudeFile, 'junk is not a switch');
});

test('ATTITUDE text is trimmed, de-controlled and capped; nothing in → no block', () => {
  assert.equal(attitude.normalizeAttitude('  hi\r\nthere\u0007 '), 'hi\nthere');
  assert.equal(attitude.normalizeAttitude('x'.repeat(attitude.ATTITUDE_MAX_CHARS + 50)).length, attitude.ATTITUDE_MAX_CHARS);
  assert.equal(attitude.normalizeAttitude(42), '');
  assert.equal(attitude.attitudePromptBlock(''), '');
  assert.equal(attitude.attitudePromptBlock(undefined), '');
  assert.match(attitude.attitudePromptBlock('Be brief.'), /HOW TO TALK TO THE HUMAN[\s\S]*\nBe brief\.$/);
});

const promptArg = (inj) => inj.args[inj.args.indexOf('--append-system-prompt') + 1];

test('the ATTITUDE block rides in the Claude system prompt only when there is text', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-attitude-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const meta = { id: 'a-1', name: 'Ana', provider: 'claude', cwd: home };
  const with_ = await hive.ensureAgent(meta, { attitude: 'Tagalog muna. Short answers.' });
  assert.match(promptArg(with_), /HOW TO TALK TO THE HUMAN[\s\S]*Tagalog muna\. Short answers\./);
  const without = await hive.ensureAgent(meta, { attitude: '' });
  assert.ok(!promptArg(without).includes('HOW TO TALK TO THE HUMAN'));
  const off = await hive.ensureAgent(meta, {});
  assert.ok(!promptArg(off).includes('HOW TO TALK TO THE HUMAN'));
});

test('switched-off bundled skills are not copied, and a stale copy is removed', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-skills-off-'));
  const skills = fs.mkdtempSync(path.join(os.tmpdir(), 'md-skills-src-'));
  t.after(() => { for (const d of [home, skills]) fs.rmSync(d, { recursive: true, force: true }); });
  for (const id of ['keep', 'threejs']) {
    fs.mkdirSync(path.join(skills, id));
    fs.writeFileSync(path.join(skills, id, 'SKILL.md'), `---\nname: ${id}\n---\n`);
  }
  const hive = new HiveManager(() => home);
  const meta = { id: 'b-1', name: 'Ben', provider: 'claude', cwd: home };
  await hive.ensureAgent(meta, { skillsDir: skills });
  const dest = path.join(home, 'hive', 'agents', 'b-1', '.claude', 'skills');
  assert.ok(fs.existsSync(path.join(dest, 'threejs', 'SKILL.md')), 'on by default: copied');
  await hive.ensureAgent(meta, { skillsDir: skills, skillsExclude: ['threejs'] });
  assert.ok(fs.existsSync(path.join(dest, 'keep', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(dest, 'threejs')), 'off: gone, including the earlier copy');
});

test('every id the extraSkills switch controls is a bundled skill folder', () => {
  for (const id of features.EXTRA_SKILL_IDS) {
    assert.ok(fs.existsSync(path.join(__dirname, '..', 'resources', 'skills', id, 'SKILL.md')), id);
  }
});
