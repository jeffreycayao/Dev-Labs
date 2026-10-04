// labs.atmt.dev motion layer. Progressive enhancement only: every page reads
// and works with this script blocked, and prefers-reduced-motion turns all of
// it off. Build: `npm run build` in tools/site-bundle → site/assets/js/.
import Lenis from 'lenis';

const root = document.documentElement;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
root.classList.add('js');

// ─── Smooth scroll ────────────────────────────────────────────────────────
const NAV_OFFSET = -104; // sticky nav height + breathing room
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

// ─── Nav state ────────────────────────────────────────────────────────────
const nav = document.querySelector('.nav');
const bar = document.createElement('div');
bar.className = 'scroll-progress';
bar.setAttribute('aria-hidden', 'true');
document.body.append(bar);
const onScroll = () => {
  if (nav) nav.classList.toggle('scrolled', scrollY > 24);
  const max = root.scrollHeight - innerHeight;
  bar.style.setProperty('--p', max > 0 ? String(Math.min(1, scrollY / max)) : '0');
};
addEventListener('scroll', onScroll, { passive: true });
onScroll();

// ─── Scroll reveals ───────────────────────────────────────────────────────
const REVEAL = [
  '.hero .eyebrow', '.hero h1', '.hero .lead', '.hero .btns', '.hero .trust', '.building',
  '.head', '.stack > *', '.grid > *', '.level', '.elevator', '.price', '.faq details',
  '.band', '.dl > *', '#download .fine', '.video', '.stats', '.panel', '.doc > *', 'footer .wrap > div'
].join(',');
const items = [...document.querySelectorAll(REVEAL)];
items.forEach((el) => {
  el.classList.add('reveal');
  const sibs = el.parentElement ? [...el.parentElement.children].filter((c) => items.includes(c)) : [];
  el.style.setProperty('--d', `${Math.min(sibs.indexOf(el), 6) * 90}ms`);
});
if (reduced || !('IntersectionObserver' in window)) {
  items.forEach((el) => el.classList.add('in'));
} else {
  const io = new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      const el = en.target;
      el.classList.add('in');
      io.unobserve(el);
      // Drop the reveal classes once shown so hover transitions have no delay.
      const delay = parseFloat(el.style.getPropertyValue('--d')) || 0;
      setTimeout(() => el.classList.remove('reveal', 'in'), 1100 + delay);
    }
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  items.forEach((el) => io.observe(el));
}

// ─── Count-up numbers ("200 floors", stats) ───────────────────────────────
const counters = document.querySelectorAll('.unit .big, .stat b');
const countIO = !reduced && 'IntersectionObserver' in window && new IntersectionObserver((entries) => {
  for (const en of entries) {
    if (!en.isIntersecting) continue;
    countIO.unobserve(en.target);
    const el = en.target;
    const m = el.textContent.match(/^(\D*)(\d[\d,]*)(.*)$/s);
    if (!m) continue;
    const end = Number(m[2].replace(/,/g, ''));
    if (!end || end < 2) continue;
    const start = performance.now();
    const dur = Math.min(1600, 500 + end * 6);
    const tick = (now) => {
      const p = Math.min(1, (now - start) / dur);
      const v = Math.round(end * (1 - Math.pow(1 - p, 3)));
      el.textContent = `${m[1]}${v.toLocaleString('en-US')}${m[3]}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
}, { threshold: 0.6 });
if (countIO) counters.forEach((c) => countIO.observe(c));

// ─── Card spotlight follows the pointer ───────────────────────────────────
if (!reduced && matchMedia('(hover: hover)').matches) {
  document.addEventListener('pointermove', (e) => {
    const card = e.target.closest && e.target.closest('.card, .price, .level, .faq details');
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
  }, { passive: true });
}

// ─── Hero 3D city (lazy; desktop + WebGL only) ────────────────────────────
const hero = document.querySelector('.hero');
function webgl() {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}
if (hero && !reduced && innerWidth >= 720 && webgl()) {
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  idle(() => import('./hero3d.js').then((m) => m.mountHero(hero, () => lenis ? lenis.scroll : scrollY)).catch(() => {}));
}
