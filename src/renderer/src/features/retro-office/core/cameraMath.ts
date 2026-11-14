// Pure math for the orthographic office camera. No three.js import so
// test/office-camera.test.cjs can load it with node:test.

export type Vec3Like = { x: number; y: number; z: number };
export type CameraFrame = {
  position: Vec3Like;
  right: Vec3Like;
  up: Vec3Like;
  forward: Vec3Like;
};
export type PanBounds = { minX: number; maxX: number; minZ: number; maxZ: number };

/** Whole floor fits at the low end; one desk fills the panel at the high end. */
export const ZOOM_MIN = 25;
export const ZOOM_MAX = 220;

export const clamp = (value: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, value));

/** Overview zoom that fits the whole floor to a panel of this size. */
export const fitZoom = (width: number, height: number) =>
  clamp(Math.min(width * 0.03, height * 0.047), ZOOM_MIN, 80);

/** Zoom after one wheel or pinch step. Exponential, so every notch changes the
 *  view by the same fraction whether zoomed in or out. Chromium reports a
 *  trackpad pinch as a wheel event with ctrlKey and small deltas. */
export const wheelZoom = (
  zoom: number,
  deltaY: number,
  pinch = false,
  min = ZOOM_MIN,
  max = ZOOM_MAX,
) => clamp(zoom * Math.exp(-deltaY * (pinch ? 0.01 : 0.0012)), min, max);

/** Keep the orbit target over the floor so panning can never lose the office. */
export const clampTarget = (x: number, z: number, b: PanBounds): [number, number] => [
  clamp(x, b.minX, b.maxX),
  clamp(z, b.minZ, b.maxZ),
];

/** Frame-rate independent easing: halves the remaining distance every `halfLifeMs`. */
export const approach = (current: number, target: number, halfLifeMs: number, dtMs: number) =>
  target + (current - target) * Math.pow(0.5, dtMs / halfLifeMs);

/** Floor point (y = 0) under a screen position for an orthographic camera.
 *  nx, ny are normalized device coords (-1..1); halfW/halfH the viewport half
 *  size in pixels; zoom is pixels per world unit. */
export const floorPointUnderCursor = (
  cam: CameraFrame,
  nx: number,
  ny: number,
  halfW: number,
  halfH: number,
  zoom: number,
): [number, number] | null => {
  const sx = (nx * halfW) / zoom;
  const sy = (ny * halfH) / zoom;
  const ox = cam.position.x + cam.right.x * sx + cam.up.x * sy;
  const oy = cam.position.y + cam.right.y * sx + cam.up.y * sy;
  const oz = cam.position.z + cam.right.z * sx + cam.up.z * sy;
  if (Math.abs(cam.forward.y) < 1e-6) return null;
  const t = -oy / cam.forward.y;
  if (t < 0) return null;
  return [ox + cam.forward.x * t, oz + cam.forward.z * t];
};

/** How far to slide camera and target (x, z) so the floor point under the
 *  cursor stays put while the zoom changes from `before` to `after`. */
export const zoomAnchorShift = (
  cam: CameraFrame,
  nx: number,
  ny: number,
  halfW: number,
  halfH: number,
  before: number,
  after: number,
): [number, number] => {
  const a = floorPointUnderCursor(cam, nx, ny, halfW, halfH, before);
  const b = floorPointUnderCursor(cam, nx, ny, halfW, halfH, after);
  if (!a || !b) return [0, 0];
  return [a[0] - b[0], a[1] - b[1]];
};

/** World size that keeps a floor marker `px` pixels wide at any zoom, so a
 *  hover ring reads the same from the whole-floor view to a single desk. */
export const screenConstantSize = (px: number, zoom: number, minWorld = 0) =>
  Math.max(minWorld, px / zoom);
