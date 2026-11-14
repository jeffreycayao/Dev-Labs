// Mesh parts shared by the office floor figure (retro-office/objects/agents.tsx)
// and the avatar editor preview (AgentAvatarPreview3D.tsx), so the two never
// drift: what you pick in the editor is exactly what walks the floor.

import { useEffect, useMemo } from "react";
import * as THREE from "three";
import type { AgentAvatarHairStyle } from "@/lib/avatars/profile";
import { hexToRgb, rgbToHex, shade } from "@/lib/avatars/palette";

export const FACE_PX = 16;

/** Shadow / highlight of a garment or skin colour (pixel-art hue shift). */
export const darker = (hex: string, amount = 0.3) => rgbToHex(shade(hexToRgb(hex), -amount));
export const lighter = (hex: string, amount = 0.25) => rgbToHex(shade(hexToRgb(hex), amount));

/**
 * The head's front face as a 16×16 pixel-art texture: skin ramp (lit brow,
 * shaded jaw), cheeks and a nose. Eyes, brows and mouth stay separate meshes
 * because they animate. Drawn once per skin colour, nearest-neighbour, sRGB,
 * no mipmaps, and disposed with the owner.
 */
export const useFaceTexture = (skin: string): THREE.Texture => {
  const texture = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = FACE_PX;
    canvas.height = FACE_PX;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const base = hexToRgb(skin);
      const hi = rgbToHex(shade(base, 0.18));
      const sh = rgbToHex(shade(base, -0.22));
      ctx.imageSmoothingEnabled = false;
      ctx.fillStyle = skin;
      ctx.fillRect(0, 0, FACE_PX, FACE_PX);
      ctx.fillStyle = hi;
      ctx.fillRect(0, 0, FACE_PX, 3); // lit brow
      ctx.fillRect(0, 3, 2, 6); // light from the left
      ctx.fillStyle = sh;
      ctx.fillRect(0, FACE_PX - 2, FACE_PX, 2); // jaw shadow
      ctx.fillRect(FACE_PX - 2, 3, 2, FACE_PX - 3); // far cheek
      ctx.fillRect(3, FACE_PX - 3, FACE_PX - 6, 1); // chin crease
      ctx.fillStyle = rgbToHex(shade(base, -0.12));
      ctx.fillRect(7, 8, 2, 3); // nose
      ctx.fillRect(7, 11, 3, 1);
      ctx.fillStyle = "rgba(220, 110, 90, 0.28)";
      ctx.fillRect(2, 9, 3, 2); // cheeks
      ctx.fillRect(11, 9, 3, 2);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    return tex;
  }, [skin]);
  // r3f does not dispose a texture passed as `map`; free it with the owner.
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
};

/**
 * Hair on top of a head box. `y` is the head centre; `size` its width/height/depth.
 * The in-scene figure and the editor preview use slightly different head sizes,
 * so everything here is relative to those.
 */
export function AvatarHair({
  style,
  color,
  y,
  size,
}: {
  style: AgentAvatarHairStyle;
  color: string;
  y: number;
  size: [number, number, number];
}) {
  const [w, h, d] = size;
  const top = y + h / 2; // top of the head box
  const shadow = darker(color, 0.22);
  if (style === "bald") {
    // a low fringe round the sides and back only
    return (
      <mesh position={[0, y - h * 0.1, -d * 0.1]}>
        <boxGeometry args={[w + 0.01, h * 0.3, d * 0.86]} />
        <meshLambertMaterial color={color} />
      </mesh>
    );
  }
  if (style === "short") {
    return (
      <mesh position={[0, top + 0.005, 0]}>
        <boxGeometry args={[w + 0.01, 0.05, d + 0.01]} />
        <meshLambertMaterial color={color} />
      </mesh>
    );
  }
  if (style === "parted") {
    return (
      <>
        <mesh position={[0, top + 0.005, 0]}>
          <boxGeometry args={[w + 0.01, 0.045, d + 0.01]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[-w * 0.2, top + 0.04, 0.01]} rotation={[0.1, 0, -0.2]}>
          <boxGeometry args={[w * 0.7, 0.03, d * 0.55]} />
          <meshLambertMaterial color={lighter(color, 0.12)} />
        </mesh>
      </>
    );
  }
  if (style === "spiky") {
    return (
      <>
        <mesh position={[0, top, 0]}>
          <boxGeometry args={[w, 0.035, d]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[-0.05, top + 0.04, 0]} rotation={[0, 0, -0.2]}>
          <boxGeometry args={[0.04, 0.06, 0.04]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[0, top + 0.055, 0]}>
          <boxGeometry args={[0.04, 0.08, 0.04]} />
          <meshLambertMaterial color={lighter(color, 0.12)} />
        </mesh>
        <mesh position={[0.05, top + 0.04, 0]} rotation={[0, 0, 0.2]}>
          <boxGeometry args={[0.04, 0.06, 0.04]} />
          <meshLambertMaterial color={color} />
        </mesh>
      </>
    );
  }
  if (style === "bun") {
    return (
      <>
        <mesh position={[0, top - 0.002, 0]}>
          <boxGeometry args={[w + 0.01, 0.04, d + 0.01]} />
          <meshLambertMaterial color={color} />
        </mesh>
        <mesh position={[0, top + 0.05, -d * 0.25]}>
          <sphereGeometry args={[0.042, 14, 14]} />
          <meshLambertMaterial color={color} />
        </mesh>
      </>
    );
  }
  if (style === "curly") {
    return (
      <>
        <mesh position={[0, top + 0.01, 0]}>
          <boxGeometry args={[w + 0.03, 0.06, d + 0.03]} />
          <meshLambertMaterial color={color} />
        </mesh>
        {([-0.055, 0, 0.055] as const).map((x) => (
          <mesh key={x} position={[x, top + 0.045, -0.01]}>
            <sphereGeometry args={[0.032, 10, 10]} />
            <meshLambertMaterial color={x === 0 ? lighter(color, 0.12) : color} />
          </mesh>
        ))}
        <mesh position={[0, y, -d * 0.45]}>
          <boxGeometry args={[w + 0.03, h * 0.9, 0.04]} />
          <meshLambertMaterial color={shadow} />
        </mesh>
      </>
    );
  }
  // long: cap plus side panels that fall to the shoulders, and a back panel
  return (
    <>
      <mesh position={[0, top + 0.005, 0]}>
        <boxGeometry args={[w + 0.01, 0.045, d + 0.01]} />
        <meshLambertMaterial color={color} />
      </mesh>
      <mesh position={[-(w / 2 + 0.012), y - h * 0.25, -d * 0.1]}>
        <boxGeometry args={[0.024, h * 1.4, d * 0.8]} />
        <meshLambertMaterial color={shadow} />
      </mesh>
      <mesh position={[w / 2 + 0.012, y - h * 0.25, -d * 0.1]}>
        <boxGeometry args={[0.024, h * 1.4, d * 0.8]} />
        <meshLambertMaterial color={shadow} />
      </mesh>
      <mesh position={[0, y - h * 0.25, -(d / 2 + 0.012)]}>
        <boxGeometry args={[w + 0.05, h * 1.4, 0.024]} />
        <meshLambertMaterial color={shadow} />
      </mesh>
    </>
  );
}
