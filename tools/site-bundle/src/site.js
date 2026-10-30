// devlabs.atmt.dev motion layer: Lenis smooth scroll, Motion (Framer Motion's vanilla
// API) for reveals, springs and scroll-linked effects, and three.js scenes that
// load lazily. Progressive enhancement only: every page reads and works with
// this script blocked, and prefers-reduced-motion turns all of it off.
// Build: `npm run build` in tools/site-bundle → site/assets/js/.
import Lenis from 'lenis';
import { animate, inView, scroll } from 'motion';
import { dayline, deck, marquee, safetySwitch, touchTilt } from './touch.js';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const EASE = [0.2, 0.7, 0.2, 1];
if (!reduced) root.classList.add('js');

// ─── Smooth scroll ────────────────────────────────────────────────────────
const NAV_OFFSET = -96; // sticky nav height + breathing room
let lenis = null;
if (!reduced) {
  lenis = new Lenis({ duration: 1.15, easing: (t) => 1 - Math.pow(1 - t, 4), smoothWheel: true });
  const raf = (time) => { lenis.raf(time); requestAnimationFrame(raf); };
  requestAnimationFrame(raf);
  root.classList.add('lenis');
}
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[href*="#"]');
  if (!a) return;
  const url = new URL(a.href, location.href);
  if (url.pathname !== location.pathname || !url.hash || url.hash === '#') return;
  const target = document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if (!target) return;
  e.preventDefault();
  history.pushState(null, '', url.hash);
  if (lenis) lenis.scrollTo(target, { offset: NAV_OFFSET });
  else target.scrollIntoView({ block: 'start' });
});
if (location.hash && lenis) {
  const t = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (t) addEventListener('load', () => lenis.scrollTo(t, { offset: NAV_OFFSET, immediate: true }));
}

// ─── Nav state + scroll progress ──────────────────────────────────────────
const nav = document.querySelector('.nav');
const onScroll = () => { if (nav) nav.classList.toggle('scrolled', scrollY > 24); };
addEventListener('scroll', onScroll, { passive: true });
onScroll();

if (!reduced) {
  const bar = document.createElement('div');
  bar.className = 'scroll-progress';
  bar.setAttribute('aria-hidden', 'true');
  document.body.append(bar);
  scroll(animate(bar, { scaleX: [0, 1] }, { ease: 'linear' }));
}

if (!reduced) {
  // ─── Reveals: rise, unblur and stagger with siblings ────────────────────
  const REVEAL = [
    // On phones the feature grid is a sideways carousel: tiles off to the right
    // never enter the viewport, so reveal the carousel as one block there.
    '.hero-inner > *', '.head', '.steps > *', '.holo', innerWidth <= 620 ? '.bento' : '.bento > *', '.who > *', '.day-wrap',
    '.deck', '.deck-copy > *', '.safety > *', '.oss > *', '.dl > *', '.dl-copy > *', '.faq details',
    '.doc > *', 'footer .wrap > div'
  ].join(',');
  const items = [...document.querySelectorAll(REVEAL)];
  items.forEach((el) => el.classList.add('reveal'));
  inView(items, (el) => {
    const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => items.includes(c)) : [];
    const i = Math.min(Math.max(sibs.indexOf(el), 0), 8);
    animate(el, { opacity: [0, 1], y: [26, 0], filter: ['blur(10px)', 'blur(0px)'] },
      { duration: 0.85, delay: i * 0.07, ease: EASE })
      .then(() => { el.style.filter = ''; el.classList.remove('reveal'); });
  }, { margin: '0px 0px -6% 0px', amount: 0.05 });

  // ─── Hero copy drifts up and fades as the hero scrolls away ─────────────
  const hero = document.querySelector('.hero');
  const heroInner = document.querySelector('.hero-wrap');
  if (hero && heroInner) {
    scroll(animate(heroInner, { y: [0, -90], opacity: [1, 0.2] }, { ease: 'linear' }),
      { target: hero, offset: ['start start', 'end start'] });
  }

  // ─── Count-up numbers ───────────────────────────────────────────────────
  inView('[data-count]', (el) => {
    const end = Number(el.dataset.count);
    animate(0, end, { duration: Math.min(1.8, 0.6 + end / 150), ease: EASE, onUpdate: (v) => { el.textContent = String(Math.round(v)); } });
  }, { amount: 0.6 });

  // ─── 3D tilt + spotlight on tiles (springs) ─────────────────────────────
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const SPRING = { type: 'spring', stiffness: 260, damping: 22 };
    for (const tile of document.querySelectorAll('.tilt')) {
      tile.addEventListener('pointermove', (e) => {
        const r = tile.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
        tile.style.setProperty('--mx', `${x * 100}%`);
        tile.style.setProperty('--my', `${y * 100}%`);
        animate(tile, { rotateX: (0.5 - y) * 9, rotateY: (x - 0.5) * 11, z: 18 }, SPRING);
      });
      tile.addEventListener('pointerleave', () => animate(tile, { rotateX: 0, rotateY: 0, z: 0 }, SPRING));
    }
  }
}

// ─── Touch interactives (use-gesture): marquee, day scrubber, role deck,
// safety switch, and press-to-tilt tiles on touch screens ────────────────
for (const el of document.querySelectorAll('.marquee')) marquee(el, reduced);
for (const el of document.querySelectorAll('.day')) dayline(el);
for (const el of document.querySelectorAll('.deck')) deck(el, reduced);
for (const el of document.querySelectorAll('.safety')) safetySwitch(el);
if (!reduced && matchMedia('(hover: none) and (pointer: coarse)').matches && innerWidth > 620) {
  touchTilt(document.querySelectorAll('.tilt'));
}

// ─── Floors counter, driven by scroll (works with or without WebGL) ───────
const holo = document.querySelector('.holo');
const readout = document.querySelector('[data-floors]');
let building = null;
if (holo) {
  const setFloors = (p) => {
    if (readout) readout.textContent = String(Math.round(1 + p * 199)).padStart(3, '0');
    if (building) building.setProgress(p);
  };
  if (reduced) setFloors(1);
  else scroll(setFloors, { target: holo, offset: ['start end', 'center center'] });
}

// ─── three.js scenes (lazy; desktop-sized screens with WebGL only) ────────
function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (!reduced && innerWidth >= 720 && webgl()) {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  const hero = document.querySelector('.hero');
  if (hero) idle(() => import('./hero3d.js').then((m) => m.mountHero(hero, () => (lenis ? lenis.scroll : scrollY))).catch(() => {}));
  // The other two scenes load when their section first comes near the screen.
  if (holo) {
    inView(holo, () => {
      import('./building3d.js').then((m) => { building = m.mountBuilding(holo); holo.classList.add('has-3d'); }).catch(() => {});
    }, { margin: '300px 0px' });
  }
  const core = document.querySelector('.core');
  if (core) {
    inView(core, () => {
      import('./core3d.js').then((m) => { m.mountCore(core); core.classList.add('has-3d'); }).catch(() => {});
    }, { margin: '300px 0px' });
  }
}
