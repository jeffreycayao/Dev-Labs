"use client";

/**
 * DevLabs: nature and decor for imported office themes (trees, flowers, ponds,
 * fences, creatures…), the ground pattern texture and ambient particles.
 * Procedural primitives in the same low-poly style as primitives.tsx; no GLBs.
 * The type list itself lives in @shared/officeTheme (OFFICE_NATURE_TYPES).
 */
import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef, type ReactNode } from "react";
import * as THREE from "three";
import { OFFICE_NATURE_TYPES, type OfficeThemeScene } from "@shared/officeTheme";
import { SCALE } from "@/features/retro-office/core/constants";
import {
  LOCAL_OFFICE_CANVAS_HEIGHT,
  LOCAL_OFFICE_CANVAS_WIDTH,
} from "@/features/retro-office/core/district";
import {
  getItemBaseSize,
  getItemRotationRadians,
  toWorld,
} from "@/features/retro-office/core/geometry";
import type { FurnitureItem } from "@/features/retro-office/core/types";
import type { InteractiveFurnitureModelProps } from "@/features/retro-office/objects/types";

export const NATURE_TYPES = new Set(OFFICE_NATURE_TYPES);

const DEFAULT_COLOR: Record<string, string> = {
  tree: "#4caf50",
  pine_tree: "#2e7d32",
  bush: "#43a047",
  hedge: "#33691e",
  flower: "#f06292",
  flower_bed: "#f06292",
  mushroom: "#e53935",
  rock: "#8d8d8d",
  stump: "#6d4c41",
  log: "#795548",
  pond: "#4fc3f7",
  path: "#bcaaa4",
  fence: "#8d6e63",
  lantern: "#ffe082",
  butterfly: "#ba68c8",
  bird: "#42a5f5",
  gift: "#c62828",
  snowman: "#fafafa",
};

const BARK = "#6d4c41";
const BED_COMPANIONS = ["#fff176", "#ffffff", "#ba68c8", "#ffb74d"];

/** Deterministic 0..1 noise from an item's position, so a bed or flock looks
 *  the same on every render without storing anything. */
const seeded = (item: FurnitureItem, i: number) => {
  const v = Math.sin(item.x * 12.9898 + item.y * 78.233 + i * 37.719) * 43758.5453;
  return v - Math.floor(v);
};

function Std({ color, ...rest }: { color: string; emissive?: string; emissiveIntensity?: number; transparent?: boolean; opacity?: number; roughness?: number; metalness?: number; flatShading?: boolean; side?: THREE.Side }) {
  return <meshStandardMaterial color={color} roughness={rest.roughness ?? 0.85} metalness={rest.metalness ?? 0} {...rest} />;
}

function Body({ type, color, W, D, item }: { type: string; color: string; W: number; D: number; item: FurnitureItem }): ReactNode {
  const s = Math.min(W, D);
  switch (type) {
    case "tree":
      return (
        <>
          <mesh position={[0, s * 0.55, 0]} castShadow>
            <cylinderGeometry args={[s * 0.07, s * 0.1, s * 1.1, 8]} />
            <Std color={BARK} />
          </mesh>
          <mesh position={[0, s * 1.35, 0]} castShadow>
            <sphereGeometry args={[s * 0.5, 12, 10]} />
            <Std color={color} flatShading />
          </mesh>
          <mesh position={[s * 0.22, s * 1.15, s * 0.12]} castShadow>
            <sphereGeometry args={[s * 0.32, 10, 8]} />
            <Std color={color} flatShading />
          </mesh>
        </>
      );
    case "pine_tree":
      return (
        <>
          <mesh position={[0, s * 0.2, 0]}>
            <cylinderGeometry args={[s * 0.06, s * 0.08, s * 0.4, 6]} />
            <Std color={BARK} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh key={i} position={[0, s * (0.55 + i * 0.42), 0]} castShadow>
              <coneGeometry args={[s * (0.5 - i * 0.12), s * 0.7, 8]} />
              <Std color={color} flatShading />
            </mesh>
          ))}
        </>
      );
    case "bush":
      return (
        <>
          {[[0, 0, 0, 0.36], [-0.22, 0, 0.1, 0.26], [0.2, 0, -0.08, 0.28]].map(([x, , z, r], i) => (
            <mesh key={i} position={[x * s, r * s * 0.8, z * s]} scale={[1, 0.85, 1]} castShadow>
              <sphereGeometry args={[r * s, 10, 8]} />
              <Std color={color} flatShading />
            </mesh>
          ))}
        </>
      );
    case "hedge":
      return (
        <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
          <boxGeometry args={[W, 0.6, D]} />
          <Std color={color} roughness={1} />
        </mesh>
      );
    case "flower":
      return (
        <>
          <mesh position={[0, s * 0.45, 0]}>
            <cylinderGeometry args={[0.008, 0.008, s * 0.9, 4]} />
            <Std color="#558b2f" />
          </mesh>
          <mesh position={[0, s * 0.92, 0]} scale={[1, 0.55, 1]}>
            <sphereGeometry args={[s * 0.28, 8, 6]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, s * 0.98, 0]}>
            <sphereGeometry args={[s * 0.1, 6, 4]} />
            <Std color="#fdd835" />
          </mesh>
        </>
      );
    case "flower_bed": {
      const cols = Math.max(2, Math.min(6, Math.round(W / 0.22)));
      const rows = Math.max(1, Math.min(4, Math.round(D / 0.22)));
      return (
        <>
          <mesh position={[0, 0.025, 0]} receiveShadow>
            <boxGeometry args={[W, 0.05, D]} />
            <Std color="#5d4037" roughness={1} />
          </mesh>
          {Array.from({ length: cols * rows }, (_, i) => {
            const cx = (((i % cols) + 0.5) / cols - 0.5) * W * 0.9 + (seeded(item, i) - 0.5) * 0.05;
            const cz = ((Math.floor(i / cols) + 0.5) / rows - 0.5) * D * 0.85;
            const bloom = i % 3 === 0 ? BED_COMPANIONS[i % BED_COMPANIONS.length] : color;
            return (
              <mesh key={i} position={[cx, 0.1 + seeded(item, i + 7) * 0.05, cz]} scale={[1, 0.6, 1]}>
                <sphereGeometry args={[0.055, 6, 5]} />
                <Std color={bloom} />
              </mesh>
            );
          })}
        </>
      );
    }
    case "mushroom":
      return (
        <>
          <mesh position={[0, s * 0.22, 0]}>
            <cylinderGeometry args={[s * 0.1, s * 0.13, s * 0.45, 10]} />
            <Std color="#f5efe0" />
          </mesh>
          <mesh position={[0, s * 0.42, 0]} castShadow>
            <sphereGeometry args={[s * 0.45, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Std color={color} />
          </mesh>
          {[0, 1, 2, 3].map((i) => {
            const a = (i / 4) * Math.PI * 2 + 0.4;
            return (
              <mesh key={i} position={[Math.cos(a) * s * 0.26, s * 0.75, Math.sin(a) * s * 0.26]}>
                <sphereGeometry args={[s * 0.06, 6, 4]} />
                <Std color="#ffffff" />
              </mesh>
            );
          })}
        </>
      );
    case "rock":
      return (
        <mesh position={[0, s * 0.22, 0]} scale={[W / s, 0.6, D / s]} castShadow receiveShadow>
          <dodecahedronGeometry args={[s * 0.5, 0]} />
          <Std color={color} flatShading roughness={1} />
        </mesh>
      );
    case "stump":
      return (
        <>
          <mesh position={[0, s * 0.17, 0]} castShadow>
            <cylinderGeometry args={[s * 0.42, s * 0.48, s * 0.35, 10]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, s * 0.35, 0]}>
            <cylinderGeometry args={[s * 0.4, s * 0.4, 0.005, 10]} />
            <Std color="#d7b98e" />
          </mesh>
        </>
      );
    case "log":
      return (
        <mesh position={[0, D * 0.4, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[D * 0.4, D * 0.4, W, 10]} />
          <Std color={color} />
        </mesh>
      );
    case "pond":
      return (
        <>
          <mesh position={[0, 0.006, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[W * 1.08, D * 1.08, 1]}>
            <circleGeometry args={[0.5, 28]} />
            <Std color="#9e9e9e" roughness={1} />
          </mesh>
          <mesh position={[0, 0.012, 0]} rotation={[-Math.PI / 2, 0, 0]} scale={[W, D, 1]}>
            <circleGeometry args={[0.5, 28]} />
            <Std color={color} roughness={0.12} metalness={0.25} transparent opacity={0.88} />
          </mesh>
          {[0, 1, 2].map((i) => (
            <mesh
              key={i}
              position={[(seeded(item, i) - 0.5) * W * 0.55, 0.016, (seeded(item, i + 3) - 0.5) * D * 0.55]}
              rotation={[-Math.PI / 2, 0, 0]}
            >
              <circleGeometry args={[Math.min(0.1, s * 0.12), 10, 0.4, Math.PI * 1.8]} />
              <Std color="#66bb6a" side={THREE.DoubleSide} />
            </mesh>
          ))}
        </>
      );
    case "path":
      return (
        <mesh position={[0, 0.005, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
          <planeGeometry args={[W, D]} />
          <Std color={color} roughness={1} />
        </mesh>
      );
    case "fence": {
      // Capped like flower_bed: an imported theme with hundreds of very wide
      // fences would otherwise mount tens of thousands of shadowed meshes.
      const posts = Math.max(2, Math.min(24, Math.round(W / 0.35) + 1));
      return (
        <>
          {Array.from({ length: posts }, (_, i) => (
            <mesh key={i} position={[-W / 2 + (i * W) / (posts - 1), 0.22, 0]} castShadow>
              <boxGeometry args={[0.05, 0.44, 0.05]} />
              <Std color={color} />
            </mesh>
          ))}
          {[0.15, 0.33].map((y) => (
            <mesh key={y} position={[0, y, 0]}>
              <boxGeometry args={[W, 0.04, 0.025]} />
              <Std color={color} />
            </mesh>
          ))}
        </>
      );
    }
    case "lantern":
      return (
        <>
          <mesh position={[0, 0.45, 0]}>
            <cylinderGeometry args={[0.018, 0.024, 0.9, 6]} />
            <Std color="#37474f" metalness={0.5} roughness={0.5} />
          </mesh>
          <mesh position={[0, 0.96, 0]}>
            <boxGeometry args={[0.12, 0.14, 0.12]} />
            <Std color={color} emissive={color} emissiveIntensity={1.6} />
          </mesh>
          <mesh position={[0, 1.05, 0]}>
            <coneGeometry args={[0.1, 0.07, 4]} />
            <Std color="#37474f" />
          </mesh>
        </>
      );
    case "gift":
      return (
        <>
          <mesh position={[0, s * 0.35, 0]} castShadow>
            <boxGeometry args={[W * 0.9, s * 0.7, D * 0.9]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, s * 0.36, 0]}>
            <boxGeometry args={[W * 0.92, s * 0.72, D * 0.18]} />
            <Std color="#fdd835" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, s * 0.36, 0]}>
            <boxGeometry args={[W * 0.18, s * 0.72, D * 0.92]} />
            <Std color="#fdd835" metalness={0.3} roughness={0.4} />
          </mesh>
          <mesh position={[0, s * 0.76, 0]} rotation={[0, Math.PI / 4, 0]} scale={[1, 0.6, 1]}>
            <torusGeometry args={[s * 0.12, s * 0.04, 6, 12]} />
            <Std color="#fdd835" />
          </mesh>
        </>
      );
    case "snowman":
      return (
        <>
          {[[0.32, 0.3], [0.85, 0.22], [1.24, 0.16]].map(([y, r], i) => (
            <mesh key={i} position={[0, y * s, 0]} castShadow>
              <sphereGeometry args={[r * s, 12, 10]} />
              <Std color={color} roughness={1} />
            </mesh>
          ))}
          <mesh position={[0, 1.24 * s, 0.2 * s]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.03 * s, 0.16 * s, 6]} />
            <Std color="#ef6c00" />
          </mesh>
          <mesh position={[0, 1.42 * s, 0]}>
            <cylinderGeometry args={[0.12 * s, 0.12 * s, 0.14 * s, 10]} />
            <Std color="#212121" />
          </mesh>
          <mesh position={[0, 1.35 * s, 0]}>
            <cylinderGeometry args={[0.2 * s, 0.2 * s, 0.02 * s, 12]} />
            <Std color="#212121" />
          </mesh>
          <mesh position={[0, 1.06 * s, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.16 * s, 0.035 * s, 6, 14]} />
            <Std color="#c62828" />
          </mesh>
        </>
      );
    default:
      return null;
  }
}

/** Butterflies and birds: wander a small loop around their spot. Driven by the
 *  scene's frame loop (demand + heartbeat), so they cost nothing while hidden. */
function Creature({ type, color, item }: { type: "butterfly" | "bird"; color: string; item: FurnitureItem }) {
  const root = useRef<THREE.Group>(null);
  const left = useRef<THREE.Group>(null);
  const right = useRef<THREE.Group>(null);
  const phase = seeded(item, 1) * Math.PI * 2;
  const bird = type === "bird";
  const radius = bird ? 1.1 : 0.35;
  const height = bird ? 1.7 : 0.45;
  useFrame(({ clock }) => {
    const t = clock.elapsedTime * (bird ? 0.5 : 0.8) + phase;
    if (root.current) {
      root.current.position.set(Math.cos(t) * radius, height + Math.sin(t * 3) * (bird ? 0.08 : 0.12), Math.sin(t) * radius);
      root.current.rotation.y = -t;
    }
    const flap = Math.sin(clock.elapsedTime * (bird ? 9 : 16) + phase) * (bird ? 0.6 : 0.9);
    if (left.current) left.current.rotation.z = flap;
    if (right.current) right.current.rotation.z = -flap;
  });
  const wing = bird ? [0.16, 0.07] : [0.09, 0.07];
  return (
    <group ref={root}>
      {bird ? (
        <>
          <mesh scale={[1, 0.8, 1.6]}>
            <sphereGeometry args={[0.05, 8, 6]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, 0.03, 0.07]}>
            <sphereGeometry args={[0.032, 8, 6]} />
            <Std color={color} />
          </mesh>
          <mesh position={[0, 0.03, 0.105]} rotation={[Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.012, 0.03, 4]} />
            <Std color="#ffb300" />
          </mesh>
        </>
      ) : (
        <mesh>
          <cylinderGeometry args={[0.008, 0.008, 0.07, 4]} />
          <Std color="#212121" />
        </mesh>
      )}
      {[left, right].map((ref, i) => (
        <group key={i} ref={ref}>
          <mesh position={[(i ? 1 : -1) * wing[0] / 2, 0, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[wing[0], wing[1]]} />
            <Std color={color} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

export function NatureModel({
  item,
  isSelected,
  isHovered,
  editMode,
  onPointerDown,
  onPointerOver,
  onPointerOut,
}: InteractiveFurnitureModelProps) {
  const [wx, , wz] = toWorld(item.x, item.y);
  const { width, height } = getItemBaseSize(item);
  const W = width * SCALE;
  const D = height * SCALE;
  const color = item.color ?? DEFAULT_COLOR[item.type] ?? "#9e9e9e";
  const creature = item.type === "butterfly" || item.type === "bird";
  const ring = editMode && (isSelected || isHovered);
  return (
    <group
      position={[wx, item.elevation ?? 0, wz]}
      onPointerDown={(event) => {
        if (!editMode) return;
        event.stopPropagation();
        onPointerDown(item._uid);
      }}
      onPointerOver={(event) => {
        if (!editMode) return;
        event.stopPropagation();
        onPointerOver(item._uid);
      }}
      onPointerOut={(event) => {
        if (!editMode) return;
        event.stopPropagation();
        onPointerOut();
      }}
    >
      <group position={[W / 2, 0, D / 2]} rotation={[0, getItemRotationRadians(item), 0]}>
        {creature ? (
          <Creature type={item.type as "butterfly" | "bird"} color={color} item={item} />
        ) : (
          <Body type={item.type} color={color} W={W} D={D} item={item} />
        )}
        {ring || (editMode && creature) ? (
          <mesh position={[0, 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[W, D]} />
            <meshBasicMaterial color={isSelected ? "#fbbf24" : "#4a90d9"} transparent opacity={ring ? 0.35 : 0.15} />
          </mesh>
        ) : null}
      </group>
    </group>
  );
}

/** Ground pattern for a theme's `scene.ground`, tiled about once per world unit. */
export function useGroundTexture(style: string | undefined, color: string, repeatX: number, repeatY: number) {
  return useMemo(() => {
    if (!style || style === "default" || style === "plain") return null;
    const size = 128;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const base = new THREE.Color(color);
    const shade = (k: number) => `#${base.clone().multiplyScalar(k).getHexString()}`;
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, size, size);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    if (style === "grass" || style === "sand") {
      const n = style === "grass" ? 900 : 500;
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = shade(0.75 + rnd() * 0.5);
        const x = rnd() * size;
        const y = rnd() * size;
        if (style === "grass") ctx.fillRect(x, y, 1, 2 + rnd() * 3);
        else ctx.fillRect(x, y, 1.5, 1.5);
      }
    } else if (style === "tiles") {
      ctx.strokeStyle = shade(0.7);
      ctx.lineWidth = 2;
      for (let i = 0; i <= 2; i++) {
        ctx.beginPath(); ctx.moveTo(i * 64, 0); ctx.lineTo(i * 64, size); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * 64); ctx.lineTo(size, i * 64); ctx.stroke();
      }
    } else if (style === "planks") {
      for (let row = 0; row < 8; row++) {
        ctx.fillStyle = shade(0.85 + rnd() * 0.25);
        ctx.fillRect(0, row * 16, size, 15);
        ctx.fillStyle = shade(0.6);
        ctx.fillRect(((row * 53) % size), row * 16, 2, 15);
      }
    } else if (style === "cobble") {
      for (let i = 0; i < 40; i++) {
        ctx.fillStyle = shade(0.8 + rnd() * 0.35);
        ctx.beginPath();
        ctx.ellipse(rnd() * size, rnd() * size, 8 + rnd() * 6, 6 + rnd() * 5, rnd() * Math.PI, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, [style, color, repeatX, repeatY]);
}

const PARTICLES = 70;

/** Fireflies, falling petals or snow over the main floor, one instanced mesh. */
export function AmbientParticles({ kind }: { kind: "fireflies" | "petals" | "snow" }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const [cx, , cz] = toWorld(LOCAL_OFFICE_CANVAS_WIDTH / 2, LOCAL_OFFICE_CANVAS_HEIGHT / 2);
  const spanX = LOCAL_OFFICE_CANVAS_WIDTH * SCALE;
  const spanZ = LOCAL_OFFICE_CANVAS_HEIGHT * SCALE;
  const seeds = useMemo(
    () => Array.from({ length: PARTICLES }, (_, i) => {
      const r = (k: number) => { const v = Math.sin(i * 91.7 + k * 13.3) * 9973.1; return v - Math.floor(v); };
      return { x: (r(1) - 0.5) * spanX, z: (r(2) - 0.5) * spanZ, y: r(3), speed: 0.3 + r(4) * 0.7, phase: r(5) * Math.PI * 2 };
    }),
    [spanX, spanZ],
  );
  const dummy = useMemo(() => new THREE.Object3D(), []);
  useLayoutEffect(() => {
    if (mesh.current) mesh.current.frustumCulled = false;
  }, []);
  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    const t = clock.elapsedTime;
    seeds.forEach((p, i) => {
      if (kind === "fireflies") {
        dummy.position.set(cx + p.x + Math.sin(t * p.speed + p.phase) * 0.4, 0.3 + p.y * 1.2 + Math.sin(t * 1.3 + p.phase) * 0.15, cz + p.z + Math.cos(t * p.speed + p.phase) * 0.4);
        dummy.scale.setScalar(0.6 + 0.4 * Math.sin(t * 3 + p.phase));
      } else {
        const fall = (p.y * 3 + t * p.speed * (kind === "snow" ? 0.35 : 0.25)) % 3;
        dummy.position.set(cx + p.x + Math.sin(t * 0.8 + p.phase) * 0.3, 3 - fall, cz + p.z);
        dummy.scale.setScalar(1);
      }
      dummy.rotation.set(t * p.speed, p.phase, 0);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });
  const color = kind === "fireflies" ? "#fff59d" : kind === "petals" ? "#f8bbd0" : "#ffffff";
  return (
    <instancedMesh ref={mesh} args={[undefined, undefined, PARTICLES]}>
      {kind === "petals" ? <planeGeometry args={[0.06, 0.04]} /> : <sphereGeometry args={[kind === "fireflies" ? 0.025 : 0.03, 6, 4]} />}
      <meshStandardMaterial
        color={color}
        emissive={kind === "fireflies" ? color : "#000000"}
        emissiveIntensity={kind === "fireflies" ? 2 : 0}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

const GROUND_COLOR: Record<string, string> = {
  plain: "#c8a97e",
  grass: "#6aa84f",
  tiles: "#d7ccc8",
  planks: "#a1887f",
  cobble: "#9e9e9e",
  sand: "#e6d3a3",
};

/** The ground a theme asks for, or null to keep the office's banig floor. */
export function groundLook(scene: OfficeThemeScene | null | undefined): { style: string; color: string } | null {
  const style = scene?.ground && scene.ground !== "default" ? scene.ground : scene?.groundColor ? "plain" : null;
  if (!style) return null;
  return { style, color: scene?.groundColor ?? GROUND_COLOR[style] ?? GROUND_COLOR.plain };
}

/** Wall colour/height for a theme. "hidden" drops the outer shell but keeps
 *  drawn wall items as a low curb, since they still block agents' paths. */
export function wallLook(scene: OfficeThemeScene | null | undefined): { color?: string; height: number; shell: boolean } {
  const preset: Record<string, { color?: string; height: number }> = {
    hedge: { color: "#33691e", height: 0.7 },
    stone: { color: "#8a8f96", height: 1 },
    wood: { color: "#8d6e63", height: 1 },
    low: { height: 0.35 },
    hidden: { height: 0.12 },
  };
  const p = (scene?.walls && preset[scene.walls]) || { height: 1 };
  return { color: scene?.wallColor ?? p.color, height: p.height, shell: scene?.walls !== "hidden" };
}
