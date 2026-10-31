'use strict';

// 3D office building levels: at most 15 agents per level, Ramon pinned to the
// first level outside the cap, saved placements kept, overflow adds a level.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const lv = loadTs('src/shared/officeLevels.ts');
const ids = (n, prefix = 'a') => Array.from({ length: n }, (_, i) => `${prefix}${i}`);

test('agents fill the first level up to 15, then a new level is added', () => {
  const s = lv.assignOfficeLevels(ids(16), lv.EMPTY_LEVELS);
  assert.equal(s.count, 2);
  assert.equal(Object.values(s.byAgent).filter((l) => l === 0).length, 15);
  assert.equal(s.byAgent.a15, 1);
});

test('Ramon is pinned to the first level and does not count toward its cap', () => {
  const s = lv.assignOfficeLevels(['god', ...ids(15)], { count: 1, byAgent: { god: 3 } }, ['god']);
  assert.equal(s.count, 1);
  assert.equal(s.byAgent.god, 0);
  assert.equal(lv.moveAgentToLevel(s, 'god', 0, ['god']), null);
});

test('saved placements are kept, departed agents dropped, empty added levels kept', () => {
  const s = lv.assignOfficeLevels(['a', 'b'], { count: 3, byAgent: { a: 2, gone: 1 } });
  assert.deepEqual(s, { count: 3, byAgent: { a: 2, b: 0 } });
});

test('moving to a full level is refused; moving to a level with room works', () => {
  const full = lv.assignOfficeLevels(ids(15), { count: 2, byAgent: {} });
  const extra = lv.assignOfficeLevels([...ids(15), 'x'], full);
  assert.equal(extra.byAgent.x, 1);
  assert.equal(lv.moveAgentToLevel(extra, 'x', 0), null);
  assert.equal(lv.moveAgentToLevel(extra, 'a0', 1).byAgent.a0, 1);
  assert.equal(lv.moveAgentToLevel(extra, 'a0', 5), null);
});

test('stored state parses defensively', () => {
  assert.deepEqual(lv.parseOfficeLevels(null), lv.EMPTY_LEVELS);
  assert.deepEqual(lv.parseOfficeLevels('nope'), lv.EMPTY_LEVELS);
  assert.deepEqual(lv.parseOfficeLevels('{"count":2,"byAgent":{"a":1,"b":"x"}}'), { count: 2, byAgent: { a: 1 } });
  assert.equal(lv.parseOfficeLevels('{"count":1000000000,"byAgent":{}}').count, lv.MAX_LEVELS);
});

test('only an empty floor above the first can be deleted; floors above move down', () => {
  const s = { count: 4, byAgent: { god: 0, a: 1, b: 3 } };
  assert.equal(lv.removeOfficeLevel(s, 0), null, 'floor 1 is Ramon\'s');
  assert.equal(lv.removeOfficeLevel(s, 1), null, 'floor 2 still has an agent');
  assert.equal(lv.removeOfficeLevel(s, 4), null, 'no such floor');
  assert.deepEqual(lv.removeOfficeLevel(s, 2), { count: 3, byAgent: { god: 0, a: 1, b: 2 } });
});

test('deleting a floor drops its saved layout and renumbers the ones above', () => {
  const keys = [
    'devlabs.office3d.desks.1', 'devlabs.office3d.desks.2', 'devlabs.office3d.desks.3',
    'office:devlabs-v4-floor-2', 'office:devlabs-v4-floor-3', 'office:gym:devlabs-v4-floor-4',
    'devlabs.office3d.levels', 'unrelated'
  ];
  const { drop, moves } = lv.levelKeyMoves(keys, 1);
  assert.deepEqual(drop.sort(), ['devlabs.office3d.desks.1', 'office:devlabs-v4-floor-2']);
  assert.deepEqual(moves, [
    ['devlabs.office3d.desks.2', 'devlabs.office3d.desks.1'],
    ['office:devlabs-v4-floor-3', 'office:devlabs-v4-floor-2'],
    ['devlabs.office3d.desks.3', 'devlabs.office3d.desks.2'],
    ['office:gym:devlabs-v4-floor-4', 'office:gym:devlabs-v4-floor-3']
  ]);
  // Lowest level first: no move targets a key that a later move still has to read.
  const pending = new Set(moves.map(([from]) => from));
  for (const [from, to] of moves) { pending.delete(from); assert.ok(!pending.has(to)); }
});
