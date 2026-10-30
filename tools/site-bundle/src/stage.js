// Shared WebGL stage for the site's 3D scenes: one transparent canvas sized to
// its host, a camera, pointer parallax, touch/mouse drag-to-spin with inertia
// (and optional pinch-to-zoom) via use-gesture, and a render loop that only
// runs while the host is on screen and the tab is visible.
import { Gesture } from '@use-gesture/vanilla';
import { Color, PerspectiveCamera, Scene, WebGLRenderer } from 'three';

export const LIME = new Color('#CDF252');
export const KEY = new Color('#E1642D');
export const BG = new Color('#181C17');

export function rand(seed) { // deterministic, so scenes look the same every visit
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export function createStage(host, { fov = 42, className = 'stage-3d' } = {}) {
  const canvas = document.createElement('canvas');
  canvas.className = className;
  canvas.setAttribute('aria-hidden', 'true');
  host.prepend(canvas);

  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.setClearColor(0x000000, 0);
  const scene = new Scene();
  const camera = new PerspectiveCamera(fov, 1, 0.1, 200);

  const resize = () => {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(h, 1);
    camera.updateProjectionMatrix();
  };
  resize();
  new ResizeObserver(resize).observe(host);

  // Pointer position in -1..1, eased toward the target every frame.
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  addEventListener('pointermove', (e) => {
    pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
    pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
  }, { passive: true });

  // Drag/fling spin and pinch zoom. Scenes add `spin.angle` to their rotation
  // and divide camera distance by `spin.zoom`.
  const spin = { angle: 0, vel: 0, zoom: 1, dragging: false };

  let visible = false, raf = 0, onFrame = null;
  const t0 = performance.now();
  const kick = () => { if (onFrame && visible && !document.hidden && !raf) raf = requestAnimationFrame(frame); };
  function frame(now) {
    raf = 0;
    if (!visible || document.hidden) return;
    pointer.x += (pointer.tx - pointer.x) * 0.05;
    pointer.y += (pointer.ty - pointer.y) * 0.05;
    if (!spin.dragging) { spin.angle += spin.vel; spin.vel *= 0.95; }
    onFrame((now - t0) / 1000);
    renderer.render(scene, camera);
    raf = requestAnimationFrame(frame);
  }
  new IntersectionObserver(([en]) => { visible = en.isIntersecting; kick(); }).observe(host);
  document.addEventListener('visibilitychange', kick);

  return {
    scene, camera, renderer, pointer, spin,
    /** Horizontal drag spins the scene (vertical swipes still scroll the page);
     * `pinch` also lets two fingers (or ctrl+wheel) zoom. Taps pass through. */
    enableGestures(target, { pinch = false } = {}) {
      target.classList.add('grab');
      const handlers = {
        onDrag: ({ delta: [dx], velocity: [vx], direction: [dir], down, tap }) => {
          if (tap) return;
          spin.dragging = down;
          spin.angle += dx * 0.01;
          if (!down) spin.vel = dir * Math.min(vx, 4) * 0.16;
        }
      };
      if (pinch) handlers.onPinch = ({ offset: [s] }) => { spin.zoom = s; };
      new Gesture(target, handlers, {
        drag: { axis: 'x', filterTaps: true },
        pinch: { scaleBounds: { min: 0.7, max: 1.6 }, rubberband: true }
      });
    },
    start(fn) {
      onFrame = fn;
      kick();
      requestAnimationFrame(() => canvas.classList.add('on'));
    }
  };
}
