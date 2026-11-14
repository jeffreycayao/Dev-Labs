# Engines: pointers and gotchas

Versions move fast; always confirm against the installed package
(`npm ls three`, `npm ls @babylonjs/core`) and the engine's own docs. Do not
assume an API from memory when the docs are one fetch away.

## Three.js (MIT)

- Docs: https://threejs.org/docs/ · Manual: https://threejs.org/manual/ ·
  Examples: https://threejs.org/examples/
- Install: `npm i three` (+ `@types/three`). Imports from `three` and
  `three/addons/...` (the `examples/jsm` path is the same code).
- React: React Three Fiber `@react-three/fiber` + helpers `@react-three/drei`,
  physics `@react-three/rapier`, post-processing `@react-three/postprocessing`.
- Strengths: control, size, ecosystem, shaders. Weaknesses: you assemble the
  engine yourself (loop, physics, GUI, audio are your job).
- DevLabs' office is Three 0.183 + R3F 8 + drei 9 (see the `threejs` skill
  for the project-specific notes).

## Babylon.js (Apache-2.0)

- Docs: https://doc.babylonjs.com/ · Playground: https://playground.babylonjs.com/
- Install: `npm i @babylonjs/core @babylonjs/loaders` (ES modules; import
  only what you use to keep bundles small).
- Comes with: physics plugins (Havok), GUI, audio, animation groups, node
  material editor, inspector (`scene.debugLayer.show()`), WebGPU engine.
- Gotcha: left-handed coordinate system by default (Three is right-handed);
  set `scene.useRightHandedSystem = true` when sharing glTF conventions.

## Godot 4 (MIT)

- Docs: https://docs.godotengine.org/en/stable/ · Web export:
  https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html
- Editor-first: scenes, nodes, signals, GDScript or C#. Export the project to
  HTML5; the result is a WASM bundle you host as static files.
- Gotchas for web: needs `Cross-Origin-Opener-Policy: same-origin` and
  `Cross-Origin-Embedder-Policy: require-corp` headers for threads; C# web
  export is limited (check the current docs); audio needs a user gesture.
- In Electron, serve the export from a local file/HTTP server and load it in
  a BrowserWindow or an `<iframe>`; keep Node integration off for it.

## PlayCanvas (MIT engine, hosted editor)

Browser editor plus an open-source runtime (`playcanvas` on npm). Good for
teams who want Unity-like tooling in the browser.

## Choosing, in one line each

- Already in React, want a scene in the app → Three.js + R3F.
- Want an engine with GUI/physics/audio in one import, no React → Babylon.js.
- Want an editor, levels, export to web *and* desktop → Godot 4.
