---
name: threejs
description: Three.js and React Three Fiber (R3F) reference for this app — current API shape (three 0.183, R3F 8, drei 9), how DevLabs' 3D office is built, performance rules, and what to check before touching the scene. Use for any Three.js, R3F, drei, WebGL/WebGPU, shader, camera, lighting or 3D-office task.
---

# Three.js in DevLabs

Written for DevLabs by its maintainers. Three.js is MIT licensed (mrdoob and
contributors); React Three Fiber and drei are MIT (Poimandres). Their docs are
the source of truth; this skill tells you which version you are on and how the
office uses them.

## Versions in this repo (check `package.json`, do not assume)

| Package | Version | Docs |
|---|---|---|
| `three` | ^0.183 | https://threejs.org/docs/ (pick the matching release in the dropdown) |
| `@react-three/fiber` | ^8 | https://r3f.docs.pmnd.rs/ (v8 docs, not v9) |
| `@react-three/drei` | ^9 | https://drei.docs.pmnd.rs/ |
| `troika-three-text` | — | SDF text used by drei's `<Text>` |

Three publishes a minor every month and renames things; R3F 9 (React 19) and
drei 10 changed APIs. When a snippet from memory does not compile, read the
installed `node_modules/three/src` or the docs for *this* version before
guessing. Details: [references/api-0.183.md](references/api-0.183.md).

## How the office is built (read before editing)

- Entry: `src/renderer/src/scene/office3d/OfficeFloor3D.tsx` (host: store,
  floors, chatter, panels) → `features/retro-office/RetroOffice3D.tsx` (the
  scene, ported from Claw3D, MIT).
- One `<Canvas orthographic frameloop={paused ? 'never' : 'always'} dpr={[0.85, 1.5]}>`.
  The loop is **stopped while something covers the office** (focus mode, IDE
  overlay). Keep that: Electron keeps background windows rendering otherwise.
- Furniture is data (`core/furnitureDefaults.ts`, `FurnitureItem`), rendered by
  `objects/furniture.tsx` with instancing for repeated props; layout is saved
  to localStorage per floor and can be exported as a theme (`shared/officeTheme.ts`).
- Agents are sprites/avatars in `objects/agents.tsx`; movement is a grid
  navigation system (`core/navigation*`), not physics.
- Lighting: `systems/cameraLighting.tsx` (day/night lerp, one directional +
  ambient). Textures: `scene/filipino.tsx` builds the banig/Machuca textures
  procedurally with canvas, no image files.
- drei used: `Text`, `Html`, `Billboard`, `OrbitControls`, `Environment`,
  `Lightformer`, `useGLTF`.

Rules for changes to the office:

1. Keep the frame budget. Measure with `renderer.info.render.calls` and the
   profiler before and after. New objects should be instanced or merged.
2. Never create geometry/material inside render or `useFrame`; memoise.
3. Dispose on unmount (`useEffect` cleanup) for anything you create by hand.
4. Store mutable per-frame values in refs; state updates re-render React.
5. Text: one `<Text>` per label is fine (SDF); hundreds → batch or Html.
6. Keep the look: pixel-art, orthographic, warm Neo-Manila palette. Do not
   add bloom or heavy post-processing without being asked.

## Performance checklist

→ [references/performance.md](references/performance.md)

## Common pitfalls

- Importing from `three/examples/jsm/...` works; `three/addons/...` is the
  alias in 0.183. Pick one per file.
- `MeshStandardMaterial` needs lights; `MeshBasicMaterial` does not.
- Shadows cost: enable `castShadow` only on the few meshes that need it.
- `OrbitControls` and your own camera animation fight; disable one.
- Textures from canvas: set `needsUpdate = true` after drawing and dispose
  the old texture when replacing.
- R3F 8: `useFrame((state, delta) => …)`; `state.clock`, `state.camera`,
  `state.gl`. Use `invalidate()` with `frameloop="demand"` scenes.
