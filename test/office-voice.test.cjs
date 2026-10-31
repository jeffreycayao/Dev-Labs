'use strict';

// Spoken agent replies (ElevenLabs): prefs validation, key shape, what gets said aloud,
// and that only NEW replies are spoken (never old text on mount or reconnect).

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const cat = loadTs('src/shared/office/voiceCatalog.ts');
const txt = loadTs('src/shared/office/voiceText.ts');

test('prefs from untrusted input are coerced to safe values', () => {
  assert.deepEqual(cat.normalizeVoicePrefs(null), cat.DEFAULT_VOICE_PREFS);
  const p = cat.normalizeVoicePrefs({ enabled: 'yes', voiceId: '../../evil', speed: 9 });
  assert.equal(p.enabled, false);
  assert.equal(p.voiceId, cat.DEFAULT_VOICE_ID);
  assert.equal(p.speed, cat.MAX_SPEED);
  assert.equal(cat.clampSpeed(NaN), 1);
  assert.equal(cat.clampSpeed(0.1), cat.MIN_SPEED);
});

test('a partial patch keeps the other saved prefs', () => {
  const base = { enabled: true, voiceId: 'EXAVITQu4vr4xnSDxMaL', speed: 0.9 };
  assert.deepEqual(cat.normalizeVoicePrefs({ speed: 1.1 }, base), { ...base, speed: 1.1 });
});

test('every catalog voice id passes validation', () => {
  for (const v of cat.VOICE_CATALOG) assert.ok(cat.isVoiceId(v.id), v.label);
  assert.equal(cat.isVoiceId('a/b'), false);
});

test('api key shape check trims and rejects junk', () => {
  assert.equal(cat.cleanApiKey('  sk_' + 'a'.repeat(30) + '\n'), 'sk_' + 'a'.repeat(30));
  assert.equal(cat.cleanApiKey('short'), null);
  assert.equal(cat.cleanApiKey('has space ' + 'a'.repeat(30)), null);
  assert.equal(cat.cleanApiKey(42), null);
});

test('speakable text keeps two sentences and drops code and markdown', () => {
  const s = txt.speakableText('## Done!\nI fixed **the bug**. Tests pass. Then I refactored.\n```js\nx()\n```');
  assert.equal(s, 'Done! I fixed the bug.');
  assert.equal(txt.speakableText('See https://example.com for more'), 'See a link for more');
  assert.equal(txt.speakableText('```only code```'), '');
  assert.equal(txt.speakableText(undefined), '');
});

test('speakable text is capped in length', () => {
  const s = txt.speakableText('word '.repeat(200), 2, 50);
  assert.ok(s.length <= 51, s.length);
  assert.ok(s.endsWith('…'));
});

test('first pass never speaks; later only new replies are spoken', () => {
  const first = txt.pickNewReplies(null, [{ id: 'a', recentAssistantText: 'old', recentTextTs: 1 }]);
  assert.deepEqual(first.fresh, []);
  const second = txt.pickNewReplies(first.seen, [
    { id: 'a', recentAssistantText: 'new one', recentTextTs: 2 },
    { id: 'b', recentTextTs: 3 } // spawned, no text yet
  ]);
  assert.deepEqual(second.fresh, ['new one']);
  const same = txt.pickNewReplies(second.seen, [{ id: 'a', recentAssistantText: 'new one', recentTextTs: 2 }]);
  assert.deepEqual(same.fresh, []);
});

test('a reconnect that bumps the timestamp but keeps old text is not replayed', () => {
  const seen = txt.pickNewReplies(null, [{ id: 'a', recentAssistantText: 'hello', recentTextTs: 1 }]).seen;
  assert.deepEqual(txt.pickNewReplies(seen, [{ id: 'a', recentAssistantText: 'hello', recentTextTs: 9 }]).fresh, []);
});
