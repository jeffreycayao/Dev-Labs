# Anime.js v4 API map

Confirm against https://animejs.com/documentation/ for the installed minor
(`npm ls animejs`; 4.5.x at the time of writing). The shapes below are the
stable v4 surface.

## Exports

| Export | What |
|---|---|
| `animate(targets, params)` | Create and play a tween. Returns an `Animation` (methods: `play`, `pause`, `restart`, `reverse`, `seek(ms)`, `complete`, `cancel`, `revert`, `then()`; props: `progress`, `currentTime`, `duration`, `paused`) |
| `createTimeline(params)` | Returns a `Timeline`; `.add(targets, params, position?)`, `.add(callback, position?)`, `.set(targets, props, position?)`, `.label(name, position?)`, `.sync(animation)`, same controls as Animation |
| `createTimer(params)` | A tween with no targets: `duration`, `loop`, `onUpdate`, `frameRate`. Use instead of `setInterval` for animation-clock timing |
| `createAnimatable(targets, params)` | Fast, per-property setters for values that change continuously (pointer-follow): `const a = createAnimatable(el, { x: 300, y: 300 }); a.x(mouseX)` |
| `createDraggable(target, params)` | Drag with physics/snap (v4 module) |
| `createScope({ root, mediaQueries, defaults })` | Scope animations to a root element with cleanup (`scope.revert()`), handy for React/Vue components |
| `onScroll(params)` | Scroll-linked autoplay / sync (v4 module) |
| `stagger(value, { start, from, grid, axis, ease, reversed })` | Returns a function used for `delay`, `duration`, values |
| `svg.createDrawable(targets)` / `svg.morphTo(path)` / `svg.createMotionPath(path)` | SVG helpers |
| `utils` | `random`, `randomPick`, `round(decimals)`, `clamp`, `mapRange`, `lerp`, `snap`, `wrap`, `interpolate`, `get(target, prop)`, `set(targets, props)`, `remove(targets)`, `$(selector)`, `shuffle`, `degToRad`, `radToDeg`, `roundPad`, `padStart/padEnd` |
| `eases` | `linear`, `in/out/inOut` + `Quad|Cubic|Quart|Quint|Sine|Expo|Circ|Back|Bounce|Elastic`, `cubicBezier()`, `steps()`, `irregular()`, `spring({ mass, stiffness, damping, velocity })` |
| `engine` | Global clock: `engine.pause()`, `engine.resume()`, `engine.timeUnit = 's' | 'ms'`, `engine.speed`, `engine.fps`, `engine.pauseOnDocumentHidden` |

## Animation parameters

- Property values: `to` number/string/colour, `[from, to]`, `{ from, to, duration, delay, ease }`, keyframes `[{ x: 10 }, { x: 20, duration: 200 }]`, function values `(target, index, length) => value`.
- Tween params: `duration`, `delay`, `ease`, `composition` (`'replace' | 'none' | 'blend'`), `modifier` (e.g. `utils.round(2)`).
- Playback: `loop` (number | true), `alternate`, `reversed`, `autoplay`, `frameRate`, `playbackRate`, `loopDelay`.
- Callbacks: `onBegin`, `onUpdate`, `onRender`, `onLoop`, `onPause`, `onComplete`, `then()` (promise).
- Targets: CSS selector, Element, NodeList, array, plain object, or a mix. CSS vars (`'--x'`), CSS transforms (`x`, `y`, `translateX`, `rotate`, `scale`…), SVG attributes and DOM attributes all work.

## v3 → v4 renames (the usual breakages)

| v3 | v4 |
|---|---|
| `anime({ targets, ... })` | `animate(targets, { ... })` |
| `easing: 'easeOutExpo'` | `ease: 'outExpo'` (no `ease` prefix) |
| `anime.timeline()` | `createTimeline()` |
| `anime.stagger()` | `stagger()` |
| `direction: 'alternate'` | `alternate: true` |
| `direction: 'reverse'` | `reversed: true` |
| `round: 1` | `modifier: utils.round(0)` |
| `begin/update/complete` | `onBegin/onUpdate/onComplete` |
| `anime.remove(targets)` | `utils.remove(targets)` |
| `anime.set(targets, props)` | `utils.set(targets, props)` |
| `anime.running` | no global list; keep references |
| `strokeDashoffset` tricks | `svg.createDrawable()` + `draw` |

## React usage pattern

```tsx
useEffect(() => {
  const scope = createScope({ root: ref });
  scope.add(() => {
    animate('.item', { opacity: [0, 1], y: [12, 0], delay: stagger(40), duration: 350, ease: 'outCubic' });
  });
  return () => scope.revert();   // removes inline styles and stops everything
}, []);
```

## Reduced motion

```ts
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
animate(el, { opacity: [0, 1], duration: reduce ? 0 : 400 });
```
