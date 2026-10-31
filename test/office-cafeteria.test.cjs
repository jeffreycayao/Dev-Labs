'use strict';

// The v4.2.2 layout: gym and QA lab stacked in the east strip, a kapihan where
// they stood. Guards what a misplaced coordinate breaks silently: furniture
// overlapping in the new rooms, an unreachable workout spot / QA station /
// kapihan seat, and saved floors from v4.2.1 not migrating.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..');
const entry = `
import * as fd from "@/features/retro-office/core/furnitureDefaults";
import * as nav from "@/features/retro-office/core/navigation";
import { getItemBounds } from "@/features/retro-office/core/geometry";
export const chain = (items) =>
  fd.ensureOfficeCafeteria(fd.ensureOfficeKanbanBoard(fd.ensureOfficeJukebox(fd.ensureOfficeQaLab(fd.ensureOfficeGymRoom(
    fd.ensureOfficeServerRoom(fd.ensureOfficePhoneBooth(fd.ensureOfficeSmsBooth(fd.ensureOfficeAtm(
      fd.ensureOfficePingPongTable(items))))))))), "test-" + Math.random());
export { fd, nav, getItemBounds };
`;

let cached;
const load = () => {
  if (cached) return cached;
  // persistence.ts reads localStorage for the migration flags.
  globalThis.localStorage ??= { getItem: () => null, setItem: () => {}, removeItem: () => {} };
  const out = esbuild.buildSync({
    stdin: { contents: entry, resolveDir: root, loader: 'ts' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    write: false,
    alias: { '@': path.join(root, 'src/renderer/src') },
    logLevel: 'silent'
  });
  const mod = { exports: {} };
  new Function('module', 'exports', 'require', out.outputFiles[0].text)(mod, mod.exports, require);
  return (cached = mod.exports);
};

// Things an agent cannot walk through; chairs, doors and wall-mounted or
// counter-top items are passable or sit on something else.
const PASSABLE = new Set(['chair', 'door', 'coffee_machine', 'microwave', 'wall_cabinet', 'yoga_mat', 'trash', 'lamp', 'plant']);
const inZone = (b) => b.x + b.w > 1140 && b.x < 1800;

test('no two solid pieces overlap in the kapihan, gym or QA lab', () => {
  const { fd, getItemBounds } = load();
  const items = fd.materializeDefaults('office')
    .filter((i) => !PASSABLE.has(i.type) && i.type !== 'wall')
    .map((i) => ({ i, b: getItemBounds(i) }))
    .filter(({ b }) => inZone(b));
  assert.ok(items.length > 20, 'the zone is furnished');
  for (let a = 0; a < items.length; a++) {
    for (let c = a + 1; c < items.length; c++) {
      const p = items[a].b;
      const q = items[c].b;
      const overlap = p.x < q.x + q.w && q.x < p.x + p.w && p.y < q.y + q.h && q.y < p.y + p.h;
      assert.ok(!overlap, `${items[a].i.type}@${items[a].i.x},${items[a].i.y} overlaps ${items[c].i.type}@${items[c].i.x},${items[c].i.y}`);
    }
  }
});

test('every workout spot, QA station and kapihan seat is reachable from a desk', () => {
  const { fd, nav } = load();
  const furniture = fd.materializeDefaults('office');
  const grid = nav.buildNavGrid(furniture);
  const desk = nav.getDeskLocations(furniture)[0];
  for (const spot of nav.getGymWorkoutLocations(furniture)) {
    const door = nav.resolveGymRoute(desk.x, desk.y, spot);
    assert.ok(nav.astar(desk.x, desk.y, door.targetX, door.targetY, grid).length > 0, 'desk → gym door');
    const inside = nav.resolveGymRoute(1600, 200, spot);
    assert.equal(inside.stage, 'workout');
    assert.ok(nav.astar(1600, 200, spot.x, spot.y, grid).length > 0, `gym door → ${spot.workoutStyle} at ${spot.x},${spot.y}`);
  }
  const desk2qa = nav.resolveQaLabRoute(desk.x, desk.y);
  assert.ok(nav.astar(desk.x, desk.y, desk2qa.targetX, desk2qa.targetY, grid).length > 0, 'desk → QA door');
  for (const station of nav.getQaLabStations(furniture)) {
    const inside = nav.resolveQaLabRoute(1600, 525, station);
    assert.equal(inside.stage, 'station');
    assert.ok(nav.astar(1600, 525, station.x, station.y, grid).length > 0, `QA door → ${station.stationType} at ${station.x},${station.y}`);
  }
  const seats = furniture.filter((i) => i.type === 'chair' && i.x > 1140 && i.x < 1540);
  assert.equal(seats.length, 24, 'six tables of four');
  for (const s of seats) {
    assert.ok(nav.astar(desk.x, desk.y, s.x + 12, s.y + 12, grid).length > 0, `desk → kapihan chair at ${s.x},${s.y}`);
  }
});

test('a v4.2.1 floor moves its rooms to the east strip and gains the kapihan once', () => {
  const { fd, chain } = load();
  const fresh = fd.materializeDefaults('office');
  // Rebuild what a v4.2.1 floor saved: the east-wing rooms, no kapihan.
  const isNewZone = (i) => (i.x >= 1140 && i.x < 1800);
  const old = chain(fresh.filter((i) => !isNewZone(i)).concat(oldEastWing()));
  const types = (list, t) => list.filter((i) => i.type === t);
  assert.equal(types(old, 'treadmill').length, 1);
  assert.ok(types(old, 'treadmill')[0].x >= 1550, 'gym moved to the east strip');
  assert.ok(types(old, 'qa_terminal')[0].x >= 1550, 'QA lab moved to the east strip');
  assert.equal(old.filter((i) => i.type === 'chair' && i.x > 1140 && i.x < 1540).length, 24, 'kapihan added');
  assert.equal(chain(old).length, old.length, 'running it again changes nothing');
});

// The v4.2.1 east-wing gym and QA lab exactly as that version saved them.
function oldEastWing() {
  const W = 8; const top = 40; const bottomWall = 672;
  const gymX = 1126; const gymEnd = 1302; const qaX = 1358; const qaEnd = 1534;
  return [
    { type: 'wall', x: gymX, y: top, w: W, h: 640 },
    { type: 'wall', x: gymX, y: top, w: gymEnd - gymX + W, h: W },
    { type: 'wall', x: gymX, y: bottomWall, w: gymEnd - gymX + W, h: W },
    { type: 'wall', x: gymEnd, y: top, w: W, h: 220 },
    { type: 'door', x: 1280, y: 280, w: 40, h: 8, facing: 90 },
    { type: 'wall', x: gymEnd, y: 300, w: W, h: 380 },
    { type: 'treadmill', x: 1142, y: 90, facing: 90 },
    { type: 'weight_bench', x: 1204, y: 92, facing: 90 },
    { type: 'dumbbell_rack', x: 1220, y: 160, facing: 180 },
    { type: 'rowing_machine', x: 1140, y: 222, facing: 90 },
    { type: 'kettlebell_rack', x: 1224, y: 248, facing: 180 },
    { type: 'exercise_bike', x: 1146, y: 366, facing: 90 },
    { type: 'punching_bag', x: 1266, y: 380, facing: 0 },
    { type: 'yoga_mat', x: 1168, y: 542, facing: 0, color: '#0f766e' },
    { type: 'plant', x: 1268, y: 82 },
    { type: 'plant', x: 1268, y: 622 },
    { type: 'wall', x: qaX, y: top, w: W, h: 220 },
    { type: 'door', x: 1340, y: 280, w: 40, h: 8, facing: 90 },
    { type: 'wall', x: qaX, y: 300, w: W, h: 380 },
    { type: 'wall', x: qaX, y: top, w: qaEnd - qaX + W, h: W },
    { type: 'wall', x: qaX, y: bottomWall, w: qaEnd - qaX + W, h: W },
    { type: 'wall', x: qaEnd, y: top, w: W, h: 640 },
    { type: 'qa_terminal', x: 1374, y: 92, facing: 90 },
    { type: 'device_rack', x: 1454, y: 92, facing: 180 },
    { type: 'device_rack', x: 1454, y: 204, facing: 180 },
    { type: 'test_bench', x: 1372, y: 316, facing: 90 },
    { type: 'test_bench', x: 1372, y: 450, facing: 90 },
    { type: 'plant', x: 1496, y: 82 },
    { type: 'plant', x: 1496, y: 622 },
  ].map((i, n) => ({ ...i, _uid: `old_${n}` }));
}
