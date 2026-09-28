'use strict';

// Deliveries: an agent hands back finished files with a "done" message that
// carries `attachments`; the router snapshots them into <hive>/deliveries/<id>/
// for the human's Deliveries tray. See src/shared/delivery.ts.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const {
  safeFileName, uniqueName, deliveryKind, canOpenWithSystemApp, normalizeAttachments, isDeliveryId
} = loadTs('src/shared/delivery.ts');

async function floor(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-deliver-'));
  const project = fs.mkdtempSync(path.join(os.tmpdir(), 'md-project-'));
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'md-elsewhere-'));
  t.after(() => { for (const d of [home, project, elsewhere]) fs.rmSync(d, { recursive: true, force: true }); });
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Ramon', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'pam-1', name: 'Pam', provider: 'claude', cwd: project });
  const outbox = path.join(home, 'hive', 'agents', 'pam-1', 'outbox');
  const post = (msg) => { fs.writeFileSync(path.join(outbox, `${Date.now()}-${Math.random()}.json`), JSON.stringify(msg)); hive.routeOnce(); };
  return { home, project, elsewhere, hive, post };
}

test('an agent delivers a file: snapshot in the tray, god told where it is', async (t) => {
  const { project, hive, post } = await floor(t);
  fs.mkdirSync(path.join(project, 'out'));
  fs.writeFileSync(path.join(project, 'out', 'landing.html'), '<h1>v1</h1>');

  post({ to: 'human', act: 'done', subject: 'Landing page', body: 'Draft one.', attachments: ['out/landing.html'] });

  const [d] = hive.deliveries();
  assert.ok(d, 'a delivery is recorded');
  assert.equal(d.from, 'pam-1');
  assert.equal(d.to, 'human');
  assert.equal(d.status, 'new');
  assert.deepEqual(d.files.map((f) => [f.name, f.kind]), [['landing.html', 'html']]);
  assert.equal(d.note, 'Draft one.');

  // Snapshot: editing the original later does not change what was delivered.
  fs.writeFileSync(path.join(project, 'out', 'landing.html'), '<h1>v2</h1>');
  const read = hive.readDeliveryFile(d.id, 'landing.html');
  assert.equal(read.ok, true);
  assert.equal(read.text, '<h1>v1</h1>');

  // "to": "human" reaches god, pointing at the snapshot.
  const [mail] = hive.inbox('god-1');
  assert.match(mail.body, /Deliveries tray/);
  assert.equal(mail.attachments.length, 1);
  assert.ok(mail.attachments[0].includes(path.join('hive', 'deliveries', d.id)));
});

test('files outside the agent folders, symlinks and folders are refused and reported', async (t) => {
  const { project, elsewhere, hive, post } = await floor(t);
  fs.writeFileSync(path.join(elsewhere, 'secret.txt'), 'nope');
  fs.symlinkSync(path.join(elsewhere, 'secret.txt'), path.join(project, 'link.txt'));
  fs.mkdirSync(path.join(project, 'dir'));
  fs.writeFileSync(path.join(project, 'ok.md'), '# fine');

  post({ to: 'god', act: 'done', subject: 'Mixed', attachments: [path.join(elsewhere, 'secret.txt'), 'link.txt', 'dir', 'missing.pdf', 'ok.md', '../' + path.basename(elsewhere) + '/secret.txt'] });

  const [d] = hive.deliveries();
  assert.deepEqual(d.files.map((f) => f.name), ['ok.md']);
  const reasons = Object.fromEntries(d.skipped.map((s) => [s.path, s.reason]));
  assert.equal(reasons[path.join(elsewhere, 'secret.txt')], 'outside-workspace');
  assert.equal(reasons['link.txt'], 'symlink');
  assert.equal(reasons.dir, 'not-a-file');
  assert.equal(reasons['missing.pdf'], 'not-found');
  assert.equal(reasons['../' + path.basename(elsewhere) + '/secret.txt'], 'outside-workspace');
  assert.match(hive.inbox('god-1')[0].body, /Not delivered:/);
});

test('a message whose attachments all fail still routes, with no empty delivery', async (t) => {
  const { hive, post } = await floor(t);
  post({ to: 'god', act: 'done', subject: 'Nothing real', body: 'see file', attachments: ['nope.html'] });
  assert.equal(hive.deliveries().length, 0);
  const [mail] = hive.inbox('god-1');
  assert.match(mail.body, /nope\.html \(not-found\)/);
  assert.deepEqual(mail.attachments, []);
});

test('same file names are de-duplicated; images preview as data URLs', async (t) => {
  const { project, hive, post } = await floor(t);
  fs.mkdirSync(path.join(project, 'a'));
  fs.mkdirSync(path.join(project, 'b'));
  fs.writeFileSync(path.join(project, 'a', 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  fs.writeFileSync(path.join(project, 'b', 'shot.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  post({ to: 'human', act: 'done', subject: 'Screens', attachments: ['a/shot.png', 'b/shot.png'] });
  const [d] = hive.deliveries();
  assert.deepEqual(d.files.map((f) => f.name), ['shot.png', 'shot-2.png']);
  const img = hive.readDeliveryFile(d.id, 'shot-2.png');
  assert.match(img.dataUrl, /^data:image\/png;base64,/);
});

test('review status: seen never downgrades approved or changes; feedback is kept', async (t) => {
  const { project, hive, post } = await floor(t);
  fs.writeFileSync(path.join(project, 'r.md'), 'x');
  post({ to: 'human', act: 'done', subject: 'Report', attachments: ['r.md'] });
  const { id } = hive.deliveries()[0];
  assert.equal(hive.setDeliveryStatus(id, 'seen').status, 'seen');
  const changed = hive.setDeliveryStatus(id, 'changes', 'Shorter intro please');
  assert.equal(changed.status, 'changes');
  assert.equal(changed.feedback, 'Shorter intro please');
  assert.equal(hive.setDeliveryStatus(id, 'seen').status, 'changes');
  assert.equal(hive.setDeliveryStatus(id, 'approved').status, 'approved');
  assert.equal(hive.setDeliveryStatus('../evil', 'approved'), null);
});

test('only files named in the manifest can be read', async (t) => {
  const { home, project, hive, post } = await floor(t);
  fs.writeFileSync(path.join(project, 'r.md'), 'x');
  post({ to: 'human', act: 'done', subject: 'Report', attachments: ['r.md'] });
  const { id } = hive.deliveries()[0];
  assert.equal(hive.deliveryFilePath(id, 'delivery.json'), null);
  assert.equal(hive.deliveryFilePath(id, '../../registry.json'), null);
  assert.equal(hive.deliveryFilePath('..', 'registry.json'), null);
  assert.ok(hive.deliveryFilePath(id, 'r.md'));
  assert.match(fs.readFileSync(path.join(home, 'hive', '.gitignore'), 'utf8'), /^deliveries\/$/m);
});

test('shared helpers: names, kinds, what may be opened', () => {
  assert.equal(safeFileName('../../etc/passwd'), 'passwd');
  assert.equal(safeFileName('..hidden'), 'hidden');
  assert.equal(safeFileName('a\u0000b<c>.md'), 'a_b_c_.md');
  assert.equal(safeFileName(''), 'file');
  assert.equal(uniqueName('x.md', new Set(['x.md', 'x-2.md'])), 'x-3.md');
  assert.equal(deliveryKind('Report.DOCX'), 'word');
  assert.equal(deliveryKind('page.htm'), 'html');
  assert.equal(deliveryKind('tool.exe'), 'other');
  for (const bad of ['setup.exe', 'app.dmg', 'run.sh', 'x.command', 'y.desktop', 'z.bat', 'noext']) {
    assert.equal(canOpenWithSystemApp(bad), false, bad);
  }
  for (const good of ['a.html', 'b.md', 'c.pdf', 'd.docx', 'e.png', 'f.xlsx', 'g.pptx']) {
    assert.equal(canOpenWithSystemApp(good), true, good);
  }
  assert.deepEqual(normalizeAttachments('one.md'), ['one.md']);
  assert.deepEqual(normalizeAttachments(['a', ' a ', 3, '', 'b']), ['a', 'b']);
  assert.equal(isDeliveryId('2026-09-28T05-00-00-000Z-abc123'), true);
  assert.equal(isDeliveryId('../x'), false);
  assert.equal(isDeliveryId('.hidden'), false);
});
