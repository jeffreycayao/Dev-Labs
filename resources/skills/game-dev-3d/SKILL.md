---
name: game-dev-3d
description: Build browser 3D games and interactive scenes — game loop, scene graph, assets, basic physics, input, and when to pick Three.js, Babylon.js or Godot (web export). Use for "make a 3D game", "add physics", "load a GLB", "fix my game loop", or any real-time 3D feature in a web or Electron app.
---

# 3D game development (web)

Written for DevLabs by its maintainers. Not copied from any third-party guide;
links point at the engines' own documentation, which is the source of truth
for API details.

## When to use this skill

- A task says game, simulation, interactive scene, physics, character
  controller, camera follow, collisions, spawning, score, levels, or "make it
  move on its own".
- A task touches a render loop, `requestAnimationFrame`, a fixed timestep,
  or frame-rate problems ("it stutters", "slow on laptops").
- A task needs 3D assets: GLB/GLTF, textures, sprites, sounds.

For plain Three.js / React Three Fiber API questions use the `threejs` skill.
For tweened UI or DOM animation (not a game loop) use the `animejs` skill.

## Pick the engine first (two minutes, not two days)

| You need | Pick | Why |
|---|---|---|
| A scene inside an existing React/Electron app, custom look, full control | **Three.js** (+ React Three Fiber if the app is React) | Library, not a framework: small, composable, what DevLabs' own office uses |
| A complete game engine in the browser: physics, GUI, audio, inspector, no React | **Babylon.js** | Batteries included, strong docs and playground |
| A real game with an editor, scenes, tilemaps, export to web and desktop | **Godot 4** (web export) | Editor-driven, GDScript/C#, free; web export is one build target |

Decide and write the choice into the task notes. Do not mix engines in one scene.
Details and links: [references/engines.md](references/engines.md).

## The five things every 3D game has

1. **A loop** that advances simulation by a fixed step and renders as fast as
   the display allows. Never tie game speed to frame rate.
   → [references/game-loop.md](references/game-loop.md)
2. **A scene graph**: nodes with transforms, cameras and lights; load assets
   once, instance many. → [references/scenes-and-assets.md](references/scenes-and-assets.md)
3. **Input** mapped to intents ("move forward"), not to keys, so touch,
   gamepad and keyboard share one code path.
4. **Physics or collision**: start with bounding boxes/spheres and a simple
   integrator; reach for a physics engine (Rapier, cannon-es, Havok, Ammo)
   only when stacking, joints or ragdolls are needed.
   → [references/physics-basics.md](references/physics-basics.md)
5. **Game state** separate from rendering: a plain object or store that the
   loop mutates and the renderer reads. Saving/loading and tests become trivial.

## Working method

1. Read the existing scene code before adding anything; find the loop, the
   scene root, and where assets load. Reuse them.
2. Make the smallest playable slice first (one object, one input, one
   rule, visible on screen). Only then add assets and polish.
3. Keep a frame budget: aim for < 8 ms of JS per frame on the target
   machine. Measure with the browser profiler and `renderer.info` (Three) or
   the inspector (Babylon) before optimising.
4. Dispose what you create (geometries, materials, textures, physics bodies,
   event listeners). Leaks show up as a slow drift in memory and frame time.
5. Assets: prefer glTF/GLB with Draco or Meshopt compression; power-of-two
   textures; KTX2 when the pipeline supports it. Keep a credits file for every
   asset and its license.
6. Test the loop headlessly where possible: step the simulation N times with a
   fixed dt and assert positions, scores and collisions. Rendering is the
   untestable part; keep it thin.

## Things to avoid

- Physics or gameplay inside `useFrame`/`render` without a fixed timestep.
- Creating materials or geometries every frame.
- Loading the same model per instance instead of cloning or instancing.
- `Math.random()` in simulation code that must be reproducible (use a seeded
  RNG so tests and replays work).
- Shipping a 50 MB GLB when a 2 MB compressed one looks the same.
