'use strict';

// Office theme files (src/shared/officeTheme.ts): the strict validator, the
// import diff, export round-trip, the generated schema/prompt, and the
// renderer-side backup/revert store (src/renderer/src/scene/office3d/themeStore.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const ot = loadTs('src/shared/officeTheme.ts');

const good = () => ({
  spec: ot.OFFICE_THEME_SPEC,
  name: 'Cosy corner',
  items: [
    { type: 'wall', x: 0, y: 0, w: 1200, h: 20 },
    { type: 'desk_cubicle', x: 100, y: 100, facing: 90, id: 'desk-1', color: '#AABBCC' },
    { type: 'plant', x: 300, y: 120, elevation: 2 }
  ],
  desks: { 'desk-1': 'Paolo - Jr. Programmer' }
});

test('a well-formed theme validates, is normalised and keeps its seats', () => {
  const r = ot.validateOfficeTheme(good());
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(r.theme.items.length, 3);
  assert.equal(r.theme.items[1].color, '#aabbcc', 'colours are lower-cased');
  assert.deepEqual(r.theme.desks, { 'desk-1': 'Paolo - Jr. Programmer' });
  assert.ok(ot.validateOfficeTheme(JSON.stringify(good())).ok, 'raw text is accepted too');
});

test('the validator refuses anything outside the schema', () => {
  const bad = (mutate, re) => {
    const t = good(); mutate(t);
    const r = ot.validateOfficeTheme(t);
    assert.equal(r.ok, false);
    assert.match(r.errors.join('\n'), re);
  };
  bad((t) => { t.spec = 'devlabs/office-theme@2'; }, /"spec"/);
  bad((t) => { t.script = 'alert(1)'; }, /unknown field "script"/);
  bad((t) => { t.items[0].src = '../../etc/passwd'; }, /unknown field "src"/);
  bad((t) => { t.items[0].type = 'rocket_launcher'; }, /unknown type/);
  bad((t) => { t.items[0].x = 1e9; }, /x and y must be numbers/);
  bad((t) => { t.items[0].x = NaN; }, /x and y must be numbers/);
  bad((t) => { t.items[1].color = 'url(javascript:1)'; }, /color must be #rrggbb/);
  bad((t) => { t.items[1].id = '../x'; }, /id must be/);
  bad((t) => { t.items.push({ ...t.items[1] }); }, /duplicate id/);
  bad((t) => { t.desks = { ghost: 'Nobody' }; }, /not the id of an item/);
  bad((t) => { t.name = 'a\u0000b'; }, /"name"/);
  bad((t) => { t.items = Array.from({ length: ot.OFFICE_THEME_MAX_ITEMS + 1 }, () => ({ type: 'plant', x: 1, y: 1 })); }, /more than/);
  assert.equal(ot.validateOfficeTheme('x'.repeat(ot.OFFICE_THEME_MAX_BYTES + 1)).ok, false, 'oversize text is refused before parsing');
  assert.equal(ot.validateOfficeTheme('{').ok, false);
  assert.equal(ot.validateOfficeTheme([]).ok, false);
});

test('export strips runtime fields and round-trips through the validator', () => {
  const furniture = [
    { _uid: 'fi_1', type: 'wall', x: 0, y: 0, w: 100, h: 10 },
    { _uid: 'fi_2', type: 'chair', x: 5, y: 6, facing: 180, color: '#FF0000', id: 'c1', vertical: true }
  ];
  const theme = ot.officeThemeFromFurniture(furniture, { name: '  Test  ', author: 'me', now: new Date('2026-01-02T03:04:05Z') }, { c1: 'Ana' });
  assert.equal(theme.name, 'Test');
  assert.equal(theme.createdAt, '2026-01-02T03:04:05.000Z');
  assert.ok(!JSON.stringify(theme).includes('_uid'));
  const r = ot.validateOfficeTheme(JSON.parse(JSON.stringify(theme)));
  assert.ok(r.ok, r.errors.join('; '));
  assert.equal(ot.officeThemeFileName('Cosy Corner!!'), 'cosy-corner.office-theme.json');
});

test('the diff reads moves as changes, not as add + remove', () => {
  const before = [{ type: 'desk_cubicle', x: 0, y: 0 }, { type: 'plant', x: 1, y: 1 }, { type: 'plant', x: 2, y: 2 }];
  const after = [{ type: 'desk_cubicle', x: 50, y: 0 }, { type: 'plant', x: 1, y: 1 }, { type: 'jukebox', x: 9, y: 9 }];
  const d = ot.diffOfficeThemes(before, after);
  assert.deepEqual(d, { added: { jukebox: 1 }, removed: { plant: 1 }, changed: 1, before: 3, after: 3 });
});

test('the schema and the AI prompt come from the validator constants', () => {
  const schema = ot.officeThemeJsonSchema();
  assert.deepEqual(schema.properties.items.items.properties.type.enum, [...ot.OFFICE_FURNITURE_TYPES]);
  assert.equal(schema.properties.items.maxItems, ot.OFFICE_THEME_MAX_ITEMS);
  const prompt = ot.officeThemePrompt(good());
  assert.ok(prompt.includes(ot.OFFICE_THEME_SPEC));
  assert.ok(prompt.includes('"desk_cubicle"'), 'the enum is in the prompt');
  assert.ok(prompt.includes('Cosy corner'), 'the current layout rides along as the example');
});

// ── backup + revert (renderer store, pure over a storage-like object) ─────────

const store = loadTs('src/renderer/src/scene/office3d/themeStore.ts');

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

test('applying a theme backs the previous layout up; undo restores it exactly once', () => {
  const ls = memStorage();
  const ns = 'level-2';
  const before = [{ _uid: 'fi_1', type: 'plant', x: 1, y: 1 }];
  ls.setItem(store.furnitureKey(ns), JSON.stringify(before));
  const theme = ot.validateOfficeTheme(good()).theme;

  const applied = store.applyTheme(ls, ns, theme);
  assert.equal(applied.length, 3);
  assert.ok(applied.every((it) => typeof it._uid === 'string' && it._uid), 'imported items get fresh uids');
  assert.ok(!JSON.stringify(applied).includes('"desks"'));
  assert.deepEqual(JSON.parse(ls.getItem(store.furnitureKey(ns))).map((i) => i.type), ['wall', 'desk_cubicle', 'plant']);
  assert.deepEqual(JSON.parse(ls.getItem(store.backupKey(ns))).items, before, 'the previous layout is the backup');
  assert.equal(store.hasBackup(ls, ns), true);

  const restored = store.revertTheme(ls, ns);
  assert.deepEqual(restored, before);
  assert.deepEqual(JSON.parse(ls.getItem(store.furnitureKey(ns))), before);
  assert.equal(store.hasBackup(ls, ns), false, 'one-shot: the backup is consumed');
  assert.equal(store.revertTheme(ls, ns), null);
});

test('a corrupt backup never replaces the layout', () => {
  const ls = memStorage();
  ls.setItem(store.furnitureKey('x'), JSON.stringify([{ _uid: 'a', type: 'plant', x: 0, y: 0 }]));
  ls.setItem(store.backupKey('x'), '{not json');
  assert.equal(store.revertTheme(ls, 'x'), null);
  assert.equal(JSON.parse(ls.getItem(store.furnitureKey('x')))[0].type, 'plant');
});
