# Physics basics

## Start without a physics engine

Most arcade and casual games only need:

- **Integration**: `velocity += acceleration * dt; position += velocity * dt`.
  Semi-implicit Euler (update velocity first) is stable enough at 60 Hz.
- **Gravity**: `acceleration.y = -9.81` (metres); multiply by a "feel" factor
  (1.5–3) for platformers, they lie about gravity on purpose.
- **Collision shapes**: axis-aligned boxes (AABB) and spheres.
  - AABB vs AABB: overlap on all three axes.
  - Sphere vs sphere: distance < r1 + r2.
  - Sphere vs AABB: clamp the sphere centre into the box, measure distance.
- **Response**: push the moving object out along the axis of least
  penetration; zero that velocity component; set `grounded` when pushed up.
- **Ground/raycast**: for terrain or ramps, cast a ray down from the body and
  snap to the hit point.

Write these as pure functions over plain objects and unit-test them.

## When to adopt a physics engine

Stacking, rolling, joints, ragdolls, vehicles, or many dynamic bodies.

| Engine | Fits | Notes |
|---|---|---|
| **Rapier** (`@dimforge/rapier3d-compat`, Apache-2.0) | Three.js, R3F via `@react-three/rapier` | Fast WASM, deterministic, active |
| **cannon-es** (MIT) | Three.js, small games | Pure JS, simple API, slower with many bodies |
| **Havok** (Babylon's default plugin) | Babylon.js | WASM, high quality |
| **Ammo.js** (Bullet port) | Legacy projects | Large WASM, dated API |
| **Godot physics / Jolt** | Godot | Built into the editor |

Rules of thumb:

- Step the engine at a fixed rate (see game-loop.md); feed it `dt` of 1/60.
- Keep one body per gameplay entity; sync body → mesh after the step.
- Use collision groups/masks so bullets do not collide with each other.
- Kinematic bodies for player controllers you drive yourself; dynamic bodies
  for things the world pushes around.
- Sleep bodies that stopped moving; thousands of awake bodies kill frame time.

## Character controllers

- Capsule shape, kinematic, moved by your input intent each tick.
- Separate horizontal movement (acceleration, friction, max speed) from
  vertical (gravity, jump impulse, coyote time ~0.1 s, jump buffering).
- Slopes: project movement onto the ground normal; cap walkable angle.
- Rapier ships a `KinematicCharacterController`; Babylon has
  `PhysicsCharacterController`; Godot has `CharacterBody3D.move_and_slide()`.

## Common bugs

- Tunnelling through thin walls at high speed: smaller step, continuous
  collision detection, or thicker colliders.
- Jitter on the ground: apply a small downward snap and do not integrate
  gravity while grounded.
- Non-deterministic replays: different `dt` per machine, `Math.random()`, or
  iterating a `Set`.
