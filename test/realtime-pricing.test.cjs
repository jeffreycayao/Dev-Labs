'use strict';
/** Voice spend-cap money math: OpenAI realtime usage and Gemini Live usageMetadata. */
const test = require('node:test');
const assert = require('node:assert');
const loadTs = require('./load-ts.cjs');

const p = loadTs('src/shared/realtimePricing.ts');
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);

test('OpenAI usage: either casing, priced at the audio rates', () => {
  assert.deepEqual(p.normalizeRealtimeUsage({ input_tokens: 1000, output_tokens: 500 }), { inputTokens: 1000, outputTokens: 500 });
  assert.deepEqual(p.normalizeRealtimeUsage({ inputTokens: 7, outputTokens: 3 }), { inputTokens: 7, outputTokens: 3 });
  close(p.computeRealtimeUsd({ input_tokens: 1_000_000, output_tokens: 1_000_000 }), 32 + 64);
  assert.equal(p.computeRealtimeUsd(null), 0);
  assert.equal(p.computeRealtimeUsd({ input_tokens: -5, output_tokens: NaN }), 0);
});

test('Gemini usageMetadata: thinking bills as output, tool-use prompt as input', () => {
  const u = { promptTokenCount: 900, toolUsePromptTokenCount: 100, responseTokenCount: 400, thoughtsTokenCount: 100, totalTokenCount: 1500 };
  assert.deepEqual(p.normalizeRealtimeUsage(u), { inputTokens: 1000, outputTokens: 500 });
  assert.deepEqual(p.normalizeRealtimeUsage({ promptTokenCount: 10 }), { inputTokens: 10, outputTokens: 0 });
});

test('Gemini usage is priced at the Gemini rates, not OpenAI', () => {
  const u = { promptTokenCount: 1_000_000, responseTokenCount: 1_000_000 };
  close(p.computeRealtimeUsd(u, 'google'), p.GEMINI_LIVE_INPUT_PER_MTOK + p.GEMINI_LIVE_OUTPUT_PER_MTOK);
  assert.ok(p.computeRealtimeUsd(u, 'google') > 0);
  close(p.computeRealtimeUsd(u), 32 + 64); // default provider stays OpenAI
});
