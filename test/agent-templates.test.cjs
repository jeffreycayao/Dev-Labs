// Built-in role templates (src/shared/agentTemplates.ts) must be valid hire
// manifests: they go through the same review path as an imported hire.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { AGENT_TEMPLATES, templatesFor } = loadTs('src/shared/agentTemplates.ts');
const { validateHireManifest } = loadTs('src/shared/hire.ts');

test('every template passes hire validation', () => {
  for (const tpl of AGENT_TEMPLATES) {
    const res = validateHireManifest(tpl.manifest);
    assert.ok(res.ok, `${tpl.id}: ${JSON.stringify(res.errors ?? res.error ?? res)}`);
  }
});

test('both tracks are populated and ids are unique', () => {
  assert.ok(templatesFor('technical').length >= 5);
  assert.ok(templatesFor('non-technical').length >= 5);
  const ids = AGENT_TEMPLATES.map((t) => t.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('templates leave the engine to the user default', () => {
  for (const tpl of AGENT_TEMPLATES) {
    assert.equal(tpl.manifest.provider, undefined, tpl.id);
    assert.equal(tpl.manifest.model, undefined, tpl.id);
  }
});
