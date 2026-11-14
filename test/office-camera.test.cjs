'use strict';
// Camera clamp/zoom math for the 3D office (src/renderer/src/features/retro-office/core/cameraMath.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const cam = loadTs(require.resolve('../src/renderer/src/features/retro-office/core/cameraMath.ts'));

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} != ${b}`);

test('wheelZoom stays inside the limits and is symmetric per notch', () => {
  assert.equal(cam.wheelZoom(cam.ZOOM_MAX, -100), cam.ZOOM_MAX);
  assert.equal(cam.wheelZoom(cam.ZOOM_MIN, 100), cam.ZOOM_MIN);
  const z = cam.wheelZoom(60, -100);
  assert.ok(z > 60);
  close(cam.wheelZoom(z, 100), 60);
  // A pinch step is small in deltaY but should still move the zoom noticeably.
  assert.ok(cam.wheelZoom(60, -5, true) > cam.wheelZoom(60, -5));
});

test('fitZoom follows the narrower side of the panel and clamps', () => {
  close(cam.fitZoom(2000, 800), 800 * 0.047);
  close(cam.fitZoom(1000, 2000), 1000 * 0.03);
  assert.equal(cam.fitZoom(10, 10), cam.ZOOM_MIN);
  assert.equal(cam.fitZoom(5000, 5000), 80);
});

test('clampTarget keeps the target inside the floor bounds', () => {
  const b = { minX: -10, maxX: 10, minZ: -4, maxZ: 4 };
  assert.deepEqual(cam.clampTarget(0, 0, b), [0, 0]);
  assert.deepEqual(cam.clampTarget(-50, 50, b), [-10, 4]);
  assert.deepEqual(cam.clampTarget(11, -5, b), [10, -4]);
});

test('approach halves the distance every half-life and converges', () => {
  close(cam.approach(0, 100, 50, 50), 50);
  close(cam.approach(0, 100, 50, 100), 75);
  assert.equal(cam.approach(100, 100, 50, 16), 100);
});

// A camera looking straight down from y = 10, +x right, +z down the screen.
const topDown = {
  position: { x: 3, y: 10, z: 2 },
  right: { x: 1, y: 0, z: 0 },
  up: { x: 0, y: 0, z: -1 },
  forward: { x: 0, y: -1, z: 0 },
};

test('floorPointUnderCursor projects screen space onto the floor', () => {
  assert.deepEqual(cam.floorPointUnderCursor(topDown, 0, 0, 400, 300, 50), [3, 2]);
  // Right edge at zoom 50 (px per unit): 400 px / 50 = 8 units.
  assert.deepEqual(cam.floorPointUnderCursor(topDown, 1, 0, 400, 300, 50), [11, 2]);
  // Top edge: 300 px / 50 = 6 units toward -z.
  assert.deepEqual(cam.floorPointUnderCursor(topDown, 0, 1, 400, 300, 50), [3, -4]);
  // A camera parallel to the floor never hits it.
  assert.equal(
    cam.floorPointUnderCursor({ ...topDown, forward: { x: 1, y: 0, z: 0 } }, 0, 0, 400, 300, 50),
    null,
  );
});

test('zoomAnchorShift keeps the point under the cursor fixed', () => {
  const [dx, dz] = cam.zoomAnchorShift(topDown, 1, 1, 400, 300, 50, 100);
  const moved = { ...topDown, position: { x: topDown.position.x + dx, y: 10, z: topDown.position.z + dz } };
  const was = cam.floorPointUnderCursor(topDown, 1, 1, 400, 300, 50);
  const now = cam.floorPointUnderCursor(moved, 1, 1, 400, 300, 100);
  close(was[0], now[0]);
  close(was[1], now[1]);
  // Zooming at the center never slides the camera.
  assert.deepEqual(cam.zoomAnchorShift(topDown, 0, 0, 400, 300, 50, 100), [0, 0]);
});

test('zoomAnchorShift also holds for a tilted isometric camera', () => {
  const s = Math.SQRT1_2;
  const iso = {
    position: { x: 0, y: 10, z: 10 },
    right: { x: 1, y: 0, z: 0 },
    up: { x: 0, y: s, z: -s },
    forward: { x: 0, y: -s, z: -s },
  };
  const [dx, dz] = cam.zoomAnchorShift(iso, -0.6, 0.4, 500, 350, 40, 130);
  const moved = { ...iso, position: { x: dx, y: 10, z: 10 + dz } };
  const was = cam.floorPointUnderCursor(iso, -0.6, 0.4, 500, 350, 40);
  const now = cam.floorPointUnderCursor(moved, -0.6, 0.4, 500, 350, 130);
  close(was[0], now[0]);
  close(was[1], now[1]);
});

test('screenConstantSize shrinks in world units as the camera zooms in', () => {
  assert.equal(cam.screenConstantSize(40, 40), 1);
  assert.equal(cam.screenConstantSize(40, 160), 0.25);
  assert.equal(cam.screenConstantSize(40, 400, 0.2), 0.2);
});
