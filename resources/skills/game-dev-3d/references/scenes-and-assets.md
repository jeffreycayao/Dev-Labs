# Scenes and assets

## Scene graph basics

- Everything hangs under one root. Parent transforms apply to children, so
  a "car" group moves its wheels for free.
- Keep gameplay entities in your own state (`{ id, kind, position, velocity }`)
  and map them to scene nodes by id. The scene graph is a view, not the model.
- Cameras: one perspective camera for gameplay, optionally an orthographic
  one for UI/minimap. Follow cameras lerp toward a target offset each frame;
  never snap.
- Lights: one directional "sun" with shadows (shadow map 1024–2048), one
  ambient or hemisphere light. More lights cost more; bake what does not move.

## Units and scale

Pick metres. One Three.js/Babylon unit = one metre. Cameras, physics and
imported models agree then, and gravity is simply 9.81.

## Asset pipeline

| Asset | Format | Notes |
|---|---|---|
| Models, animations | glTF 2.0 (`.glb`) | Compress geometry with Draco or Meshopt (`gltf-transform`, `gltfpack`); one file per logical object |
| Textures | PNG/JPG for authoring, KTX2 (Basis) for shipping | Power-of-two sizes; 1024² is plenty for most props |
| Sprites / UI | PNG atlases | One atlas per screen or theme |
| Audio | OGG + MP3 fallback | Short SFX as separate files, music streamed |
| Fonts | MSDF or SDF atlases (troika-three-text for Three) | Avoid canvas-text per frame |

Load once, cache, clone. In Three.js clone a loaded `gltf.scene` with
`SkeletonUtils.clone` when it has skinning. Use `InstancedMesh` for hundreds
of identical props (trees, crates).

## Where free, redistributable assets come from

- Kenney (kenney.nl) — CC0 models, sprites, audio, fonts (DevLabs' office uses them).
- Quaternius — CC0 low-poly packs.
- Poly Haven — CC0 HDRIs, textures, some models.
- Mixamo — characters and animations (check Adobe's terms for your use).
- itch.io asset packs — read each license; many are "credit required".

Record every asset with its source and license in a `CREDITS.md` next to the
assets. Never bundle an asset whose license you have not read.

## Loading and progress

- Show a progress bar from the loader's progress events; load critical
  assets first, decorations after the first playable frame.
- Fail soft: a missing texture becomes a flat colour, a missing model a box.
  Log it, do not crash the game.

## Disposal

When a level unloads: traverse the subtree, dispose geometries, materials and
their textures, remove physics bodies, clear timers and listeners. In R3F,
return a cleanup from `useEffect`; drei's loaders cache, so dispose only what
you created.
