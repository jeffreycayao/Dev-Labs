import * as THREE from "three";
import { memo, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { Text } from "@react-three/drei";
import { SCALE } from "@/features/retro-office/core/constants";
import {
  LOCAL_OFFICE_CANVAS_HEIGHT,
  LOCAL_OFFICE_CANVAS_WIDTH,
} from "@/features/retro-office/core/district";
import { toWorld } from "@/features/retro-office/core/geometry";

// DevLabs "Neo-Manila" look: Filipino craft (banig weave, narra wood, capiz
// windows, parol lanterns, jeepney stripes) lit like a near-future office.
// Everything is procedural, so there are no new assets to license or load.

export const NEO_MANILA = {
  narra: "#7a4a2a",
  narraGlow: "#3b2314",
  capiz: "#f4efe2",
  capizGlow: "#fff3d6",
  neonCyan: "#22d3ee",
  neonPink: "#ec4899",
  sun: "#fcd116",
  blue: "#0038a8",
  red: "#ce1126",
} as const;

/** Banig (woven mat) floor: pandan and buri diagonals with thin red, blue and
 *  gold bands, and a faint cyan tile grid on top. One texture tile is ~2 world
 *  units, repeated across the office. */
export function useBanigTexture(repeatX: number, repeatY: number) {
  return useMemo(() => {
    const size = 256;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.fillStyle = "#c9a878";
    ctx.fillRect(0, 0, size, size);
    const strip = 16;
    // Over-under weave: alternate tones in a diagonal checker of strips.
    for (let y = 0; y < size; y += strip) {
      for (let x = 0; x < size; x += strip) {
        const over = ((x + y) / strip) % 2 === 0;
        ctx.fillStyle = over ? "#d3b487" : "#b8956a";
        ctx.fillRect(x, y, strip, strip);
        ctx.strokeStyle = "rgba(90,60,30,0.25)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        if (over) {
          ctx.moveTo(x, y + strip / 2);
          ctx.lineTo(x + strip, y + strip / 2);
        } else {
          ctx.moveTo(x + strip / 2, y);
          ctx.lineTo(x + strip / 2, y + strip);
        }
        ctx.stroke();
      }
    }
    // Banig colour bands.
    const bands: [number, string][] = [
      [40, NEO_MANILA.red],
      [48, NEO_MANILA.sun],
      [200, NEO_MANILA.blue],
      [208, NEO_MANILA.sun],
    ];
    for (const [y, color] of bands) {
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.fillRect(0, y, size, 5);
    }
    ctx.globalAlpha = 1;
    // Futuristic tile seams.
    ctx.strokeStyle = "rgba(34,211,238,0.35)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size - 2, size - 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    return texture;
  }, [repeatX, repeatY]);
}

const PAROL_SHAPE = (() => {
  const shape = new THREE.Shape();
  const outer = 0.22;
  const inner = 0.09;
  for (let i = 0; i < 10; i += 1) {
    const r = i % 2 === 0 ? outer : inner;
    const a = Math.PI / 2 + (i * Math.PI) / 5;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  return shape;
})();

function Parol({
  position,
  color,
  phase,
}: {
  position: [number, number, number];
  color: string;
  phase: number;
}) {
  const ref = useRef<THREE.Group>(null);
  const glowRef = useRef<THREE.MeshStandardMaterial>(null);
  useFrame(({ clock }) => {
    const t = clock.getElapsedTime() + phase;
    if (ref.current) ref.current.rotation.y = Math.sin(t * 0.6) * 0.5;
    if (glowRef.current) glowRef.current.emissiveIntensity = 1.1 + Math.sin(t * 2.2) * 0.35;
  });
  return (
    <group position={position}>
      {/* hanging wire */}
      <mesh position={[0, 0.7, 0]}>
        <cylinderGeometry args={[0.008, 0.008, 1, 4]} />
        <meshBasicMaterial color="#1f2937" />
      </mesh>
      <group ref={ref} scale={2.2}>
        <mesh>
          <extrudeGeometry args={[PAROL_SHAPE, { depth: 0.05, bevelEnabled: false }]} />
          <meshStandardMaterial
            ref={glowRef}
            color={color}
            emissive={color}
            emissiveIntensity={1.2}
            roughness={0.4}
          />
        </mesh>
        <mesh position={[0, 0, 0.026]}>
          <circleGeometry args={[0.07, 16]} />
          <meshBasicMaterial color={NEO_MANILA.capizGlow} />
        </mesh>
        {/* tails */}
        {[-0.06, 0, 0.06].map((x) => (
          <mesh key={x} position={[x, -0.32, 0.02]}>
            <planeGeometry args={[0.02, 0.26]} />
            <meshBasicMaterial color={color} side={THREE.DoubleSide} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/** Capiz-shell window band, jeepney stripes, neon trim, a MABUHAY sign and
 *  parol lanterns, placed on the north and west walls the camera looks at. */
export const NeoManilaAccents = memo(function NeoManilaAccents() {
  const width = LOCAL_OFFICE_CANVAS_WIDTH * SCALE;
  const height = LOCAL_OFFICE_CANVAS_HEIGHT * SCALE;
  const [cx, , cz] = toWorld(LOCAL_OFFICE_CANVAS_WIDTH / 2, LOCAL_OFFICE_CANVAS_HEIGHT / 2);
  const northZ = cz - height / 2 + 0.075;
  const westX = cx - width / 2 + 0.075;
  // East wing (gym, QA lab, art room) starts at canvas x≈1092; keep the north
  // wall decoration over the open office and kitchen only.
  const [eastWingX] = toWorld(1092, 0);
  const northSpan = eastWingX - (cx - width / 2) - 0.3;
  const northStart = cx - width / 2 + 0.15;
  const paneCount = Math.max(4, Math.floor(northSpan / 0.42));
  const paneStep = northSpan / paneCount;
  // Boss office east wall is at canvas x 430–438; the door is at y 150–190.
  const [bossSignX, , bossSignZ] = toWorld(440, 95);
  const stripes = [NEO_MANILA.red, NEO_MANILA.sun, NEO_MANILA.blue, "#16a34a"];
  const parolColors = [NEO_MANILA.sun, NEO_MANILA.neonPink, NEO_MANILA.neonCyan, NEO_MANILA.red, "#a3e635"];
  const parols = useMemo(
    () =>
      [0.12, 0.3, 0.48, 0.66, 0.84].map((fx, i) => {
        const [x, , z] = toWorld(1092 * fx, 260 + (i % 2) * 220);
        return { position: [x, 2.1, z] as [number, number, number], color: parolColors[i], phase: i * 1.3 };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  return (
    <group>
      {/* Capiz window band (north wall). */}
      {Array.from({ length: paneCount }, (_, i) => {
        const x = northStart + paneStep * (i + 0.5);
        return (
          <group key={`capiz-${i}`} position={[x, 0.72, northZ]}>
            <mesh>
              <boxGeometry args={[paneStep - 0.04, 0.3, 0.02]} />
              <meshStandardMaterial color={NEO_MANILA.narra} roughness={0.8} />
            </mesh>
            {[-1, 1].map((col) =>
              [-1, 1].map((row) => (
                <mesh
                  key={`${col}${row}`}
                  position={[col * (paneStep / 4 - 0.015), row * 0.065, 0.012]}
                >
                  <planeGeometry args={[paneStep / 2 - 0.06, 0.11]} />
                  <meshStandardMaterial
                    color={NEO_MANILA.capiz}
                    emissive={NEO_MANILA.capizGlow}
                    emissiveIntensity={0.45}
                    transparent
                    opacity={0.92}
                    roughness={0.25}
                  />
                </mesh>
              )),
            )}
          </group>
        );
      })}

      {/* Jeepney stripes under the windows (north + west). */}
      {stripes.map((color, i) => (
        <group key={`stripe-${color}`}>
          <mesh position={[northStart + northSpan / 2, 0.5 - i * 0.035, northZ + 0.01]}>
            <planeGeometry args={[northSpan, 0.022]} />
            <meshBasicMaterial color={color} />
          </mesh>
          <mesh
            position={[westX + 0.01, 0.5 - i * 0.035, cz]}
            rotation={[0, Math.PI / 2, 0]}
          >
            <planeGeometry args={[height - 0.3, 0.022]} />
            <meshBasicMaterial color={color} />
          </mesh>
        </group>
      ))}

      {/* Neon trim along the top of the back walls. */}
      <mesh position={[cx, 0.985, northZ + 0.01]}>
        <boxGeometry args={[width - 0.2, 0.025, 0.02]} />
        <meshStandardMaterial color={NEO_MANILA.neonCyan} emissive={NEO_MANILA.neonCyan} emissiveIntensity={1.6} />
      </mesh>
      <mesh position={[westX + 0.01, 0.985, cz]}>
        <boxGeometry args={[0.02, 0.025, height - 0.2]} />
        <meshStandardMaterial color={NEO_MANILA.neonPink} emissive={NEO_MANILA.neonPink} emissiveIntensity={1.6} />
      </mesh>

      {/* MABUHAY neon sign on the west wall. */}
      <group position={[westX + 0.02, 0.78, cz + height * 0.18]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[1.5, 0.3]} />
          <meshBasicMaterial color="#0b1020" />
        </mesh>
        <Text fontSize={0.16} color={NEO_MANILA.sun} anchorX="center" anchorY="middle" outlineWidth={0.006} outlineColor={NEO_MANILA.neonPink}>
          MABUHAY
        </Text>
      </group>

      {/* BOSS sign outside Ramon's office (east wall of the old art room). */}
      <group position={[bossSignX, 0.72, bossSignZ]} rotation={[0, Math.PI / 2, 0]}>
        <mesh position={[0, 0, -0.005]}>
          <planeGeometry args={[0.9, 0.26]} />
          <meshBasicMaterial color="#1a0606" />
        </mesh>
        <Text fontSize={0.15} color="#fecaca" anchorX="center" anchorY="middle" outlineWidth={0.008} outlineColor={NEO_MANILA.red}>
          BOSS
        </Text>
      </group>

      {parols.map((p) => (
        <Parol key={p.phase} position={p.position} color={p.color} phase={p.phase} />
      ))}
    </group>
  );
});
