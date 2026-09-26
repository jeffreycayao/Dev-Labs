// Office cast — roster metadata + sprite frames. Internal `name` ids are kept
// from the original roster (sprites + saved teams key on them); only the
// user-facing displayName/blurb are localized to Filipino names.
//
// Both the static portraits (cards / picker) and the in-scene walking sprites are
// now fully custom-drawn from the same per-character recipes in portraitArt.ts:
// the scene sprite reuses the portrait's exact head/face/clothing and adds legs,
// so an agent on the office floor looks identical to its card. The LimeZu base
// sheets are no longer used for the cast. See assets/ATTRIBUTION.md.

import { Texture } from 'pixi.js';
import { paintPortrait, sceneFrameBufs, SCENE_W, SCENE_H } from './portraitArt';

export type OfficeCharacterName =
  | 'michael' | 'jim' | 'pam' | 'dwight' | 'kevin' | 'angela'
  | 'oscar' | 'stanley' | 'phyllis' | 'andy' | 'kelly' | 'ryan'
  | 'toby' | 'creed' | 'meredith';

export interface CastMember {
  name: OfficeCharacterName;
  displayName: string;
  /** Signature accent color (hex) — used for the in-scene selection glow. */
  shirt: string;
  /** Blurb shown when this character is picked / has no description yet. */
  blurb: string;
}

/** Selectable roster, in display order. */
export const OFFICE_CAST: CastMember[] = [
  { name: 'michael',  displayName: 'Ramon',  shirt: '#5a6b8c', blurb: 'Office head, the boss' },
  { name: 'jim',      displayName: 'Paolo',      shirt: '#6fa8dc', blurb: 'Sales lead, prankster' },
  { name: 'pam',      displayName: 'Maricel',      shirt: '#9caf88', blurb: 'Front desk, artist' },
  { name: 'dwight',   displayName: 'Rodel',   shirt: '#b89b3e', blurb: 'Assistant (to the) manager' },
  { name: 'kevin',    displayName: 'Bong',    shirt: '#4a7ab5', blurb: 'Accounting' },
  { name: 'angela',   displayName: 'Rowena',   shirt: '#8a86a6', blurb: 'Head of accounting' },
  { name: 'oscar',    displayName: 'Carlo',    shirt: '#7a4b6b', blurb: 'Accountant' },
  { name: 'stanley',  displayName: 'Ernesto',  shirt: '#8c5a4b', blurb: 'Sales, crossword' },
  { name: 'phyllis',  displayName: 'Lorna',  shirt: '#b08bbf', blurb: 'Sales' },
  { name: 'andy',     displayName: 'Miguel',     shirt: '#6fae6f', blurb: 'Sales, choir singer' },
  { name: 'kelly',    displayName: 'Kristine',    shirt: '#d16ba5', blurb: 'Customer service' },
  { name: 'ryan',     displayName: 'Jomar',     shirt: '#3a3a44', blurb: 'The intern' },
  { name: 'toby',     displayName: 'Rogelio',     shirt: '#9a8c5a', blurb: 'Human resources' },
  { name: 'creed',    displayName: 'Lito',    shirt: '#6b7a4b', blurb: 'Quality assurance' },
  { name: 'meredith', displayName: 'Divina', shirt: '#b5544a', blurb: 'Supplier relations' },
];

export const CAST_BY_NAME: Record<OfficeCharacterName, CastMember> =
  Object.fromEntries(OFFICE_CAST.map((c) => [c.name, c])) as Record<OfficeCharacterName, CastMember>;

export const DEFAULT_CHARACTER: OfficeCharacterName = 'jim';

export function hexToNumber(hex: string): number {
  return parseInt(hex.replace('#', ''), 16);
}

// ─── scene frames ────────────────────────────────────────────────────────────
const frameCache = new Map<OfficeCharacterName, Texture[][]>();

function bufToTexture(buf: Uint8ClampedArray): Texture {
  const canvas = document.createElement('canvas');
  canvas.width = SCENE_W; canvas.height = SCENE_H;
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SCENE_W, SCENE_H);
  img.data.set(buf);
  ctx.putImageData(img, 0, 0);
  const tex = Texture.from(canvas);
  tex.source.scaleMode = 'nearest';
  return tex;
}

/**
 * Frame grid CharacterSprite expects: 3 rows (down, up, right) × 7 frames
 * [walk1, walk2, walk3, type1, type2, read1, read2]. We provide a front view
 * (down — and reused for the side row, so left/right walkers still show a face)
 * and a back view (up — agents seated facing their desk show their back). The
 * three walk frames are stand / step-left / step-right.
 */
export async function getCastFrames(name: OfficeCharacterName): Promise<Texture[][]> {
  const cached = frameCache.get(name);
  if (cached) return cached;
  const { front, back } = sceneFrameBufs(name);
  const toRow = (bufs: Uint8ClampedArray[]): Texture[] => {
    const [stand, stepL, stepR] = bufs.map(bufToTexture);
    return [stand, stepL, stepR, stand, stand, stand, stand];
  };
  const frontRow = toRow(front);
  const frames: Texture[][] = [frontRow, toRow(back), frontRow]; // down, up, right
  frameCache.set(name, frames);
  return frames;
}

/**
 * Paint a character's static portrait for cards / the picker (delegates to the
 * custom procedural composer in portraitArt.ts).
 */
export async function paintCastPortrait(
  ctx: CanvasRenderingContext2D,
  name: OfficeCharacterName,
  scale = 2,
): Promise<void> {
  paintPortrait(ctx, name, scale);
}
