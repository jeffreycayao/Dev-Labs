/**
 * Built-in office themes offered in the theme panel. Each one goes through the
 * same validator and preview/apply/undo path as an imported file.
 *
 * "default" and "christmas" start from the stock office layout, so they follow
 * any change to furnitureDefaults; "fairy" is a complete theme file.
 */
import { officeThemeFromFurniture, validateOfficeTheme, type OfficeTheme, type OfficeThemeItem } from '@shared/officeTheme';
import { materializeDefaults } from '../../features/retro-office/core/furnitureDefaults';
import fairyGlade from './presets/fairy-glade.office-theme.json';

export const OFFICE_THEME_PRESETS = ['default', 'fairy', 'christmas'] as const;
export type OfficeThemePresetId = (typeof OFFICE_THEME_PRESETS)[number];

const RED = '#c62828';
const GREEN = '#2e7d32';
const GOLD = '#fdd835';
const BLUE = '#1565c0';

/** Decorations laid over the stock office, in its free floor space. */
const CHRISTMAS_DECOR: OfficeThemeItem[] = [
  { type: 'pine_tree', x: 790, y: 280, w: 110, h: 110, color: '#1b5e20' },
  { type: 'gift', x: 785, y: 392, color: RED },
  { type: 'gift', x: 815, y: 398, w: 26, h: 26, color: BLUE },
  { type: 'gift', x: 850, y: 394, color: GREEN },
  { type: 'gift', x: 880, y: 396, w: 18, h: 18, color: GOLD },
  { type: 'lantern', x: 775, y: 270, color: RED },
  { type: 'lantern', x: 905, y: 270, color: GOLD },
  { type: 'lantern', x: 905, y: 380, color: GREEN },
  { type: 'snowman', x: 250, y: 585, w: 50, h: 50 },
  { type: 'snowman', x: 575, y: 585, w: 50, h: 50 },
  { type: 'pine_tree', x: 300, y: 215, w: 50, h: 50, color: '#1b5e20' },
  { type: 'pine_tree', x: 735, y: 215, w: 50, h: 50, color: '#1b5e20' },
  // String lights along the walkway between the dining corner and the desks.
  ...[140, 270, 470, 600].map((x, i): OfficeThemeItem => ({ type: 'lantern', x, y: 270, color: [RED, GOLD, GREEN][i % 3] }))
];

const stockOffice = (): OfficeThemeItem[] => officeThemeFromFurniture(materializeDefaults('office'), { name: 'Default office' }).items;

/** The preset as a validated theme. Throws only if a bundled preset is broken
 *  (the test suite checks every one). */
export function buildOfficeThemePreset(id: OfficeThemePresetId): OfficeTheme {
  const raw: unknown = id === 'fairy'
    ? fairyGlade
    : {
        spec: 'devlabs/office-theme@1',
        name: id === 'christmas' ? 'Christmas Season' : 'Default office',
        description: id === 'christmas'
          ? 'The standard office with a decorated tree, gifts, snowmen, string lights and falling snow.'
          : 'The standard DevLabs office.',
        items: id === 'christmas' ? [...stockOffice(), ...CHRISTMAS_DECOR] : stockOffice(),
        ...(id === 'christmas'
          ? { scene: { ground: 'tiles', groundColor: '#cfdbe4', walls: 'wood', wallColor: '#8e2b2b', sky: '#0b1a2e', lightColor: '#fff1dc', ambient: 'snow' } }
          : {})
      };
  const v = validateOfficeTheme(raw);
  if (!v.ok || !v.theme) throw new Error(`office theme preset "${id}": ${v.errors.join('; ')}`);
  return v.theme;
}
