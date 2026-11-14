'use strict';

/*
 * Gemini Live voice provider: tool-declaration mapping, provider choice, PCM
 * helpers, and that the Google key never reaches renderer-visible config or the
 * token the renderer gets back.
 */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Module = require('node:module');
const loadTs = require('./load-ts.cjs');

const ROOT = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

// Electron stand-in (config/integrations read userData + encrypt with safeStorage).
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-gemini-'));
const electron = require.resolve('electron');
const handlers = new Map();
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s, 'utf8'),
      decryptString: (b) => b.toString('utf8')
    }
  }
};
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

// The renderer tool modules import `tool` from the OpenAI SDK; `tool(o) => o`
// hands back the raw spec (name/description/parameters/execute) for inspection.
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === '@openai/agents-realtime') return { tool: (o) => o };
  return origLoad.call(this, request, ...rest);
};
const { realtimeActionTools } = loadTs('src/renderer/src/realtime/actions.ts');
const { realtimeReadTools } = loadTs('src/renderer/src/realtime/tools.ts');
Module._load = origLoad;

const g = loadTs('src/shared/geminiLive.ts');

/** Verb keys of the main-process action spine (VERBS in realtimeActions.ts). */
function mainVerbs() {
  const src = read('src/main/realtimeActions.ts');
  const block = src.slice(src.indexOf('const VERBS'), src.indexOf('};', src.indexOf('const VERBS')));
  return [...block.matchAll(/^\s+([a-z_]+): \{ tier:/gm)].map((m) => m[1]);
}

/** Run every action tool's execute with a stub bridge; map verb → tool name. */
async function verbToTool(tools) {
  const out = new Map();
  for (const t of tools) {
    let seen = null;
    global.window = { cth: { realtimeAction: async (p) => { seen = p.verb; return { ok: true, spoken: '' }; },
      realtimeActionConfirm: async () => ({ ok: true, spoken: '' }), realtimeActionCancel: async () => ({ ok: true, spoken: '' }),
      realtimeWaitFor: async () => ({ ok: true }) } };
    try { await t.execute({}); } catch { /* some tools need args; the verb is captured first */ }
    if (seen) out.set(seen, t.name);
  }
  delete global.window;
  return out;
}

test('every main-process action verb has a Gemini declaration with the same parameters', async () => {
  const tools = realtimeActionTools();
  const decls = new Map(g.toGeminiDeclarations(tools).map((d) => [d.name, d]));
  const byVerb = await verbToTool(tools);
  const verbs = mainVerbs();
  assert.ok(verbs.length >= 19, `parsed ${verbs.length} verbs`);
  for (const verb of verbs) {
    const name = byVerb.get(verb);
    assert.ok(name, `no voice tool sends verb "${verb}"`);
    const tool = tools.find((t) => t.name === name);
    const decl = decls.get(name);
    assert.ok(decl, `no Gemini declaration for ${name}`);
    const props = Object.keys(tool.parameters.properties || {});
    assert.deepStrictEqual(Object.keys(decl.parameters?.properties || {}), props, `${name} properties`);
    assert.deepStrictEqual(decl.parameters?.required || [], tool.parameters.required || [], `${name} required`);
    for (const p of props) {
      assert.strictEqual(decl.parameters.properties[p].type, String(tool.parameters.properties[p].type).toUpperCase(), `${name}.${p} type`);
    }
  }
});

test('every voice tool (read + action) maps 1:1 to a Gemini declaration', () => {
  const tools = [...realtimeReadTools(), ...realtimeActionTools()];
  const decls = g.toGeminiDeclarations(tools);
  assert.deepStrictEqual(decls.map((d) => d.name), tools.map((t) => t.name));
  const json = JSON.stringify(decls);
  assert.ok(!json.includes('additionalProperties'), 'Gemini rejects additionalProperties');
  for (const d of decls) {
    if (d.parameters) assert.strictEqual(d.parameters.type, 'OBJECT');
  }
});

test('toGeminiSchema keeps enums, items and nullable; drops unknown keys', () => {
  const s = g.toGeminiSchema({
    type: 'object', additionalProperties: false,
    properties: { a: { type: ['string', 'null'], enum: ['x', 'y'] }, b: { type: 'array', items: { type: 'number' } } },
    required: ['a']
  });
  assert.deepStrictEqual(s, {
    type: 'OBJECT',
    properties: { a: { type: 'STRING', nullable: true, enum: ['x', 'y'] }, b: { type: 'ARRAY', items: { type: 'NUMBER' } } },
    required: ['a']
  });
});

test('resolveVoiceProvider: Google once its key exists, explicit pick wins, switch off forces OpenAI', () => {
  const r = (o) => g.resolveVoiceProvider({ geminiEnabled: true, hasOpenAiKey: false, hasGoogleKey: false, ...o });
  assert.strictEqual(r({}), 'openai');
  assert.strictEqual(r({ hasOpenAiKey: true }), 'openai');
  assert.strictEqual(r({ hasGoogleKey: true }), 'google');
  assert.strictEqual(r({ hasGoogleKey: true, hasOpenAiKey: true }), 'google');
  assert.strictEqual(r({ hasGoogleKey: true, hasOpenAiKey: true, choice: 'openai' }), 'openai');
  assert.strictEqual(r({ hasGoogleKey: true, choice: 'openai' }), 'google', 'a pick without its key falls back');
  assert.strictEqual(r({ hasOpenAiKey: true, choice: 'google' }), 'openai');
  assert.strictEqual(r({ hasGoogleKey: true, geminiEnabled: false }), 'openai');
  assert.strictEqual(r({ hasGoogleKey: true, choice: 'bogus' }), 'google');
});

test('PCM helpers: 16-bit LE round trip and linear resample length', () => {
  const f = new Float32Array([0, 0.5, -0.5, 1, -1]);
  const back = g.pcm16ToFloat(g.floatToPcm16(f));
  for (let i = 0; i < f.length; i++) assert.ok(Math.abs(back[i] - f[i]) < 1e-3, `sample ${i}`);
  assert.strictEqual(g.floatToPcm16(f).length, 10);
  assert.strictEqual(g.resampleLinear(new Float32Array(480), 48000, 16000).length, 160);
  const same = new Float32Array(3);
  assert.strictEqual(g.resampleLinear(same, 16000, 16000), same);
});

test('geminiErrorMessage names quota and bad-key cases', () => {
  assert.match(g.geminiErrorMessage(429, ''), /quota/i);
  assert.match(g.geminiErrorMessage(400, '{"error":{"status":"INVALID_ARGUMENT","message":"API key not valid"}}'), /rejected/);
  assert.match(g.geminiErrorMessage(403, ''), /rejected/);
  assert.match(g.geminiErrorMessage(500, 'boom'), /500/);
});

test('Google key: stored in the encrypted broker, sent only to Google, never returned or put in config', async () => {
  const integrations = loadTs('src/main/integrations.ts');
  const { readConfig } = loadTs('src/main/config.ts');
  const realtime = loadTs('src/main/realtime.ts');
  const KEY = 'AIzaTEST-not-a-real-key-123456';

  assert.strictEqual(realtime.hasGoogleKey(), false);
  const noKey = await realtime.mintGeminiLiveToken();
  assert.strictEqual(noKey.ok, false);
  assert.strictEqual(noKey.code, 'no_key');

  assert.ok(integrations.setSecret('apikey:google', KEY).ok);
  assert.strictEqual(realtime.hasGoogleKey(), true);

  const calls = [];
  const realFetch = global.fetch;
  global.fetch = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => JSON.stringify({ name: 'auth_tokens/ephemeral-abc' }) };
  };
  try {
    const res = await realtime.mintGeminiLiveToken(Date.parse('2026-11-15T00:00:00Z'));
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.token, 'auth_tokens/ephemeral-abc');
    assert.strictEqual(res.model, g.GEMINI_LIVE_MODEL);
    assert.ok(!JSON.stringify(res).includes(KEY), 'mint result must not carry the key');
    assert.strictEqual(calls.length, 1);
    assert.strictEqual(calls[0].url, g.GEMINI_TOKEN_URL);
    assert.strictEqual(calls[0].init.headers['x-goog-api-key'], KEY);
    const body = JSON.parse(calls[0].init.body);
    assert.strictEqual(body.uses, 1);
    assert.ok(!calls[0].url.includes(KEY), 'key must not ride the URL');

    global.fetch = async () => ({ ok: false, status: 429, text: async () => '{"error":{"status":"RESOURCE_EXHAUSTED"}}' });
    const quota = await realtime.mintGeminiLiveToken();
    assert.strictEqual(quota.code, 'quota');
    assert.ok(!JSON.stringify(quota).includes(KEY));
    global.fetch = async () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"API key not valid"}}' });
    assert.strictEqual((await realtime.mintGeminiLiveToken()).code, 'bad_key');
  } finally {
    global.fetch = realFetch;
  }

  // IPC surface: presence boolean + mint only.
  realtime.registerRealtimeIpc();
  assert.strictEqual(await handlers.get('geminiLive:hasKey')(), true);
  assert.ok(!JSON.stringify(readConfig()).includes(KEY), 'config.json must not hold the key');
  for (const f of fs.readdirSync(userData)) {
    if (f.endsWith('.json') && !f.startsWith('integration-secrets')) {
      assert.ok(!fs.readFileSync(path.join(userData, f), 'utf8').includes(KEY), `${f} must not hold the key`);
    }
  }
});

test('renderer-visible config types carry no Google key field; Settings saves via the write-only broker', () => {
  for (const f of ['src/preload/index.ts', 'src/renderer/src/store/config.ts', 'src/main/config.ts']) {
    assert.ok(!/(google|gemini)(Api)?Key\??:/i.test(read(f)), `${f} declares a Google key config field`);
  }
  const settings = read('src/renderer/src/components/SettingsModal.tsx');
  assert.match(settings, /providerKeySet\(\{ backend: 'google', key \}\)/);
  assert.ok(!/stage\(\{[^}]*(google|gemini)\w*Key/i.test(settings));
  assert.match(read('src/renderer/index.html'), /wss:\/\/generativelanguage\.googleapis\.com/);
});

test('geminiVoice owner switch exists and defaults on', () => {
  const { FEATURE_DEFAULTS, featureOn } = loadTs('src/shared/features.ts');
  assert.strictEqual(FEATURE_DEFAULTS.geminiVoice, true);
  assert.strictEqual(featureOn({ geminiVoice: false }, 'geminiVoice'), false);
});
