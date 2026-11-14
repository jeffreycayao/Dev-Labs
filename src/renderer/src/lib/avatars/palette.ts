// Pixel-art colour ramps. Pure: hex in, hex out, no DOM, so it runs under
// node:test (test/avatar-palette.test.cjs).
//
// A flat fill lightened or darkened by multiplying RGB turns muddy: highlights
// go chalky, shadows go grey. Pixel artists shift the hue instead — highlights
// lean warm (toward yellow) and lose a little saturation, shadows lean cool
// (toward blue/violet) and gain some. That is what `shade` does, so every
// accent or garment colour gets a readable 3-step ramp that still looks like
// itself.

export type Rgb = [number, number, number];
export type Hsl = [number, number, number]; // h 0..360, s 0..1, l 0..1
export type Ramp = { light: string; base: string; dark: string };

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

export const hexToRgb = (hex: string): Rgb => {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  const n = parseInt(full, 16);
  if (full.length !== 6 || Number.isNaN(n)) return [128, 128, 128];
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

export const rgbToHex = ([r, g, b]: Rgb): string =>
  '#' + [r, g, b].map((v) => to255(v).toString(16).padStart(2, '0')).join('');

export const rgbToHsl = ([r, g, b]: Rgb): Hsl => {
  const R = r / 255, G = g / 255, B = b / 255;
  const max = Math.max(R, G, B), min = Math.min(R, G, B);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = max === R ? (G - B) / d + (G < B ? 6 : 0) : max === G ? (B - R) / d + 2 : (R - G) / d + 4;
  h *= 60;
  return [h, s, l];
};

export const hslToRgb = ([h, s, l]: Hsl): Rgb => {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  const [r1, g1, b1] =
    hp < 1 ? [c, x, 0] : hp < 2 ? [x, c, 0] : hp < 3 ? [0, c, x]
    : hp < 4 ? [0, x, c] : hp < 5 ? [x, 0, c] : [c, 0, x];
  const m = l - c / 2;
  return [to255((r1 + m) * 255), to255((g1 + m) * 255), to255((b1 + m) * 255)];
};

const WARM_HUE = 55;   // highlights drift toward this (yellow)
const COOL_HUE = 250;  // shadows drift toward this (blue-violet)
const MAX_HUE_SHIFT = 18; // degrees at |amount| = 1

/** Shortest signed distance from hue a to hue b, in degrees. */
const hueDelta = (a: number, b: number) => ((b - a + 540) % 360) - 180;

/**
 * Shift a colour up (amount > 0, toward a highlight) or down (amount < 0,
 * toward a shadow) the pixel-art way: lightness moves, hue leans warm or cool,
 * saturation drops a little in the light and rises a little in the dark.
 * Greys (very low saturation) only change lightness, so they never pick up a
 * tint. `amount` is clamped to -1..1.
 */
export const shade = (rgb: Rgb, amount: number): Rgb => {
  const a = Math.max(-1, Math.min(1, amount));
  if (a === 0) return [rgb[0], rgb[1], rgb[2]];
  const [h, s, l] = rgbToHsl(rgb);
  const l2 = a > 0 ? l + a * (1 - l) : l * (1 + a);
  if (s < 0.08) return hslToRgb([h, s, clamp01(l2)]);
  const target = a > 0 ? WARM_HUE : COOL_HUE;
  const h2 = h + Math.sign(hueDelta(h, target)) * Math.min(Math.abs(hueDelta(h, target)), MAX_HUE_SHIFT * Math.abs(a));
  const s2 = clamp01(s - a * 0.18);
  return hslToRgb([h2, s2, clamp01(l2)]);
};

/** 3-step ramp for an accent: light (highlight), base, dark (shadow). */
export const shadeRamp = (hex: string, light = 0.3, dark = 0.34): Ramp => {
  const rgb = hexToRgb(hex);
  return {
    light: rgbToHex(shade(rgb, Math.abs(light))),
    base: rgbToHex(rgb),
    dark: rgbToHex(shade(rgb, -Math.abs(dark))),
  };
};

/** Relative luminance (0..1) of a hex colour; used to pick readable text. */
export const luminance = (hex: string): number => {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
