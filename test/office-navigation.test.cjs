'use strict';

// 3D office navigation: on the default floor layout every desk must be able to
// reach the kitchen, the gym, the QA lab and the server room. Guards two
// regressions: Claw3D's wall padding sealing the east-wing corridors, and a
// desk row placed hard against a wall so its seat is boxed in.

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const esbuild = require('esbuild');

const root = path.resolve(__dirname, '..');
const entry = `
import * as fd from "@/features/retro-office/core/furnitureDefaults";
import * as nav from "@/features/retro-office/core/navigation";
export const layout = () =>
  fd.ensureOfficeKanbanBoard(fd.ensureOfficeJukebox(fd.ensureOfficeQaLab(fd.ensureOfficeGymRoom(
    fd.ensureOfficeServerRoom(fd.ensureOfficePhoneBooth(fd.ensureOfficeSmsBooth(fd.ensureOfficeAtm(
      fd.ensureOfficePingPongTable(fd.materializeDefaults("office"))))))))));
export { nav };
`;

const load = () => {
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
  return mod.exports;
};

test('every desk reaches the kitchen, gym, QA lab and server room', () => {
  const { layout, nav } = load();
  const furniture = layout();
  const grid = nav.buildNavGrid(furniture);
  const desks = nav.getDeskLocations(furniture);
  assert.equal(desks.length, 17, '16 workstations + the boss-office desk');
  const gymSpot = nav.getGymWorkoutLocations(furniture)[0];
  const qaSpot = nav.getQaLabStations(furniture)[0];
  for (const [i, d] of desks.entries()) {
    const gym = nav.resolveGymRoute(d.x, d.y, gymSpot);
    const qa = nav.resolveQaLabRoute(d.x, d.y, qaSpot);
    const server = nav.resolveServerRoomRoute(d.x, d.y);
    assert.ok(nav.astar(d.x, d.y, 900, 150, grid).length > 0, `desk ${i} → kitchen`);
    assert.ok(nav.astar(d.x, d.y, gym.targetX, gym.targetY, grid).length > 0, `desk ${i} → gym`);
    assert.ok(nav.astar(d.x, d.y, qa.targetX, qa.targetY, grid).length > 0, `desk ${i} → QA lab`);
    assert.ok(nav.astar(d.x, d.y, server.targetX, server.targetY, grid).length > 0, `desk ${i} → server room`);
  }
});
