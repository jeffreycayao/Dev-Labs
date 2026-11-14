'use strict';
// Ramon's fire queue and registry/floor drift (src/shared/fireRequest.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const fr = loadTs(require.resolve('../src/shared/fireRequest.ts'));

const reg = {
  godId: 'ramon',
  agents: {
    ramon: { isGod: true },
    pam: {},
    jim: { archived: true },
    dwight: { archived: false }
  }
};

test('a fire-request names its agent by id, else by file name', () => {
  assert.deepEqual(fr.parseFireRequest({ id: 'pam' }, 'x.json', reg), { ok: true, id: 'pam' });
  assert.deepEqual(fr.parseFireRequest({}, 'pam.json', reg), { ok: true, id: 'pam' });
  assert.deepEqual(fr.parseFireRequest(null, 'pam.json', reg), { ok: true, id: 'pam' });
});

test('a fire-request is refused for unknown agents, bad ids and the orchestrator', () => {
  assert.equal(fr.parseFireRequest({ id: 'toby' }, 'x.json', reg).ok, false);
  assert.equal(fr.parseFireRequest({ id: '../registry' }, 'x.json', reg).ok, false);
  assert.equal(fr.parseFireRequest({ id: 'ramon' }, 'x.json', reg).ok, false);
  const isGodOnly = { godId: null, agents: { boss: { isGod: true } } };
  assert.equal(fr.parseFireRequest({ id: 'boss' }, 'x.json', isGodOnly).ok, false);
});

test('drift: registry-fired agents still on the floor or waiting to be restored', () => {
  const roster = { agents: [{ id: 'ramon' }, { id: 'pam' }, { id: 'jim' }], restorable: [{ id: 'dwight' }, { id: 'jim' }] };
  assert.deepEqual(fr.firedStillOnFloor(reg, roster), ['jim']);
  // Restore Team passes only its restorable list: a fired agent there is skipped.
  assert.deepEqual(fr.firedStillOnFloor({ godId: null, agents: { dwight: { archived: true } } }, { restorable: [{ id: 'dwight' }] }), ['dwight']);
  assert.deepEqual(fr.firedStillOnFloor(reg, null), []);
  assert.deepEqual(fr.firedStillOnFloor({ godId: 'ramon', agents: { ramon: { archived: true } } }, { agents: [{ id: 'ramon' }] }), []);
});
