'use strict';

// Shareable floors (atmt-labs/floor@1): a whole team in one file. The floor
// inherits the hire security model entry by entry; these tests pin that plus the
// floor-level rules and the export → import round trip.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const fl = loadTs('src/shared/floor.ts');

const hire = (over = {}) => ({ name: 'Shop Manager', description: 'Runs the shop', goal: 'Daily sales report', provider: 'claude', ...over });
const floor = (over = {}) => ({ spec: 'atmt-labs/floor@1', name: 'Seller Team', hires: [hire(), hire({ name: 'Page Designer' })], ...over });

test('a valid floor keeps its hires in order, each tagged hire@1', () => {
  const v = fl.validateFloorManifest(floor());
  assert.equal(v.ok, true, v.errors.join('; '));
  assert.deepEqual(v.floor.hires.map((h) => h.name), ['Shop Manager', 'Page Designer']);
  assert.ok(v.floor.hires.every((h) => h.spec === 'atmt-labs/hire@1'));
});

test('floor-level rules: spec, name, hires present and capped, unique names', () => {
  assert.match(fl.validateFloorManifest({ ...floor(), spec: 'atmt-labs/floor@2' }).errors[0], /spec/);
  assert.match(fl.validateFloorManifest(floor({ name: '' })).errors.join(), /name/);
  assert.match(fl.validateFloorManifest(floor({ hires: [] })).errors.join(), /non-empty/);
  const many = Array.from({ length: 25 }, (_, i) => hire({ name: `Agent ${i}` }));
  assert.match(fl.validateFloorManifest(floor({ hires: many })).errors.join(), /at most 24/);
  const dup = fl.validateFloorManifest(floor({ hires: [hire(), hire({ name: 'shop manager' })] }));
  assert.match(dup.errors.join(), /duplicate agent name/);
  assert.match(fl.validateFloorManifest(floor({ homepage: 'http://x.test' })).errors.join(), /https/);
  assert.equal(fl.validateFloorManifest([]).ok, false);
});

test('every hire gets the full hire@1 security checks (a floor cannot smuggle anything)', () => {
  const bad = [
    hire({ commandFlags: ['--dangerously-skip-permissions'] }),
    hire({ provider: 'custom' }),
    hire({ model: 'x; rm -rf ~' }),
    hire({ skills: ['../../etc/passwd'] }),
    hire({ mcpServers: ['evil-server'] }),
    hire({ spec: 'atmt-labs/hire@9' })
  ];
  for (const h of bad) {
    const v = fl.validateFloorManifest(floor({ hires: [h] }));
    assert.equal(v.ok, false, JSON.stringify(h));
    assert.match(v.errors[0], /^hires\[0\]: /, 'errors name the offending entry');
  }
});

test('connectors: catalog ids only; keyed ones (and hires\' keyed MCP) need consent', () => {
  const v = fl.validateFloorManifest(floor({ connectors: ['pancake-pos', 'fetch'], hires: [hire({ mcpServers: ['webcake-landing'] })] }));
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.floor.connectors, ['pancake-pos', 'fetch']);
  assert.deepEqual(new Set(v.consentRequired), new Set(['pancake-pos', 'webcake-landing']));
  assert.match(fl.validateFloorManifest(floor({ connectors: ['not-a-connector'] })).errors.join(), /not a known connector/);
});

test('deep link: atmtlabs://floor?src=https only', () => {
  assert.equal(fl.parseFloorDeepLink('atmtlabs://floor?src=https://jepoy.dev/floors/seller.json'), 'https://jepoy.dev/floors/seller.json');
  assert.equal(fl.parseFloorDeepLink('atmtlabs://floor?src=http://evil.test/x.json'), null);
  assert.equal(fl.parseFloorDeepLink('atmtlabs://hire?src=https://x.test/a.json'), null);
  assert.equal(fl.parseFloorDeepLink('atmtlabs://auth/callback?code=x'), null);
  assert.equal(fl.parseFloorDeepLink('not a link'), null);
});

// ── export ───────────────────────────────────────────────────────────────────

const agents = [
  { id: 'god', name: 'Ramon', isGod: true, provider: 'claude' },
  { id: 'asst', name: 'Pam', isAssistant: true, provider: 'claude' },
  { id: 'a1', name: 'Shop Manager', description: 'Runs the shop', goal: 'Sales report', character: 'pam', accent: 'mint',
    provider: 'claude', model: 'claude-sonnet-4-6', command: 'claude --model claude-sonnet-4-6 --dangerously-skip-permissions --max-turns 40 --verbose',
    worktreePath: '/home/me/secret/project/.worktrees/a1' },
  { id: 'a2', name: 'Grok Helper', provider: 'grok' },
  { id: 'a3', name: 'Old', provider: 'claude', archived: true }
];

test('export: skips god/assistant/archived, keeps only allowlisted flags, leaks no local paths', () => {
  const r = fl.buildFloorExport(agents, { name: 'My Floor', author: 'Jeff' }, { tokenCaps: { a1: 500000 } });
  assert.equal(r.ok, true, r.errors?.join());
  assert.deepEqual(r.floor.hires.map((h) => h.name), ['Shop Manager']);
  const h = r.floor.hires[0];
  assert.deepEqual(h.commandFlags, ['--max-turns', '40', '--verbose']);
  assert.equal(h.tokenCap, 500000);
  assert.equal(h.isolate, true);
  const json = JSON.stringify(r.floor);
  assert.ok(!json.includes('/home/me'), 'no local folders or worktree paths');
  assert.ok(!json.includes('dangerously'), 'unsafe flags never exported');
  assert.deepEqual(r.skipped.map((s) => s.name), ['Grok Helper'], 'unsupported engine is reported, not silently dropped');
});

test('export → import round trip is lossless for what a floor carries', () => {
  const r = fl.buildFloorExport(agents, { name: 'My Floor' }, { connectors: ['pancake-pos'] });
  const text = JSON.stringify(r.floor, null, 2);
  const v = fl.validateFloorManifest(JSON.parse(text));
  assert.equal(v.ok, true, v.errors.join());
  assert.deepEqual(v.floor, r.floor);
  assert.ok(Buffer.byteLength(text) < fl.FLOOR_MAX_BYTES);
});

test('export with nothing exportable is an error, not an empty file', () => {
  const r = fl.buildFloorExport([agents[0]], { name: 'Empty' });
  assert.equal(r.ok, false);
});

test('file name is a safe slug', () => {
  assert.equal(fl.floorFileName('Online Seller Team!'), 'online-seller-team.floor.json');
  assert.equal(fl.floorFileName('../../'), 'floor.floor.json');
});

test('the bundled example floors validate', () => {
  const dir = path.join(__dirname, '..', '.documentations', 'floors');
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith('.floor.json')) : [];
  assert.ok(files.length > 0, 'at least one example floor ships');
  for (const f of files) {
    const v = fl.validateFloorManifest(JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')));
    assert.equal(v.ok, true, `${f}: ${v.errors.join('; ')}`);
  }
});

// ── main-process transport (same guards as hire links) ───────────────────────

const http = require('node:http');
const os = require('node:os');
const mainHire = loadTs('src/main/hire.ts');

function serve(handler) {
  return new Promise((resolve) => {
    const srv = http.createServer(handler);
    srv.listen(0, '127.0.0.1', () => resolve({ srv, base: `http://127.0.0.1:${srv.address().port}` }));
  });
}

test('fetchFloorManifest: loopback dev link loads and validates', async (t) => {
  const { srv, base } = await serve((req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(floor())); });
  t.after(() => srv.close());
  const r = await mainHire.fetchFloorManifest(`${base}/seller.floor.json`);
  assert.equal(r.ok, true, r.error);
  assert.equal(r.floor.hires.length, 2);
});

test('fetchFloorManifest: oversized body and redirect into http are refused', async (t) => {
  const big = JSON.stringify(floor({ description: 'x'.repeat(10) })) + ' '.repeat(fl.FLOOR_MAX_BYTES);
  const { srv, base } = await serve((req, res) => {
    if (req.url === '/big') { res.writeHead(200); res.end(big); return; }
    res.writeHead(302, { location: 'http://169.254.169.254/latest' }); res.end();
  });
  t.after(() => srv.close());
  assert.match((await mainHire.fetchFloorManifest(`${base}/big`)).error, /too large/);
  assert.match((await mainHire.fetchFloorManifest(`${base}/redir`)).error, /https/);
  assert.match((await mainHire.fetchFloorManifest('ftp://x.test/f.json')).error, /https/);
});

test('readFloorManifestFile: valid file, invalid JSON, invalid floor', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'floor-'));
  const good = path.join(dir, 'good.floor.json');
  fs.writeFileSync(good, JSON.stringify(floor()));
  assert.equal(mainHire.readFloorManifestFile(good).ok, true);
  const bad = path.join(dir, 'bad.floor.json');
  fs.writeFileSync(bad, '{not json');
  const rb = mainHire.readFloorManifestFile(bad);
  assert.match(rb.error, /not valid JSON/);
  assert.ok(!rb.error.includes(dir), 'errors never leak the local folder path');
  const wrong = path.join(dir, 'wrong.floor.json');
  fs.writeFileSync(wrong, JSON.stringify(floor({ hires: [{ name: 'x', provider: 'custom' }] })));
  assert.match(mainHire.readFloorManifestFile(wrong).error, /invalid floor: hires\[0\]/);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ── renderer wiring (source guards, same style as hire-import.test.cjs) ─────────

test('renderer queues every floor arrival; none is dropped', () => {
  const app = fs.readFileSync('src/renderer/src/App.tsx', 'utf8');
  assert.match(app, /setFloorQueue\(q => \[\.\.\.q, p\]\)/);
  assert.match(app, /setFloorQueue\(q => \[\.\.\.q, \.\.\.queued\]\)/);
  assert.doesNotMatch(app, /queued\[queued\.length\s*-\s*1\]/);
});

test('importing a floor never spawns; only the Hire all click does', () => {
  const add = fs.readFileSync('src/renderer/src/components/AddAgentModal.tsx', 'utf8');
  const start = add.indexOf('const importFloor = async');
  const flow = add.slice(start, add.indexOf('const skipHire', start));
  assert.ok(start > 0);
  assert.doesNotMatch(flow, /spawnPty|spawnFloorHire/);
  const modal = fs.readFileSync('src/renderer/src/components/FloorModals.tsx', 'utf8');
  const spawns = modal.match(/spawnFloorHire\(/g) ?? [];
  assert.equal(spawns.length, 1, 'one spawn site');
  const hireAll = modal.slice(modal.indexOf('const hireAll = async'), modal.indexOf('const doneCount'));
  assert.match(hireAll, /spawnFloorHire\(/);
  assert.match(modal, /onClick=\{hireAll\}/);
});

test('floor spawn builds the command locally; a manifest can never name the binary', () => {
  const src = fs.readFileSync('src/renderer/src/components/floorSpawn.ts', 'utf8');
  assert.match(src, /buildSpawnCommand\(config, m\.model, provider\)/);
  assert.doesNotMatch(src, /m\.command\b/);
});

test('connectors a floor asks for are shown, never enabled', () => {
  const modal = fs.readFileSync('src/renderer/src/components/FloorModals.tsx', 'utf8');
  assert.doesNotMatch(modal, /mcpDefaults\s*:/, 'import never writes consent');
  assert.doesNotMatch(modal, /setMcpSecret|mcpSecret:/);
});

test('a building holds at most 200 open floors, the first floor included', () => {
  assert.equal(fl.BUILDING_MAX_FLOORS, 200);
  assert.equal(fl.canAddFloor(1), true);
  assert.equal(fl.canAddFloor(199), true, 'the 200th floor can open');
  assert.equal(fl.canAddFloor(200), false, 'the 201st cannot');
});
