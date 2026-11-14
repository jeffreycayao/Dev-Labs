'use strict';

// The vendored agency-agents roster (resources/agency-agents, written by
// tools/sync-agency-agents.cjs) and the manifest the Add Agent modal builds from a
// persona. Every persona must become a hire manifest that passes the same
// validation an imported hire does, since floors that include one round-trip
// through export/import.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { agencyHireManifest, agencyGoal } = loadTs('src/shared/agencyAgents.ts');
const { validateHireManifest, HIRE_GOAL_MAX } = loadTs('src/shared/hire.ts');

const DIR = path.join(__dirname, '..', 'resources', 'agency-agents');
const index = JSON.parse(fs.readFileSync(path.join(DIR, 'index.json'), 'utf8'));
const divisions = JSON.parse(fs.readFileSync(path.join(DIR, 'divisions.json'), 'utf8')).divisions;
const pin = require('../tools/agency-agents.json');

test('index is large, unique, pinned and every file is there', () => {
  assert.ok(index.agents.length >= 250, `only ${index.agents.length} agents`);
  assert.equal(index.source.commit, pin.commit);
  const ids = new Set(index.agents.map((a) => a.id));
  assert.equal(ids.size, index.agents.length);
  for (const a of index.agents) {
    assert.ok(divisions[a.division], `${a.id}: unknown division ${a.division}`);
    assert.equal(a.file, `${a.division}/${a.id}.md`);
    assert.doesNotMatch(a.file, /\.\./);
    const md = fs.readFileSync(path.join(DIR, a.file), 'utf8');
    assert.match(md, /^---\r?\n/, `${a.id}: no frontmatter`);
    const fmName = /^name:\s*["']?(.*?)["']?\s*$/m.exec(md)?.[1];
    assert.equal(fmName, a.name, `${a.id}: name drifted`);
  }
});

test('upstream MIT license ships next to the files', () => {
  assert.match(fs.readFileSync(path.join(DIR, 'LICENSE'), 'utf8'), /MIT License/);
});

test('every persona becomes a valid hire manifest', () => {
  for (const a of index.agents) {
    const md = fs.readFileSync(path.join(DIR, a.file), 'utf8');
    const m = agencyHireManifest(a, md);
    const res = validateHireManifest(m);
    assert.ok(res.ok, `${a.id}: ${res.errors.join('; ')}`);
    assert.ok(m.goal.length > 500, `${a.id}: goal too short (${m.goal.length})`);
    assert.ok(m.goal.length <= HIRE_GOAL_MAX);
    assert.doesNotMatch(m.goal, /^---/, `${a.id}: frontmatter left in goal`);
    assert.doesNotMatch(m.goal, /```/, `${a.id}: code fence left in goal`);
    assert.doesNotMatch(m.name, /[^\p{L}\p{N} ._-]/u, `${a.id}: name has odd chars`);
    assert.equal(m.provider, undefined);
    assert.equal(m.model, undefined);
    assert.deepEqual(m.capabilities, [a.division]);
  }
});

test('agencyGoal strips frontmatter and fences, caps length', () => {
  const g = agencyGoal('---\nname: X\n---\n\n# X\n\nDo things.\n\n```md\ntemplate\n```\n\n\n\nMore.');
  assert.equal(g, '# X\n\nDo things.\n\n_(template omitted — produce this deliverable in a clear, sensible format)_\n\nMore.');
  assert.ok(agencyGoal('x'.repeat(HIRE_GOAL_MAX + 500)).length <= HIRE_GOAL_MAX);
});
