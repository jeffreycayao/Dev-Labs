// Office cast — roster metadata + sprite frames. Internal `name` ids are kept
// from the original roster (sprites + saved teams key on them); only the
// user-facing displayName/blurb are localized to Filipino names.
//
// Both the static portraits (cards / picker) and the in-scene walking sprites are
// now fully custom-drawn from the same per-character recipes in portraitArt.ts:
// the scene sprite reuses the portrait's exact head/face/clothing and adds legs,
// so an agent on the office floor looks identical to its card. The LimeZu base
// sheets are no longer used for the cast. See assets/ATTRIBUTION.md.

import { paintPortrait } from './portraitArt';

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
