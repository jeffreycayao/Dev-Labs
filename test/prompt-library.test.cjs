// Prompt Library (src/shared/promptLibrary.ts): role → category mapping for
// template and free-text roles, and library integrity.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { roleCategoryFor, promptsFor, firstPlaceholder, PROMPTS, PROMPT_CATEGORIES } = loadTs('src/shared/promptLibrary.ts');
const { AGENT_TEMPLATES } = loadTs('src/shared/agentTemplates.ts');

const EXPECTED = {
  'jr-programmer': 'engineering', 'sr-programmer': 'engineering', 'qa-tester': 'engineering',
  'devops-engineer': 'engineering', 'tech-writer': 'engineering', 'security-auditor': 'security',
  'scrum-master': 'operations', 'launch-marketer': 'marketing', 'marketing-executive': 'marketing',
  'social-media': 'marketing', 'content-writer': 'marketing', 'customer-support': 'support',
  'sales-researcher': 'sales', 'market-researcher': 'research', 'operations-admin': 'operations',
  'hr-recruitment': 'hr', 'finance-bookkeeper': 'finance'
};

test('every role template maps to its intended category', () => {
  for (const tpl of AGENT_TEMPLATES) {
    const got = roleCategoryFor({ name: tpl.manifest.name, description: tpl.manifest.description });
    assert.equal(got, EXPECTED[tpl.id], tpl.id);
  }
});

test('free-text roles are classified by keywords', () => {
  const cases = [
    ['feature suggester for the chrome extension, writes specs and code', 'engineering'],
    ['Facebook ads and TikTok content', 'marketing'],
    ['answers customer tickets', 'support'],
    ['virtual assistant for the owner', 'operations'],
    ['payroll and BIR prep helper', 'finance'],
    ['penetration testing / vulnerability hunter', 'security'],
    ['recruitment of riders', 'hr'],
    ['competitor research', 'research'],
    ['finds B2B leads for outreach', 'sales'],
    ["Scrum master + feature strategist for the team's WXT Chrome extensions — verifies existing features, writes implementable specs, runs backlog and sprints for coder agents.", 'operations'],
    ['a fresh harness', 'general']
  ];
  for (const [description, want] of cases) assert.equal(roleCategoryFor({ description }), want, description);
});

test('the boss is always management', () => {
  assert.equal(roleCategoryFor({ name: 'Ramon', description: 'orchestrator (god)', isGod: true }), 'management');
  assert.equal(roleCategoryFor({ description: 'Marketing Executive', isGod: true }), 'management');
});

test('library integrity: unique ids, known categories, general appended', () => {
  const ids = PROMPTS.map((x) => x.id);
  assert.equal(new Set(ids).size, ids.length);
  const cats = new Set(PROMPT_CATEGORIES.map((c) => c.id));
  for (const x of PROMPTS) assert.ok(cats.has(x.category), x.id);
  for (const c of cats) assert.ok(promptsFor(c).length >= 4, c);
  assert.ok(promptsFor('marketing').some((x) => x.category === 'general'));
});

test('firstPlaceholder finds the first {slot}', () => {
  assert.deepEqual(firstPlaceholder('Goal: {what}. By {when}'), { start: 6, end: 12 });
  assert.equal(firstPlaceholder('no slots'), null);
});
