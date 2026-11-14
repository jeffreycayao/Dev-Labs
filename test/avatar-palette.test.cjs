'use strict';

// Pixel-art colour ramps for agent accents and garments (lib/avatars/palette.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const p = loadTs('src/renderer/src/lib/avatars/palette.ts');

test('hex <-> rgb <-> hsl round-trip', () => {
  for (const hex of ['#000000', '#ffffff', '#cf5f52', '#4a8a9a', '#8a79c2', '#cdf252']) {
    assert.equal(p.rgbToHex(p.hexToRgb(hex)), hex);
    assert.equal(p.rgbToHex(p.hslToRgb(p.rgbToHsl(p.hexToRgb(hex)))), hex);
  }
  assert.deepEqual(p.hexToRgb('#abc'), [0xaa, 0xbb, 0xcc]);
  assert.deepEqual(p.hexToRgb('garbage'), [128, 128, 128]);
});

test('a ramp keeps order: light is lighter than base, dark is darker', () => {
  for (const hex of ['#cf5f52', '#5e9a4e', '#4a8a9a', '#cdf252', '#8a79c2', '#d4af37', '#2d3748', '#f5f5f4']) {
    const ramp = p.shadeRamp(hex);
    assert.equal(ramp.base, hex);
    assert.ok(p.luminance(ramp.light) > p.luminance(ramp.base), `${hex} light`);
    assert.ok(p.luminance(ramp.dark) < p.luminance(ramp.base), `${hex} dark`);
  }
});

test('shading shifts hue warm in the light and cool in the dark, not a flat multiply', () => {
  const red = p.hexToRgb('#cf5f52');
  const [h] = p.rgbToHsl(red);
  const [hl] = p.rgbToHsl(p.shade(red, 0.4));
  const [hd] = p.rgbToHsl(p.shade(red, -0.4));
  assert.ok(hl > h, 'highlight leans toward yellow');
  assert.ok(hd < h || hd > 300, 'shadow leans toward violet');
  // A flat multiply keeps the hue exactly; ours must move it but never past 18°.
  assert.ok(Math.abs(hl - h) > 1 && Math.abs(hl - h) <= 18);
});

test('greys stay grey and extremes clamp', () => {
  const grey = p.hexToRgb('#808080');
  for (const amt of [0.5, -0.5]) {
    const [r, g, b] = p.shade(grey, amt);
    assert.equal(r, g); assert.equal(g, b);
  }
  assert.deepEqual(p.shade([255, 255, 255], 1), [255, 255, 255]);
  assert.deepEqual(p.shade([10, 20, 30], -1), [0, 0, 0]);
  assert.deepEqual(p.shade([10, 20, 30], 0), [10, 20, 30]);
  assert.deepEqual(p.shade([10, 20, 30], 5), p.shade([10, 20, 30], 1));
});
