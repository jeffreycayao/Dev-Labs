/**
 * Office theme files (Settings → General → Features → "Office themes").
 *
 * A theme is the furniture layout of one floor (what the office makes
 * configurable today: every object, its place, turn, size, lift and tint) plus
 * who sits at which desk. It is data only: no code, no file paths, no URLs.
 * Pure and dependency-free so main (file dialogs), the renderer (panel) and
 * tests share one validator — and so the JSON schema and the prompt handed to
 * an AI are generated from the same constants the validator enforces.
 */

export const OFFICE_THEME_SPEC = 'devlabs/office-theme@1';
/** A theme file larger than this is refused before parsing. */
export const OFFICE_THEME_MAX_BYTES = 256 * 1024;
export const OFFICE_THEME_MAX_ITEMS = 400;
export const OFFICE_THEME_MAX_DESKS = 60;
/** Canvas units; the office floor is about 1200 × 700, rooms sit around it. */
export const OFFICE_THEME_COORD = { min: -2000, max: 4000 } as const;
export const OFFICE_THEME_SIZE = { min: 1, max: 2000 } as const;
export const OFFICE_THEME_ELEVATION = { min: -5, max: 50 } as const;

/** Every object type the scene can draw. Anything else is refused: a type the
 *  renderer does not know would be an invisible object that still blocks paths. */
export const OFFICE_FURNITURE_TYPES: readonly string[] = [
  'wall', 'door', 'desk_cubicle', 'executive_desk', 'chair', 'computer', 'keyboard', 'mouse', 'lamp',
  'round_table', 'table_rect', 'couch', 'couch_v', 'beanbag', 'bookshelf', 'cabinet', 'wall_cabinet', 'whiteboard',
  'kanban_board', 'plant', 'clock', 'trash', 'water_cooler', 'coffee_machine', 'vending', 'fridge', 'microwave',
  'stove', 'sink', 'dishwasher', 'pingpong', 'jukebox', 'atm', 'phone_booth', 'sms_booth',
  'server_rack', 'server_terminal', 'device_rack', 'qa_terminal', 'test_bench',
  'treadmill', 'exercise_bike', 'rowing_machine', 'dumbbell_rack', 'kettlebell_rack', 'weight_bench', 'punching_bag', 'yoga_mat'
];

/** One object. Mirrors the renderer's FurnitureItem minus its runtime `_uid`. */
export interface OfficeThemeItem {
  type: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  r?: number;
  facing?: number;
  vertical?: boolean;
  elevation?: number;
  /** `#rrggbb` tint. */
  color?: string;
  /** Stable id a desk assignment can point at (letters, digits, `-`, `_`; ≤ 64). */
  id?: string;
}

export interface OfficeTheme {
  spec: typeof OFFICE_THEME_SPEC;
  name: string;
  author?: string;
  description?: string;
  /** ISO date of export; informational. */
  createdAt?: string;
  items: OfficeThemeItem[];
  /** Desk `id` → agent name. Agents are matched by NAME on import because ids
   *  differ between installs; unknown names are simply ignored. */
  desks?: Record<string, string>;
}

export interface OfficeThemeValidation {
  ok: boolean;
  theme?: OfficeTheme;
  errors: string[];
}

const ITEM_KEYS = new Set(['type', 'x', 'y', 'w', 'h', 'r', 'facing', 'vertical', 'elevation', 'color', 'id']);
const THEME_KEYS = new Set(['spec', 'name', 'author', 'description', 'createdAt', 'items', 'desks']);
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const TEXT_MAX = 200;

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const num = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
/** Short plain text: no control characters, no newlines, capped. */
const text = (v: unknown): v is string => typeof v === 'string' && v.length <= TEXT_MAX
  // eslint-disable-next-line no-control-regex
  && !/[\u0000-\u001F\u007F]/.test(v);

/**
 * Validate an untrusted theme (parsed JSON or raw text). Strict: unknown keys,
 * unknown object types, out-of-range numbers, non-hex colours, long or
 * control-character text and oversize files are all refused with a reason the
 * user can act on. Never throws.
 */
export function validateOfficeTheme(raw: unknown): OfficeThemeValidation {
  const errors: string[] = [];
  let data: unknown = raw;
  if (typeof raw === 'string') {
    if (raw.length > OFFICE_THEME_MAX_BYTES) return { ok: false, errors: [`file is larger than ${OFFICE_THEME_MAX_BYTES / 1024} KB`] };
    try { data = JSON.parse(raw); } catch { return { ok: false, errors: ['not valid JSON'] }; }
  }
  if (!isObj(data)) return { ok: false, errors: ['the file must hold one JSON object'] };
  for (const k of Object.keys(data)) if (!THEME_KEYS.has(k)) errors.push(`unknown field "${k}"`);
  if (data.spec !== OFFICE_THEME_SPEC) errors.push(`"spec" must be "${OFFICE_THEME_SPEC}"`);
  if (!text(data.name) || !data.name.trim()) errors.push('"name" must be a short text');
  for (const k of ['author', 'description', 'createdAt'] as const) {
    if (data[k] !== undefined && !text(data[k])) errors.push(`"${k}" must be a short text`);
  }
  if (!Array.isArray(data.items)) errors.push('"items" must be an array');
  else if (data.items.length > OFFICE_THEME_MAX_ITEMS) errors.push(`more than ${OFFICE_THEME_MAX_ITEMS} items`);
  const items: OfficeThemeItem[] = [];
  const ids = new Set<string>();
  if (Array.isArray(data.items) && data.items.length <= OFFICE_THEME_MAX_ITEMS) {
    data.items.forEach((it: unknown, i: number) => {
      const where = `items[${i}]`;
      if (!isObj(it)) { errors.push(`${where}: not an object`); return; }
      for (const k of Object.keys(it)) if (!ITEM_KEYS.has(k)) errors.push(`${where}: unknown field "${k}"`);
      if (typeof it.type !== 'string' || !OFFICE_FURNITURE_TYPES.includes(it.type)) { errors.push(`${where}: unknown type ${JSON.stringify(it.type)}`); return; }
      if (!num(it.x, OFFICE_THEME_COORD.min, OFFICE_THEME_COORD.max) || !num(it.y, OFFICE_THEME_COORD.min, OFFICE_THEME_COORD.max)) { errors.push(`${where}: x and y must be numbers between ${OFFICE_THEME_COORD.min} and ${OFFICE_THEME_COORD.max}`); return; }
      const out: OfficeThemeItem = { type: it.type, x: it.x, y: it.y };
      for (const k of ['w', 'h'] as const) {
        if (it[k] === undefined) continue;
        if (!num(it[k], OFFICE_THEME_SIZE.min, OFFICE_THEME_SIZE.max)) { errors.push(`${where}: ${k} out of range`); continue; }
        out[k] = it[k] as number;
      }
      for (const k of ['r', 'facing'] as const) {
        if (it[k] === undefined) continue;
        if (!num(it[k], -360, 360)) { errors.push(`${where}: ${k} must be degrees`); continue; }
        out[k] = it[k] as number;
      }
      if (it.elevation !== undefined) {
        if (!num(it.elevation, OFFICE_THEME_ELEVATION.min, OFFICE_THEME_ELEVATION.max)) errors.push(`${where}: elevation out of range`);
        else out.elevation = it.elevation;
      }
      if (it.vertical !== undefined) {
        if (typeof it.vertical !== 'boolean') errors.push(`${where}: vertical must be true or false`);
        else out.vertical = it.vertical;
      }
      if (it.color !== undefined) {
        if (typeof it.color !== 'string' || !COLOR_RE.test(it.color)) errors.push(`${where}: color must be #rrggbb`);
        else out.color = it.color.toLowerCase();
      }
      if (it.id !== undefined) {
        if (typeof it.id !== 'string' || !ID_RE.test(it.id)) errors.push(`${where}: id must be letters, digits, - or _ (max 64)`);
        else if (ids.has(it.id)) errors.push(`${where}: duplicate id "${it.id}"`);
        else { ids.add(it.id); out.id = it.id; }
      }
      items.push(out);
    });
  }
  let desks: Record<string, string> | undefined;
  if (data.desks !== undefined) {
    if (!isObj(data.desks)) errors.push('"desks" must be an object of desk id → agent name');
    else {
      const entries = Object.entries(data.desks);
      if (entries.length > OFFICE_THEME_MAX_DESKS) errors.push(`more than ${OFFICE_THEME_MAX_DESKS} desk assignments`);
      else {
        desks = {};
        for (const [deskId, agent] of entries) {
          if (!ID_RE.test(deskId)) { errors.push(`desks: bad desk id "${deskId.slice(0, 20)}"`); continue; }
          if (!ids.has(deskId)) { errors.push(`desks: "${deskId}" is not the id of an item`); continue; }
          if (!text(agent) || !agent.trim()) { errors.push(`desks["${deskId}"]: agent name must be a short text`); continue; }
          desks[deskId] = agent;
        }
      }
    }
  }
  if (errors.length) return { ok: false, errors: errors.slice(0, 25) };
  const theme: OfficeTheme = { spec: OFFICE_THEME_SPEC, name: (data.name as string).trim(), items };
  if (data.author) theme.author = data.author as string;
  if (data.description) theme.description = data.description as string;
  if (data.createdAt) theme.createdAt = data.createdAt as string;
  if (desks && Object.keys(desks).length) theme.desks = desks;
  return { ok: true, theme, errors: [] };
}

/** What an import would change, for the preview. */
export interface OfficeThemeDiff {
  added: Record<string, number>;
  removed: Record<string, number>;
  /** Objects of the same type that stay but move, turn or recolour. */
  changed: number;
  before: number;
  after: number;
}

const itemKey = (it: OfficeThemeItem): string =>
  [it.type, it.x, it.y, it.w ?? '', it.h ?? '', it.r ?? '', it.facing ?? '', it.vertical ? 1 : '', it.elevation ?? '', it.color ?? ''].join('|');

export function diffOfficeThemes(before: readonly OfficeThemeItem[], after: readonly OfficeThemeItem[]): OfficeThemeDiff {
  const count = (list: readonly OfficeThemeItem[]): Map<string, number> => {
    const m = new Map<string, number>();
    for (const it of list) m.set(itemKey(it), (m.get(itemKey(it)) ?? 0) + 1);
    return m;
  };
  const a = count(before);
  const b = count(after);
  const byType = (m: Map<string, number>, other: Map<string, number>): Record<string, number> => {
    const out: Record<string, number> = {};
    for (const [k, n] of m) {
      const extra = n - (other.get(k) ?? 0);
      if (extra > 0) { const type = k.split('|')[0]; out[type] = (out[type] ?? 0) + extra; }
    }
    return out;
  };
  const added = byType(b, a);
  const removed = byType(a, b);
  // A removed X plus an added X of the same type reads as "moved", not as two changes.
  let changed = 0;
  for (const type of Object.keys(added)) {
    const moved = Math.min(added[type], removed[type] ?? 0);
    if (moved > 0) { changed += moved; added[type] -= moved; removed[type] -= moved; if (!added[type]) delete added[type]; if (!removed[type]) delete removed[type]; }
  }
  return { added, removed, changed, before: before.length, after: after.length };
}

/** Strip runtime fields from the scene's furniture into theme items. */
export function officeThemeFromFurniture(
  items: readonly (OfficeThemeItem & { _uid?: string })[],
  meta: { name: string; author?: string; description?: string; now?: Date },
  desks?: Record<string, string>
): OfficeTheme {
  const out: OfficeThemeItem[] = items.map((it) => {
    const o: OfficeThemeItem = { type: it.type, x: it.x, y: it.y };
    for (const k of ['w', 'h', 'r', 'facing', 'elevation'] as const) if (typeof it[k] === 'number') o[k] = it[k];
    if (it.vertical) o.vertical = true;
    if (typeof it.color === 'string' && COLOR_RE.test(it.color)) o.color = it.color.toLowerCase();
    if (typeof it.id === 'string' && ID_RE.test(it.id)) o.id = it.id;
    return o;
  });
  const theme: OfficeTheme = {
    spec: OFFICE_THEME_SPEC,
    name: meta.name.trim().slice(0, TEXT_MAX) || 'My office',
    createdAt: (meta.now ?? new Date()).toISOString(),
    items: out
  };
  if (meta.author?.trim()) theme.author = meta.author.trim().slice(0, TEXT_MAX);
  if (meta.description?.trim()) theme.description = meta.description.trim().slice(0, TEXT_MAX);
  if (desks && Object.keys(desks).length) theme.desks = desks;
  return theme;
}

export function officeThemeFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'office-theme';
  return `${slug}.office-theme.json`;
}

/** JSON Schema (draft 2020-12) generated from the same constants the validator uses. */
export function officeThemeJsonSchema(): Record<string, unknown> {
  const n = (min: number, max: number) => ({ type: 'number', minimum: min, maximum: max });
  const short = { type: 'string', maxLength: TEXT_MAX, pattern: '^[^\\u0000-\\u001F\\u007F]*$' };
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'DevLabs office theme',
    type: 'object',
    additionalProperties: false,
    required: ['spec', 'name', 'items'],
    properties: {
      spec: { const: OFFICE_THEME_SPEC },
      name: { ...short, minLength: 1 },
      author: short,
      description: short,
      createdAt: short,
      items: {
        type: 'array',
        maxItems: OFFICE_THEME_MAX_ITEMS,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['type', 'x', 'y'],
          properties: {
            type: { enum: [...OFFICE_FURNITURE_TYPES] },
            x: n(OFFICE_THEME_COORD.min, OFFICE_THEME_COORD.max),
            y: n(OFFICE_THEME_COORD.min, OFFICE_THEME_COORD.max),
            w: n(OFFICE_THEME_SIZE.min, OFFICE_THEME_SIZE.max),
            h: n(OFFICE_THEME_SIZE.min, OFFICE_THEME_SIZE.max),
            r: n(-360, 360),
            facing: n(-360, 360),
            vertical: { type: 'boolean' },
            elevation: n(OFFICE_THEME_ELEVATION.min, OFFICE_THEME_ELEVATION.max),
            color: { type: 'string', pattern: '^#[0-9a-fA-F]{6}$' },
            id: { type: 'string', pattern: ID_RE.source }
          }
        }
      },
      desks: {
        type: 'object',
        maxProperties: OFFICE_THEME_MAX_DESKS,
        propertyNames: { pattern: ID_RE.source },
        additionalProperties: { ...short, minLength: 1 }
      }
    }
  };
}

/** The prompt a user pastes into any AI, with the schema and the current layout
 *  as a worked example so the model keeps walls, doors and rooms where they are. */
export function officeThemePrompt(current?: OfficeTheme): string {
  const lines = [
    'Design a furniture layout for my DevLabs 3D office and return it as ONE JSON file that follows the JSON Schema below exactly. Output only the JSON, no prose, no code fences.',
    '',
    'Rules:',
    `- "spec" is exactly "${OFFICE_THEME_SPEC}". Give the theme a short "name" and a one-line "description".`,
    `- Only the object types in the schema's enum exist. Coordinates are canvas units (x right, y down); the main room is roughly x 0–1200, y 0–700; walls are "wall" items with w/h; doors are "door". Keep walls and doors where they are unless I ask to move rooms.`,
    `- "facing" and "r" are degrees. "color" is an optional #rrggbb tint. "elevation" lifts an object (${OFFICE_THEME_ELEVATION.min}–${OFFICE_THEME_ELEVATION.max}).`,
    `- At most ${OFFICE_THEME_MAX_ITEMS} items. Leave walking space between desks (about 60 units) and do not stack objects on desks except computer, keyboard, mouse and lamp.`,
    '- Give every desk_cubicle an "id" (for example "desk-1") so seats can be assigned; "desks" maps a desk id to an agent name and is optional.',
    '- No file paths, URLs, scripts or extra fields: the importer refuses anything outside the schema.',
    '',
    'JSON Schema:',
    JSON.stringify(officeThemeJsonSchema(), null, 2)
  ];
  if (current) {
    lines.push('', 'My current layout, for reference (keep the rooms; change what I ask):', JSON.stringify(current, null, 2));
  }
  return lines.join('\n');
}
