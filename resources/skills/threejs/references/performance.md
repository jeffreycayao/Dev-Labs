# Performance checklist (Three.js / R3F)

Measure first: `renderer.info.render` (calls, triangles) and the browser
performance panel. In R3F, `useThree((s) => s.gl.info)`, or mount
`<Stats />` / `<Perf />` from drei/r3f-perf while developing (remove after).

## Draw calls

- Target < 200 draw calls for an office-sized scene on integrated GPUs.
- Repeated props → `InstancedMesh` / drei `<Instances>`.
- Static geometry with one material → merge with `mergeGeometries`.
- Different geometries, one material → `BatchedMesh`.

## Materials & lights

- Fewer unique materials; share instances. Unlit (`MeshBasicMaterial`) for
  anything that does not need lighting (UI, flat props).
- One directional light with shadows, small shadow-camera frustum, map size
  1024–2048. `castShadow` only on hero objects; `receiveShadow` on floors.
- Avoid many point lights; bake or fake with emissive.

## Textures

- Power-of-two, ≤ 2048², mipmaps on. Reuse one atlas across props.
- Canvas-generated textures: generate once, cache by size, dispose on replace.
- `texture.anisotropy = renderer.capabilities.getMaxAnisotropy()` only where
  it matters (floors viewed at a grazing angle).

## Per-frame work

- Zero allocations in `useFrame`/render: reuse `Vector3`/`Matrix4` scratch
  objects declared outside.
- Store per-frame mutable values in refs; never `setState` per frame.
- Throttle expensive logic (pathfinding, chatter, AI) to a timer, not every
  frame; the office runs its chatter director once a second.
- Freeze the loop when hidden (`frameloop="never"`) — the office already does.

## Resolution

- `dpr={[0.85, 1.5]}`-style clamps keep 4K laptops playable.
- Prefer `antialias: true` over FXAA passes; skip post-processing unless asked.

## Memory

- Dispose geometries/materials/textures you create; drei loaders cache
  shared assets, so dispose only your own.
- Watch `renderer.info.memory.geometries/textures` over a few minutes of play.

## Pathological patterns seen in the wild

- Creating a `new THREE.Color()` or material per render in a list of 300 items.
- `<Text>` with hundreds of changing strings every frame (SDF rebuild).
- A `useEffect` without cleanup that adds `window` listeners on every rerender.
- Loading the same GLB in every instance instead of `useGLTF` + clone.
