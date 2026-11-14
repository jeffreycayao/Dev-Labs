---
name: animejs
description: Anime.js v4 (animejs 4.x, MIT) reference — the modular API (animate, createTimeline, createTimer, stagger, svg, utils, engine), how it differs from v3, and when to use it instead of CSS or a render loop. Use for DOM/SVG/UI animation, number tweens, staggered lists, timelines, or "animate this" in a web or Electron UI.
---

# Anime.js v4

Written for DevLabs by its maintainers. Anime.js is by Julian Garnier and
contributors, MIT licensed (https://github.com/juliangarnier/anime). The
official docs at https://animejs.com/documentation/ are the source of truth.

## Is anime.js the right tool?

| Need | Use |
|---|---|
| Hover/focus/enter transitions, simple fades | CSS transitions/animations (no JS) |
| Choreographed UI: staggered lists, counters, SVG draw, timelines, scroll-linked | **anime.js v4** |
| Per-frame simulation, game loop, Three.js objects | The render loop (`useFrame`), lerp/damp; see the `threejs` / `game-dev-3d` skills |
| React component enter/exit with layout | Framer Motion / Motion One (if already a dependency) |

Never add anime.js for one fade. If it is not in `package.json`, ask before
adding a dependency; if it is, check the installed major: `npm ls animejs`.

## v4 at a glance (4.x, current line)

v4 is a rewrite: **named ES exports, no default `anime()` function**.

```ts
import { animate, createTimeline, createTimer, stagger, svg, utils, engine, eases } from 'animejs';

// Tween any element(s) or object
animate('.card', {
  translateY: [40, 0],
  opacity: { from: 0, to: 1 },
  duration: 600,
  delay: stagger(60),
  ease: 'outExpo',          // v4 uses `ease`, not `easing`
  loop: false,
});

// Timeline
const tl = createTimeline({ defaults: { duration: 400, ease: 'inOutQuad' } });
tl.add('.title', { opacity: [0, 1] })
  .add('.sub', { translateX: [-20, 0] }, '-=200')   // relative position
  .add(() => console.log('done'), '+=100');          // callback as a step

// Plain object (counters)
const state = { n: 0 };
animate(state, { n: 100, duration: 1000, modifier: utils.round(0), onUpdate: () => el.textContent = String(state.n) });

// SVG line drawing / morphing
animate(svg.createDrawable('path'), { draw: ['0 0', '0 1'], duration: 1200 });
```

Full API table and v3 → v4 renames: [references/v4-api.md](references/v4-api.md).

## Rules

1. Animate `transform` and `opacity` for DOM; avoid `width/height/top/left`
   (layout thrash). anime.js sets inline styles; keep CSS classes for state.
2. One timeline per screen, not one `animate()` per element in a loop.
3. Respect `prefers-reduced-motion`: read `matchMedia('(prefers-reduced-motion: reduce)')`
   and set `duration: 0` (or skip) when it matches. DevLabs already does this
   in its help showcase; follow the pattern.
4. Clean up: keep the returned animation/timeline and call `.pause()` /
   `.revert()` on unmount (React `useEffect` cleanup). Leaked animations keep
   nodes alive and keep the engine ticking.
5. In Electron with a hidden window, animations still tick; pause them when the
   view is covered (the office already pauses its render loop the same way).
6. Numbers in, numbers out: for values the app owns (progress, counters),
   animate a plain object and write to the DOM in `onUpdate`; the app state
   stays the source of truth.
