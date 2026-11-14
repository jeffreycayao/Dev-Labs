# Three.js 0.183 — API notes that trip people up

Always confirm in https://threejs.org/docs/ for the installed release. These
are the places where memory of older/newer versions is usually wrong.

## Imports

```ts
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';   // or three/examples/jsm/...
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
```

## Renderer

- `new THREE.WebGLRenderer({ antialias, powerPreference, alpha })`;
  `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
- Colour management is on by default: `renderer.outputColorSpace =
  THREE.SRGBColorSpace`; textures used as colour need
  `texture.colorSpace = THREE.SRGBColorSpace`, data textures stay linear.
- `renderer.useLegacyLights` is gone; light intensities are physical
  (directional ~1–3, point/spot in candela-ish units, ambient small).
- WebGPU: `three/webgpu` exports `WebGPURenderer` and the node material
  system (TSL). Not used by DevLabs; the office is WebGL.

## Geometry & materials

- Geometries are all `BufferGeometry`; `Geometry` is long gone.
- `BufferGeometryUtils.mergeGeometries(list)` (was `mergeBufferGeometries`).
- `InstancedMesh(geometry, material, count)` + `setMatrixAt(i, matrix)` +
  `instanceMatrix.needsUpdate = true`; per-instance colour via `setColorAt`.
- `BatchedMesh` exists for many different geometries sharing one material.
- Materials: `MeshStandardMaterial` / `MeshPhysicalMaterial` (PBR),
  `MeshLambertMaterial`, `MeshBasicMaterial` (unlit), `ShaderMaterial`.
  `side: THREE.DoubleSide` (the office passes `side={2}`, same value).

## Loading

- `GLTFLoader.loadAsync(url)` → `{ scene, animations, … }`.
- Draco: `loader.setDRACOLoader(draco.setDecoderPath('/draco/'))`.
- KTX2: `KTX2Loader` with `setTranscoderPath`.
- Clone skinned models with `SkeletonUtils.clone`, never `.clone()` alone.

## Animation

- `new THREE.AnimationMixer(root)`, `mixer.clipAction(clip).play()`,
  `mixer.update(delta)` every frame.
- Tweening a property: do it in the loop with lerp/damp
  (`THREE.MathUtils.damp(cur, target, lambda, dt)`), or use anime.js / a tween
  lib outside the frame loop (see the `animejs` skill).

## Cameras & controls

- `PerspectiveCamera(fov, aspect, near, far)`; on resize update `aspect` and
  call `updateProjectionMatrix()`.
- `OrthographicCamera(left, right, top, bottom, near, far)`; the office uses
  one via R3F's `<Canvas orthographic camera={{ zoom, position }}>`.
- `OrbitControls(camera, domElement)`; `controls.update()` per frame when
  `enableDamping` is on.

## Raycasting / picking

`raycaster.setFromCamera(ndc, camera)`; `intersectObjects(list, recursive)`.
For instanced meshes the hit carries `instanceId`. In R3F, pointer events on
meshes (`onClick`, `onPointerOver`) wrap this for you.

## Disposal

`geometry.dispose()`, `material.dispose()`, `texture.dispose()`,
`renderer.dispose()`; the scene graph does not dispose children for you.
`renderer.info.memory` shows live geometries/textures.

## React Three Fiber 8 specifics

- `<Canvas>` props: `camera`, `orthographic`, `dpr`, `frameloop`
  (`always | demand | never`), `gl={{ antialias }}`, `shadows`, `events`.
- Hooks: `useThree()` (camera, gl, scene, size, viewport, invalidate),
  `useFrame(cb, priority)`, `useLoader(GLTFLoader, url)`.
- JSX elements are lowercase Three classes: `<mesh>`, `<meshStandardMaterial>`,
  `<boxGeometry args={[1,1,1]}>`; `attach` wires non-children.
- `extend({ MyClass })` to use custom classes as JSX.
- drei 9: `<Text>` (troika SDF), `<Html>` (DOM overlay), `<Billboard>`,
  `<Instances>/<Instance>`, `<Environment>`, `<Lightformer>`, `<OrbitControls>`,
  `useGLTF(url)` (cached; `useGLTF.preload`).
- R3F 9 / drei 10 target React 19 and changed some signatures. This repo is
  React 18 + R3F 8: do not upgrade one without the other, and not as a side
  effect of another task.
