import { useEffect, useRef } from 'react';
import { paintCastPortrait, type OfficeCharacterName } from '@/scene/office/cast';
import { PORTRAIT_W, PORTRAIT_H } from '@/scene/office/portraitArt';
import { accentByName, accentLightByName, hex, type AccentColorName } from '@/design/tokens';

const FRAME_W = PORTRAIT_W;
const FRAME_H = PORTRAIT_H;

export interface SpritePortraitProps {
  character: OfficeCharacterName;
  /** Pixels per source pixel. Whole numbers are exact; half-steps (1.5, 2.5)
   *  double every other row, which pixel art survives. The blit runs with
   *  smoothing off, so nothing here is ever interpolated. */
  scale?: number;
  background?: string;
  /** Agent accent: paints the brand's light tint behind the bust with a one
   *  source-pixel frame in the full accent, so every portrait sits in the same
   *  head-and-shoulders frame. */
  accent?: AccentColorName;
}

/** Integer device pixels per CSS pixel; the backing store is this many times
 *  larger than the CSS box so HiDPI screens get crisp 2x/3x pixels instead of
 *  the browser upscaling a 1x canvas. */
const devicePixels = () =>
  Math.max(1, Math.min(4, Math.round(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)));

/** Static head-and-shoulders portrait of an Office cast member (drawn in code). */
export function SpritePortrait({
  character,
  scale = 2,
  background = 'transparent',
  accent
}: SpritePortraitProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // A fractional scale can land on a fractional pixel count; the canvas
  // attributes are integers either way, so round once and use the same number
  // for the backing store and the CSS box (a mismatch is what makes pixel art
  // blurry).
  const w = Math.round(FRAME_W * scale);
  const h = Math.round(FRAME_H * scale);
  const dpr = devicePixels();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (accent) {
      const px = scale * dpr;
      ctx.fillStyle = hex(accentByName[accent]);
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = hex(accentLightByName[accent]);
      ctx.fillRect(px, px, canvas.width - 2 * px, canvas.height - px);
    } else if (background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
    paintCastPortrait(ctx, character, scale * dpr, false).catch(() => { /* asset load race */ });
  }, [character, scale, background, accent, dpr]);

  return (
    <canvas
      ref={canvasRef}
      width={w * dpr}
      height={h * dpr}
      style={{
        width: w,
        height: h,
        imageRendering: 'pixelated'
      }}
    />
  );
}
