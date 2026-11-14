'use strict';
// Ramon's fire queue and registry/floor drift (src/shared/fireRequest.ts).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const fr = loadTs(require.resolve('../src/shared/fireRequest.ts'));

const reg = {
  godId: 'god',
  agents: {
    god: { isGod: true },
    pam: {},
    jim: { archived: true },
    dwight: { archived: false }
  }
};

test('the orchestrator fires an agent named by id, else by file name', () => {
  assert.deepEqual(fr.parseFireRequest({ id: 'pam' }, 'x.json', reg, 'god', 'god'), { ok: true, id: 'pam' });
  assert.deepEqual(fr.parseFireRequest({}, 'pam.json', reg, 'god', 'god'), { ok: true, id: 'pam' });
});

test('a fire-request without the orchestrator token is refused', () => {
  // Every agent can write fire-requests/: an agent firing a colleague, no token,
  // or main not knowing the orchestrator yet all fail.
  assert.equal(fr.parseFireRequest({ id: 'pam' }, 'x.json', reg, 'dwight', 'god').ok, false);
  assert.equal(fr.parseFireRequest({ id: 'pam' }, 'x.json', reg, undefined, 'god').ok, false);
  assert.equal(fr.parseFireRequest({ id: 'pam' }, 'x.json', reg, 'god', null).ok, false);
  // A registry edit naming another agent as god changes nothing: main's id wins.
  const hijacked = { godId: 'dwight', agents: { ...reg.agents } };
  assert.equal(fr.parseFireRequest({ id: 'pam' }, 'x.json', hijacked, 'dwight', 'god').ok, false);
});

test('unknown agents, bad ids and the orchestrator itself are refused', () => {
  assert.equal(fr.parseFireRequest({ id: 'toby' }, 'x.json', reg, 'god', 'god').ok, false);
  assert.equal(fr.parseFireRequest({ id: '../registry' }, 'x.json', reg, 'god', 'god').ok, false);
  assert.equal(fr.parseFireRequest({ id: 'god' }, 'x.json', reg, 'god', 'god').ok, false);
  const cleared = { godId: null, agents: { god: {}, pam: {} } };
  assert.equal(fr.parseFireRequest({ id: 'god' }, 'x.json', cleared, 'god', 'god').ok, false);
});

test('drift: fired agents still on the floor, never a running one or the orchestrator', () => {
  const roster = { agents: [{ id: 'god' }, { id: 'pam' }, { id: 'jim' }], restorable: [{ id: 'dwight' }, { id: 'jim' }] };
  assert.deepEqual(fr.firedStillOnFloor(reg, roster), ['jim']);
  // A registry flip on a live agent does not stop it or archive its card.
  assert.deepEqual(fr.firedStillOnFloor(reg, roster, new Set(['jim'])), []);
  const godFlipped = { godId: null, agents: { god: { archived: true } } };
  assert.deepEqual(fr.firedStillOnFloor(godFlipped, { agents: [{ id: 'god' }] }, new Set(), 'god'), []);
  // Restore Team passes only its restorable list: a fired agent there is skipped.
  assert.deepEqual(fr.firedStillOnFloor({ agents: { dwight: { archived: true } } }, { restorable: [{ id: 'dwight' }] }), ['dwight']);
  assert.deepEqual(fr.firedStillOnFloor(reg, null), []);
});
