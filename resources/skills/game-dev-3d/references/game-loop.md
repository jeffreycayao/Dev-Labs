# The game loop

## Fixed simulation step, variable render

```ts
const STEP = 1 / 60;          // simulation seconds per tick
let acc = 0;
let last = performance.now();

function frame(now: number) {
  acc += Math.min((now - last) / 1000, 0.25); // clamp: a paused tab must not "catch up" forever
  last = now;
  while (acc >= STEP) {
    simulate(STEP);           // physics, AI, input intents, timers
    acc -= STEP;
  }
  render(acc / STEP);         // alpha: interpolate between the last two states for smoothness
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

- `simulate` is pure game logic over the state object. It never touches the
  renderer. That makes it testable: call it 600 times with `STEP` and assert.
- `render(alpha)` reads state and writes to meshes. Interpolating with
  `alpha` removes the judder a fixed step would otherwise show at 144 Hz.
- Clamp the accumulator. After a tab is hidden, `now - last` can be seconds.

## Inside React Three Fiber

`useFrame((state, delta) => …)` already runs once per rendered frame. Keep
the same accumulator pattern inside it; do not call `requestAnimationFrame`
yourself. Put the accumulator in a `useRef`, not state (state updates
re-render React, which you do not want 60 times a second).

## Inside Babylon.js

`scene.onBeforeRenderObservable` is the per-frame hook; `engine.getDeltaTime()`
gives milliseconds. Babylon's built-in physics plugins step themselves; only
your own gameplay code needs the accumulator.

## Pausing, focus, visibility

- `document.addEventListener('visibilitychange', …)`: pause the loop when
  hidden, reset `last` on resume.
- Pause means "stop calling simulate", not "stop rendering": a paused game
  still redraws when the window resizes.

## Timers and cooldowns

Count down in simulation seconds (`timer -= dt`), never in wall-clock time.
Replays, slow-motion and tests then all work.

## Determinism

- One seeded random generator for gameplay (mulberry32 or similar). Keep
  `Math.random()` for cosmetics only (particles).
- Iterate entities in a stable order (arrays, not `Set` or object keys).
