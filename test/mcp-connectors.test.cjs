'use strict';

// MCP connectors: the catalog (Pancake POS, Webcake, keyed servers), the pure
// per-agent builder, the file an agent is actually launched with, and the broker
// carrying MCP traffic to a vendor with the key injected on the way out.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const loadTs = require('./load-ts.cjs');

const cat = loadTs('src/shared/mcpCatalog.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const KEY = 'pos-key-DO-NOT-LEAK-123';
const JWT = 'webcake-jwt-DO-NOT-LEAK-456';
const secrets = { 'pancake-pos': KEY, 'webcake-landing': JWT };
const getSecret = (id) => secrets[id];
const broker = { url: 'http://127.0.0.1:5555', token: 'cap-token' };

// ── catalog ──────────────────────────────────────────────────────────────────

test('Pancake POS is the vendor-hosted endpoint with the documented X-Api-Key header', () => {
  const e = cat.mcpCatalogEntry('pancake-pos');
  assert.deepEqual(e.spec, { transport: 'http', url: 'https://mcp-pos.pancake.biz/mcp' });
  assert.deepEqual([e.secret.kind, e.secret.name], ['header', 'X-Api-Key']);
  assert.equal(e.tier, 'secret');
  assert.equal(e.defaultEnabled, false);
});

test('Webcake runs a PINNED package version with its token in WEBCAKE_JWT', () => {
  const e = cat.mcpCatalogEntry('webcake-landing');
  assert.equal(e.spec.command, 'npx');
  assert.match(e.spec.args.join(' '), /webcake-landing-mcp@\d+\.\d+\.\d+$/, 'never an unpinned/latest install');
  assert.deepEqual([e.secret.kind, e.secret.name], ['env', 'WEBCAKE_JWT']);
  assert.equal(e.defaultEnabled, false);
});

test('catalog invariants: secrets only on consent tiers, never baked into specs, https help links', () => {
  for (const e of cat.MCP_CATALOG) {
    if (e.secret) {
      assert.notEqual(e.tier, 'safe-readonly', `${e.id}: a keyed server is never on by default`);
      if (e.secret.helpUrl) assert.match(e.secret.helpUrl, /^https:\/\//, e.id);
      assert.equal(e.secret.kind === 'header', cat.isBrokered(e), `${e.id}: header secrets are for brokered servers, env for plain stdio`);
    }
    if (!cat.isHttpSpec(e.spec)) {
      for (const [k, v] of Object.entries(e.spec.env ?? {})) assert.notEqual(v, '', `${e.id}: empty env ${k} is a secret placeholder`);
    } else {
      assert.match(e.spec.url, /^https:\/\//, e.id);
    }
    assert.equal(e.defaultEnabled, e.tier === 'safe-readonly', e.id);
  }
});

// ── builder ──────────────────────────────────────────────────────────────────

test('defaults: only safe servers, cwd-scoped, namespaced', () => {
  const { servers } = cat.buildMcpServers({ cwd: '/work', consent: undefined, getSecret, broker });
  assert.ok(servers['atmt-filesystem']);
  assert.ok(servers['atmt-filesystem'].args.includes('/work'));
  assert.equal(servers['atmt-pancake-pos'], undefined);
  assert.equal(servers['atmt-webcake-landing'], undefined);
});

test('a keyed server can never ride in on a default, only on explicit consent', () => {
  const noExplicit = cat.buildMcpServers({ cwd: '/w', consent: { 'pancake-pos': {} }, getSecret, broker });
  assert.equal(noExplicit.servers['atmt-pancake-pos'], undefined);
});

test('enabled without a key: skipped and reported, never launched half-configured', () => {
  const r = cat.buildMcpServers({ cwd: '/w', consent: { 'webcake-landing': { enabled: true } }, getSecret: () => undefined, broker });
  assert.equal(r.servers['atmt-webcake-landing'], undefined);
  assert.deepEqual(r.skipped, [{ id: 'webcake-landing', reason: 'no_secret' }]);
});

test('stdio connector gets its key in env', () => {
  const r = cat.buildMcpServers({ cwd: '/w', consent: { 'webcake-landing': { enabled: true } }, getSecret, broker });
  assert.deepEqual(r.servers['atmt-webcake-landing'].env, { WEBCAKE_JWT: JWT });
});

test('http connector points at the BROKER with the capability token; the key appears nowhere', () => {
  const r = cat.buildMcpServers({ cwd: '/w', consent: { 'pancake-pos': { enabled: true } }, getSecret, broker });
  const s = r.servers['atmt-pancake-pos'];
  assert.equal(s.type, 'http');
  assert.equal(s.url, 'http://127.0.0.1:5555/i/mcp-pancake-pos/mcp');
  assert.deepEqual(s.headers, { authorization: 'Bearer cap-token' });
  assert.ok(!JSON.stringify(r.servers).includes(KEY), 'vendor key must never reach agent config');
  assert.ok(!JSON.stringify(r.servers).includes('mcp-pos.pancake.biz'), 'agent never talks to the vendor directly');
  assert.deepEqual(r.brokerIds, ['mcp-pancake-pos']);
});

test('http connector with the broker down is skipped, not exposed', () => {
  const r = cat.buildMcpServers({ cwd: '/w', consent: { 'pancake-pos': { enabled: true } }, getSecret });
  assert.equal(r.servers['atmt-pancake-pos'], undefined);
  assert.deepEqual(r.skipped, [{ id: 'pancake-pos', reason: 'broker_offline' }]);
});

// ── bundled connectors (Obsidian, Discord) ───────────────────────────────────

const vars = { node: '/app/electron', resources: '/app/resources', 'obsidian-vault': '/notes/vault' };

test('Obsidian runs the bundled server on the app Node, scoped to the chosen vault', () => {
  const e = cat.mcpCatalogEntry('obsidian');
  assert.equal(e.tier, 'write');
  assert.equal(e.defaultEnabled, false, 'writes outside the workspace: consent only');
  const r = cat.buildMcpServers({ cwd: '/w', consent: { obsidian: { enabled: true } }, getSecret, broker, vars });
  assert.deepEqual(r.servers['atmt-obsidian'], {
    command: '/app/electron',
    args: ['/app/resources/md-obsidian-mcp.cjs'],
    env: { ELECTRON_RUN_AS_NODE: '1', OBSIDIAN_VAULT: '/notes/vault' }
  });
});

test('a connector with an unfilled placeholder is skipped, never launched with a literal <obsidian-vault>', () => {
  const r = cat.buildMcpServers({ cwd: '/w', consent: { obsidian: { enabled: true } }, getSecret, broker, vars: { node: 'n', resources: 'r' } });
  assert.equal(r.servers['atmt-obsidian'], undefined);
  assert.deepEqual(r.skipped, [{ id: 'obsidian', reason: 'not_configured' }]);
});

test('Discord talks to the broker with a capability token; the bot token appears nowhere', () => {
  const BOT = 'discord-bot-DO-NOT-LEAK-789';
  const e = cat.mcpCatalogEntry('discord');
  assert.deepEqual(e.spec.upstream, { url: 'https://discord.com/api/v10', authType: 'discord' });
  assert.equal(e.defaultEnabled, false);
  const r = cat.buildMcpServers({ cwd: '/w', consent: { discord: { enabled: true } }, getSecret: (id) => (id === 'discord' ? BOT : undefined), broker, vars });
  const s = r.servers['atmt-discord'];
  assert.equal(s.env.MD_UPSTREAM_URL, 'http://127.0.0.1:5555/i/mcp-discord');
  assert.equal(s.env.MD_UPSTREAM_TOKEN, 'cap-token');
  assert.ok(!JSON.stringify(r.servers).includes(BOT), 'bot token must never reach agent config');
  assert.deepEqual(r.brokerIds, ['mcp-discord']);
  assert.deepEqual(cat.mcpBrokerTarget(e), { baseUrl: 'https://discord.com/api/v10', authType: 'discord' });
  assert.deepEqual(cat.enabledBrokeredEntries({ discord: { enabled: true }, obsidian: { enabled: true } }).map((x) => x.id), ['discord']);

  const noBroker = cat.buildMcpServers({ cwd: '/w', consent: { discord: { enabled: true } }, getSecret: () => BOT, vars });
  assert.deepEqual(noBroker.skipped, [{ id: 'discord', reason: 'broker_offline' }]);
  const noKey = cat.buildMcpServers({ cwd: '/w', consent: { discord: { enabled: true } }, getSecret: () => undefined, broker, vars });
  assert.deepEqual(noKey.skipped, [{ id: 'discord', reason: 'no_secret' }]);
});

test('the broker sends a Discord key as "Authorization: Bot <token>"', () => {
  const { buildAuthHeaders } = loadTs('src/shared/integrations.ts');
  assert.deepEqual(buildAuthHeaders('discord', undefined, 'abc'), { authorization: 'Bot abc' });
  assert.deepEqual(buildAuthHeaders('discord', undefined, undefined), {});
});

// ── what the agent is launched with ──────────────────────────────────────────

test('servers go in a private mcp.json passed with --mcp-config (Claude ignores them in --settings)', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-mcp-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const inj = await hive.ensureAgent(
    { id: 'a1', name: 'A', provider: 'claude', cwd: home },
    { mcpDefaults: { 'pancake-pos': { enabled: true }, 'webcake-landing': { enabled: true } }, mcpSecret: getSecret, mcpBroker: broker }
  );
  const i = inj.args.indexOf('--mcp-config');
  assert.ok(i >= 0, 'launched with --mcp-config');
  const file = inj.args[i + 1];
  const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(cfg.mcpServers['atmt-pancake-pos']);
  assert.equal(cfg.mcpServers['atmt-webcake-landing'].env.WEBCAKE_JWT, JWT);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600, 'key-bearing file is owner-only');
  const settings = inj.args.includes('--settings') ? JSON.parse(fs.readFileSync(inj.args[inj.args.indexOf('--settings') + 1], 'utf8')) : {};
  assert.equal(settings.mcpServers, undefined, 'no dead mcpServers block in settings');

  // Turning everything off removes the key file on the next spawn.
  const again = await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home },
    { mcpDefaults: Object.fromEntries(cat.MCP_CATALOG.map((e) => [e.id, { enabled: false }])) });
  assert.equal(again.args.includes('--mcp-config'), false);
  assert.equal(fs.existsSync(file), false, 'stale key file removed');
});

// ── broker carries MCP ───────────────────────────────────────────────────────

function fakeVendor() {
  const seen = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      seen.push({ method: req.method, url: req.url, headers: req.headers, body });
      res.writeHead(200, { 'content-type': 'text/event-stream', 'mcp-session-id': 'sess-42' });
      res.write('event: message\ndata: {"jsonrpc":"2.0","id":1,"result":{}}\n\n');
      setTimeout(() => res.end(), 50);
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, seen, port: server.address().port })));
}

test('broker proxies MCP to the vendor: key injected, capability token and cookies stripped, session header + SSE pass through', async (t) => {
  const vendor = await fakeVendor();
  const record = {
    id: 'mcp-pancake-pos', label: 'Pancake POS', kind: 'custom-rest',
    baseUrl: `http://127.0.0.1:${vendor.port}`, authType: 'header', authHeader: 'X-Api-Key',
    secretRef: 'mcp:pancake-pos', enabled: true, createdAt: 0, updatedAt: 0
  };
  const b = new IntegrationBroker({
    getRecord: (id) => (id === record.id ? record : undefined),
    getSecret: (ref) => (ref === 'mcp:pancake-pos' ? KEY : undefined),
    isStreaming: (id) => id.startsWith('mcp-')
  });
  // resolveUpstreamUrl allows loopback http only for explicit local targets; the
  // record above is local for the test.
  await b.start();
  t.after(() => { b.stop(); vendor.server.close(); });

  const workerToken = b.grant('pty-1', ['int-github']);
  const token = b.extend('pty-1', ['mcp-pancake-pos']);
  assert.equal(token, workerToken, 'extend keeps the worker\'s existing token valid');

  const res = await fetch(`${b.url()}/i/mcp-pancake-pos/mcp`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`, cookie: 'x=1', accept: 'application/json, text/event-stream',
      'content-type': 'application/json', 'mcp-session-id': 'sess-42'
    },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} })
  });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('mcp-session-id'), 'sess-42');
  assert.match(await res.text(), /"jsonrpc":"2.0"/);
  const got = vendor.seen[0];
  assert.equal(got.url, '/mcp');
  assert.equal(got.headers['x-api-key'], KEY, 'vendor receives the real key');
  assert.equal(got.headers.authorization, undefined, 'capability token never leaves the machine');
  assert.equal(got.headers.cookie, undefined);
  assert.equal(got.headers['mcp-session-id'], 'sess-42');
  assert.match(got.body, /initialize/);

  // Not in the capability → refused; revoked → refused.
  const other = await fetch(`${b.url()}/i/mcp-webcake-x/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(other.status, 403);
  b.revoke('pty-1');
  const gone = await fetch(`${b.url()}/i/mcp-pancake-pos/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}` }, body: '{}' });
  assert.equal(gone.status, 401);
});

test('extend on an unknown worker mints a fresh capability', () => {
  const b = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined });
  const t1 = b.extend('pty-9', ['mcp-pancake-pos']);
  assert.equal(typeof t1, 'string');
  assert.ok(t1.length > 20);
});
