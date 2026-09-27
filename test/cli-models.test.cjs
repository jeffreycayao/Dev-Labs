// Live CLI model discovery (src/main/cliModels.ts): `opencode models` output →
// picker entries. Z.AI Coding Plan GLM models must surface; OpenRouter is
// limited to the z-ai family; noise lines are ignored.
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseOpencodeModels, toOpencodeEntries } = loadTs('src/main/cliModels.ts');

const SAMPLE = [
  '',
  'opencode/grok-code',
  'openrouter/anthropic/claude-sonnet-4.5',
  'openrouter/z-ai/glm-4.6',
  'openrouter/~z-ai/glm-latest',
  'zai-coding-plan/glm-5.3',
  'zai-coding-plan/glm-4.7',
  'zai-coding-plan/glm-5.3',
  'Warning: something unrelated',
].join('\r\n');

test('parses provider/model slugs, dedupes, skips noise', () => {
  assert.deepEqual(parseOpencodeModels(SAMPLE), [
    'opencode/grok-code',
    'openrouter/anthropic/claude-sonnet-4.5',
    'openrouter/z-ai/glm-4.6',
    'openrouter/~z-ai/glm-latest',
    'zai-coding-plan/glm-5.3',
    'zai-coding-plan/glm-4.7',
  ]);
});

test('direct providers first with friendly labels; OpenRouter only z-ai', () => {
  const entries = toOpencodeEntries(parseOpencodeModels(SAMPLE));
  assert.deepEqual(entries.map((e) => e.id), [
    'opencode/grok-code',
    'zai-coding-plan/glm-5.3',
    'zai-coding-plan/glm-4.7',
    'openrouter/z-ai/glm-4.6',
  ]);
  assert.equal(entries[1].label, 'glm-5.3 (Z.ai Coding Plan)');
  assert.equal(entries[3].label, 'glm-4.6 (OpenRouter)');
});

test('empty or garbage output yields no entries', () => {
  assert.deepEqual(toOpencodeEntries(parseOpencodeModels('')), []);
  assert.deepEqual(toOpencodeEntries(parseOpencodeModels('command not found')), []);
});
