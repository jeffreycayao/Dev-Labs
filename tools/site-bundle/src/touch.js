// Touch-first interactives (use-gesture + Motion). Each one works with a mouse
// too, and each has a no-JS / reduced-motion fallback in the markup and CSS.
import { DragGesture } from '@use-gesture/vanilla';
import { animate } from 'motion';

const SPRING = { type: 'spring', stiffness: 260, damping: 24 };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ─── Tools marquee: drifts on its own; drag or fling it, it keeps going ───
export function marquee(root, reduced) {
  const track = root.querySelector('.marquee-track');
  if (!track) return;
  track.append(...[...track.children].map((n) => { const c = n.cloneNode(true); c.setAttribute('aria-hidden', 'true'); return c; }));
  root.classList.add('live');
  let x = 0, vel = 0, dragging = false, hover = false;
  const cruise = reduced ? 0 : -0.45;
  const half = () => track.scrollWidth / 2;
  const tick = () => {
    if (!dragging) {
      vel += ((hover ? 0 : cruise) - vel) * 0.04;
      x += vel;
    }
    const w = half();
    if (w > 0) { if (x <= -w) x += w; if (x > 0) x -= w; }
    track.style.transform = `translate3d(${x}px,0,0)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  root.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') hover = true; });
  root.addEventListener('pointerleave', () => { hover = false; });
  new DragGesture(root, ({ delta: [dx], velocity: [vx], direction: [dir], down }) => {
    dragging = down;
    x += dx;
    if (!down) vel = dir * Math.min(vx, 3) * 16;
  }, { axis: 'x', filterTaps: true });
}

// ─── A day in the building: swipe the cards or drag the time scrubber ─────
export function dayline(root) {
  const track = root.querySelector('.day-track');
  const bar = root.querySelector('.scrub');
  const knob = root.querySelector('.scrub-knob');
  const stops = [...root.querySelectorAll('.scrub-stop')];
  if (!track || !bar || !knob) return;
  const maxScroll = () => Math.max(1, track.scrollWidth - track.clientWidth);
  const sync = () => {
    const p = track.scrollLeft / maxScroll();
    knob.style.left = `${p * 100}%`;
    const i = Math.round(p * (stops.length - 1));
    stops.forEach((s, k) => s.setAttribute('aria-current', k === i ? 'true' : 'false'));
  };
  track.addEventListener('scroll', sync, { passive: true });
  addEventListener('resize', sync);
  sync();
  const seek = (clientX, smooth) => {
    const r = bar.getBoundingClientRect();
    const p = clamp((clientX - r.left) / r.width, 0, 1);
    track.scrollTo({ left: p * maxScroll(), behavior: smooth ? 'smooth' : 'auto' });
  };
  new DragGesture(bar, ({ xy: [cx], tap, first }) => { seek(cx, tap || first); }, { filterTaps: false });
  stops.forEach((s, k) => s.addEventListener('click', (e) => {
    e.stopPropagation();
    track.scrollTo({ left: (k / (stops.length - 1)) * maxScroll(), behavior: 'smooth' });
  }));
}

// ─── Role deck: swipe the top card away; it goes to the back ──────────────
export function deck(root, reduced) {
  const stack = root.querySelector('.deck-stack');
  const next = root.querySelector('[data-deck-next]');
  const prev = root.querySelector('[data-deck-prev]');
  const count = root.querySelector('[data-deck-count]');
  if (!stack) return;
  root.classList.add('live');
  const cards = () => [...stack.children];
  const total = cards().length;
  let seen = 1;
  const layout = (instant) => {
    cards().forEach((c, i) => {
      const depth = Math.min(i, 3);
      c.style.zIndex = String(100 - i);
      c.setAttribute('aria-hidden', i === 0 ? 'false' : 'true');
      c.tabIndex = i === 0 ? 0 : -1;
      const to = { x: 0, y: depth * 14, scale: 1 - depth * 0.05, rotate: 0, opacity: i > 3 ? 0 : 1 };
      animate(c, to, instant || reduced ? { duration: 0 } : SPRING);
    });
    if (count) count.textContent = `${((seen - 1) % total) + 1} / ${total}`;
  };
  const advance = (dir) => {
    const top = cards()[0];
    const done = () => { stack.append(top); seen += 1; layout(); };
    if (reduced) return done();
    animate(top, { x: dir * 480, rotate: dir * 18, opacity: 0 }, { duration: 0.32, ease: [0.4, 0, 1, 1] }).then(done);
  };
  const back = () => {
    const last = cards()[total - 1];
    stack.prepend(last);
    seen = seen <= 1 ? total : seen - 1;
    if (!reduced) animate(last, { x: -480, rotate: -18, opacity: 0 }, { duration: 0 });
    layout();
  };
  layout(true);
  next && next.addEventListener('click', () => advance(1));
  prev && prev.addEventListener('click', back);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); advance(1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
  });
  new DragGesture(stack, ({ movement: [mx], velocity: [vx], direction: [dir], down, tap }) => {
    if (tap) return;
    const top = cards()[0];
    if (down) {
      animate(top, { x: mx, rotate: mx / 20 }, { duration: 0 });
    } else if (Math.abs(mx) > 110 || vx > 0.6) {
      advance(dir || Math.sign(mx) || 1);
    } else {
      animate(top, { x: 0, rotate: 0 }, SPRING);
    }
  }, { axis: 'x', filterTaps: true });
}

// ─── Auto / Ask-first switch: shows what an agent does in each mode ───────
export function safetySwitch(root) {
  const btn = root.querySelector('[role="switch"]');
  if (!btn) return;
  const set = (ask) => {
    btn.setAttribute('aria-checked', ask ? 'true' : 'false');
    root.dataset.mode = ask ? 'ask' : 'auto';
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-checked') !== 'true'));
  new DragGesture(btn, ({ movement: [mx], last, tap }) => {
    if (tap || !last) return;
    if (Math.abs(mx) > 12) set(mx > 0);
  }, { axis: 'x' });
  set(btn.getAttribute('aria-checked') === 'true');
}

// ─── Press-and-tilt for tiles on touch screens (tablets) ─────────────────
export function touchTilt(tiles) {
  for (const tile of tiles) {
    new DragGesture(tile, ({ movement: [mx, my], down }) => {
      if (down) {
        animate(tile, { rotateY: clamp(mx / 6, -12, 12), rotateX: clamp(-my / 6, -10, 10), z: 18 }, SPRING);
      } else {
        animate(tile, { rotateX: 0, rotateY: 0, z: 0 }, SPRING);
      }
    }, { filterTaps: true });
  }
}
