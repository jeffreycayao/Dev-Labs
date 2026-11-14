'use strict';

// BYOK model-provider keys go through the loopback broker: agents hold a
// per-agent capability token, never the real key (src/shared/byokBroker.ts).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const byok = loadTs('src/shared/byokBroker.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { buildOpenCodeConfig } = loadTs('src/shared/opencodeConfig.ts');

const SENTINEL = {
  anthropic: 'sk-ant-SENTINEL-DO-NOT-LEAK-1',
  openai: 'sk-openai-SENTINEL-DO-NOT-LEAK-2',
  google: 'AIza-SENTINEL-DO-NOT-LEAK-3',
  openrouter: 'sk-or-SENTINEL-DO-NOT-LEAK-4',
  groq: 'gsk-SENTINEL-DO-NOT-LEAK-5'
};
const noSentinel = (blob, where) => {
  for (const k of Object.values(SENTINEL)) assert.ok(!blob.includes(k), `real key leaked into ${where}`);
};

// ── routing table ────────────────────────────────────────────────────────────

test('each provider route forwards only to its official host, with its own auth style', () => {
  const want = {
    anthropic: ['https://api.anthropic.com', 'header', 'x-api-key'],
    openai: ['https://api.openai.com', 'bearer', undefined],
    google: ['https://generativelanguage.googleapis.com', 'header', 'x-goog-api-key'],
    openrouter: ['https://openrouter.ai/api', 'bearer', undefined],
    groq: ['https://api.groq.com/openai', 'bearer', undefined]
  };
  for (const [b, [baseUrl, authType, authHeader]] of Object.entries(want)) {
    const r = byok.providerBrokerRecord(`llm.${b}`);
    assert.deepEqual([r.baseUrl, r.authType, r.authHeader, r.secretRef, r.enabled], [baseUrl, authType, authHeader, `apikey:${b}`, true], b);
  }
  assert.equal(byok.providerBrokerRecord('llm.evil'), undefined);
  assert.equal(byok.providerBrokerRecord('mcp-fireflies'), undefined);
  assert.equal(byok.isProviderBrokerId('llm.openai'), true);
  assert.equal(byok.isProviderBrokerId('openai'), false);
});

// ── a broker in front of a fake upstream ─────────────────────────────────────

async function fakeUpstream(t, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => { seen.push({ url: req.url, headers: req.headers, body }); handler(req, res); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => server.close());
  return { seen, origin: `http://127.0.0.1:${server.address().port}` };
}

/** The real provider record, re-pointed at the fake upstream (keeping its path prefix). */
async function brokerFor(t, upstreamOrigin) {
  const b = new IntegrationBroker({
    getRecord: (id) => {
      const r = byok.providerBrokerRecord(id);
      if (!r) return undefined;
      const u = new URL(r.baseUrl);
      return { ...r, baseUrl: upstreamOrigin + u.pathname.replace(/\/$/, '') };
    },
    getSecret: (ref) => SENTINEL[String(ref).replace(/^apikey:/, '')],
    isModelRoute: byok.isProviderBrokerId
  });
  await b.start();
  t.after(() => b.stop());
  return b;
}

test('broker swaps the token for the real key in each provider\'s header', async (t) => {
  const up = await fakeUpstream(t, (_req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  const b = await brokerFor(t, up.origin);
  const token = b.extend('pty-1', byok.BYOK_BACKENDS.map(byok.providerBrokerId));
  // Where each SDK puts "the API key" (which is now the token).
  const cases = [
    ['anthropic', 'v1/messages', { 'x-api-key': token, 'anthropic-version': '2023-06-01' }, '/v1/messages', 'x-api-key', SENTINEL.anthropic],
    ['openai', 'v1/chat/completions', { authorization: `Bearer ${token}` }, '/v1/chat/completions', 'authorization', `Bearer ${SENTINEL.openai}`],
    ['google', 'v1beta/models/gemini-2.5-pro:generateContent', { 'x-goog-api-key': token }, '/v1beta/models/gemini-2.5-pro:generateContent', 'x-goog-api-key', SENTINEL.google],
    ['google', `v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse&key=${token}`, {}, '/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse', 'x-goog-api-key', SENTINEL.google],
    ['openrouter', 'v1/chat/completions', { authorization: `Bearer ${token}` }, '/api/v1/chat/completions', 'authorization', `Bearer ${SENTINEL.openrouter}`],
    ['groq', 'v1/chat/completions', { authorization: `Bearer ${token}` }, '/openai/v1/chat/completions', 'authorization', `Bearer ${SENTINEL.groq}`]
  ];
  for (const [backend, p, headers, wantUrl, header, value] of cases) {
    const res = await fetch(`${b.url()}/i/llm.${backend}/${p}`, {
      method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: '{"model":"m"}'
    });
    assert.equal(res.status, 200, backend);
    const got = up.seen.at(-1);
    assert.equal(got.url, wantUrl, `${backend} path`);
    assert.equal(got.headers[header], value, `${backend} gets the real key in ${header}`);
    assert.ok(!JSON.stringify(got).includes(token), `${backend}: token must not leave the machine`);
    assert.equal(got.body, '{"model":"m"}');
    if (backend === 'anthropic') assert.equal(got.headers['anthropic-version'], '2023-06-01');
  }
});

test('a route the token was not granted, and a revoked token, are refused', async (t) => {
  const up = await fakeUpstream(t, (_req, res) => res.end('{}'));
  const b = await brokerFor(t, up.origin);
  const token = b.extend('pty-2', [byok.providerBrokerId('openai')]);
  const other = await fetch(`${b.url()}/i/llm.anthropic/v1/messages`, { method: 'POST', headers: { 'x-api-key': token }, body: '{}' });
  assert.equal(other.status, 403);
  b.revoke('pty-2');
  const res = await fetch(`${b.url()}/i/llm.openai/v1/chat/completions`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(res.status, 401);
  assert.equal(up.seen.length, 0, 'nothing reaches the provider');
});

test('a streamed (SSE) answer passes through chunk by chunk, not buffered', async (t) => {
  let release;
  const gate = new Promise((r) => { release = r; });
  const up = await fakeUpstream(t, async (_req, res) => {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"delta":"one"}\n\n');
    await gate; // the client must see chunk one BEFORE the upstream sends chunk two
    res.write('data: {"delta":"two"}\n\n');
    res.end('data: [DONE]\n\n');
  });
  const b = await brokerFor(t, up.origin);
  const token = b.extend('pty-3', [byok.providerBrokerId('anthropic')]);
  const res = await fetch(`${b.url()}/i/llm.anthropic/v1/messages`, {
    method: 'POST', headers: { 'x-api-key': token, accept: 'text/event-stream' }, body: '{"stream":true}'
  });
  assert.equal(res.headers.get('content-type'), 'text/event-stream');
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  const first = await Promise.race([
    reader.read(),
    new Promise((_, rej) => setTimeout(() => rej(new Error('first chunk was buffered')), 3000))
  ]);
  assert.match(dec.decode(first.value), /"one"/);
  release();
  let rest = '';
  for (;;) { const { done, value } = await reader.read(); if (done) break; rest += dec.decode(value); }
  assert.match(rest, /"two"[\s\S]*\[DONE\]/);
});

// ── what each engine is handed ───────────────────────────────────────────────

const grant = { url: 'http://127.0.0.1:5555', token: 'cap-token-xyz', backends: ['anthropic', 'openai', 'google', 'openrouter', 'groq'] };

test('agent env carries the token under every key var, never a real key', () => {
  const env = byok.byokEnv(grant);
  assert.deepEqual(env, {
    ANTHROPIC_API_KEY: 'cap-token-xyz', OPENAI_API_KEY: 'cap-token-xyz', GEMINI_API_KEY: 'cap-token-xyz',
    GOOGLE_GENERATIVE_AI_API_KEY: 'cap-token-xyz', OPENROUTER_API_KEY: 'cap-token-xyz', GROQ_API_KEY: 'cap-token-xyz'
  });
});

test('OpenCode config points each provider\'s baseURL at the broker route', () => {
  const oc = buildOpenCodeConfig({ autoMode: false, byok: grant });
  const base = (id) => oc.provider[id].options.baseURL;
  assert.equal(base('anthropic'), 'http://127.0.0.1:5555/i/llm.anthropic/v1');
  assert.equal(base('openai'), 'http://127.0.0.1:5555/i/llm.openai/v1');
  assert.equal(base('google'), 'http://127.0.0.1:5555/i/llm.google/v1beta');
  assert.equal(base('openrouter'), 'http://127.0.0.1:5555/i/llm.openrouter/v1');
  assert.equal(base('groq'), 'http://127.0.0.1:5555/i/llm.groq/v1');
  // local provider still coexists
  const both = buildOpenCodeConfig({ autoMode: false, byok: grant, baseUrl: 'http://127.0.0.1:11434/v1' });
  assert.ok(both.provider.local && both.provider.openai);
  assert.equal(buildOpenCodeConfig({ autoMode: false }).provider, undefined);
});

test('main reads a provider key into a spawn only for the listed direct-key exception (source guard)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
  // Everything else reaches `apikey:<backend>` only through the broker's getSecret.
  const reads = src.match(/getSecret\(providerKeyRef\(/g) || [];
  assert.equal(reads.length, 1, 'one key read at spawn: the BYOK_DIRECT_KEY loop');
  assert.match(src, /for \(const b of byokSpawn\?\.direct \?\? \[\]\) \{\s*const key = integrations\.getSecret\(providerKeyRef\(b\)\);/);
  assert.deepEqual(byok.BYOK_DIRECT_KEY, { crush: ['openrouter'] }, 'a new exception needs a Settings warning and a CHANGELOG line');
});

// ── hive spawn output per engine (Crush config, pi models.json, qwen sidecar) ─

const { HiveManager } = loadTs('src/main/hive.ts');

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p)); else out.push(p);
  }
  return out;
}
const scanAgent = (home, inj, where) => {
  noSentinel(JSON.stringify(inj.env), `${where} env`);
  for (const f of walk(home)) noSentinel(fs.readFileSync(f, 'utf8'), `${where} file ${path.relative(home, f)}`);
};

function fakeHomes(t) {
  const hiveHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-byok-hive-'));
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), 'md-byok-user-'));
  const real = { HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE };
  process.env.HOME = userHome; process.env.USERPROFILE = userHome;
  t.after(() => {
    for (const [k, v] of Object.entries(real)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    fs.rmSync(hiveHome, { recursive: true, force: true });
    fs.rmSync(userHome, { recursive: true, force: true });
  });
  assert.equal(os.homedir(), userHome, 'home redirect failed');
  return { hiveHome, userHome };
}

test('pi: models.json sends every keyed provider to the broker and drops a literal apiKey', async (t) => {
  const { hiveHome, userHome } = fakeHomes(t);
  const userPi = path.join(userHome, '.pi', 'agent');
  fs.mkdirSync(userPi, { recursive: true });
  fs.writeFileSync(path.join(userPi, 'models.json'), JSON.stringify({
    providers: {
      openai: { apiKey: SENTINEL.openai, baseUrl: 'https://my-gateway.example/v1', headers: { 'x-team': 'a' } },
      ollama: { baseUrl: 'http://localhost:11434/v1', api: 'openai-completions', models: [{ id: 'llama3' }] }
    }
  }));
  const hive = new HiveManager(() => hiveHome);
  const inj = await hive.ensureAgent({ id: 'pi-1', name: 'Pi', provider: 'pi', cwd: hiveHome }, { byok: grant });
  const models = JSON.parse(fs.readFileSync(path.join(inj.env.PI_CODING_AGENT_DIR, 'models.json'), 'utf8'));
  assert.deepEqual(Object.fromEntries(Object.entries(models.providers).map(([k, v]) => [k, v.baseUrl])), {
    openai: 'http://127.0.0.1:5555/i/llm.openai/v1',
    ollama: 'http://localhost:11434/v1',
    anthropic: 'http://127.0.0.1:5555/i/llm.anthropic',
    google: 'http://127.0.0.1:5555/i/llm.google/v1beta',
    openrouter: 'http://127.0.0.1:5555/i/llm.openrouter/v1',
    groq: 'http://127.0.0.1:5555/i/llm.groq/v1'
  });
  assert.equal(models.providers.openai.apiKey, undefined, 'literal key would bypass the token');
  assert.deepEqual(models.providers.openai.headers, { 'x-team': 'a' }, 'other user settings kept');
  scanAgent(path.join(hiveHome), inj, 'pi');
});

test('crush: keyed providers point at the broker, OpenRouter is left to Crush, openai rides the sidecar', async (t) => {
  const { hiveHome } = fakeHomes(t);
  const hive = new HiveManager(() => hiveHome);
  t.after(() => { try { hive.stopAllProxyBridges(); } catch { /* gone */ } });
  const upstream = 'http://127.0.0.1:5555/i/llm.openai/v1';
  const inj = await hive.ensureAgent({ id: 'crush-1', name: 'Crush', provider: 'crush', cwd: hiveHome }, { byok: grant, proxyUpstream: upstream });
  const cfg = JSON.parse(fs.readFileSync(path.join(inj.env.CRUSH_GLOBAL_CONFIG, 'crush.json'), 'utf8'));
  const p = cfg.providers;
  assert.equal(p.anthropic.base_url, 'http://127.0.0.1:5555/i/llm.anthropic/');
  assert.equal(p.gemini.base_url, 'http://127.0.0.1:5555/i/llm.google');
  assert.equal(p.groq.base_url, 'http://127.0.0.1:5555/i/llm.groq/v1');
  assert.equal(p.openrouter, undefined, 'Crush ignores an OpenRouter base_url (BYOK_DIRECT_KEY)');
  // Bound sidecar -> loopback; degraded (no bind) -> straight to the broker route.
  assert.ok(/^http:\/\/127\.0\.0\.1:\d+$/.test(p.openai.base_url) || p.openai.base_url === upstream, p.openai.base_url);
  scanAgent(hiveHome, inj, 'crush');
});

test('qwen: no key material in the spawn env', async (t) => {
  const { hiveHome } = fakeHomes(t);
  const hive = new HiveManager(() => hiveHome);
  t.after(() => { try { hive.stopAllProxyBridges(); } catch { /* gone */ } });
  const inj = await hive.ensureAgent({ id: 'qwen-1', name: 'Qwen', provider: 'qwen', cwd: hiveHome },
    { byok: { ...grant, backends: ['openai'] }, proxyUpstream: 'http://127.0.0.1:5555/i/llm.openai/v1' });
  if (inj.env.OPENAI_BASE_URL) assert.match(inj.env.OPENAI_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+$/, 'qwen talks to its loopback sidecar');
  scanAgent(hiveHome, inj, 'qwen');
});
