'use strict';

/** Metricool connector, and MCP servers the user adds by hand
 *  (config.customMcpServers → src/shared/mcpCatalog.ts). */

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const cat = loadTs('src/shared/mcpCatalog.ts');

const broker = { url: 'http://127.0.0.1:5555', token: 'cap-token' };

test('Metricool goes through the broker with the key in X-Mc-Auth, never in agent config', () => {
  const KEY = 'mc-key-DO-NOT-LEAK';
  const e = cat.mcpCatalogEntry('metricool');
  assert.equal(e.defaultEnabled, false);
  assert.deepEqual(cat.mcpBrokerTarget(e), { baseUrl: 'https://ai.metricool.com/mcp', authType: 'header', authHeader: 'X-Mc-Auth' });
  const r = cat.buildMcpServers({ cwd: '/w', consent: { metricool: { enabled: true } }, getSecret: () => KEY, broker });
  assert.equal(r.servers['atmt-metricool'].url, 'http://127.0.0.1:5555/i/mcp-metricool/');
  assert.ok(!JSON.stringify(r.servers).includes(KEY));
});

test('custom servers: bad rows are dropped, never a built-in id, at most 20', () => {
  const ok = cat.sanitizeCustomMcp([
    { id: 'custom-notion', label: 'Notion', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], envName: 'NOTION_TOKEN' },
    { id: 'custom-remote', label: 'Remote', transport: 'http', url: 'https://mcp.example.com/mcp', auth: 'header', headerName: 'X-Api-Key' },
    { id: 'custom-local', label: 'Local', transport: 'http', url: 'http://localhost:8080/mcp', auth: 'none' }
  ]);
  assert.deepEqual(ok.map((c) => c.id), ['custom-notion', 'custom-remote', 'custom-local']);
  const bad = cat.sanitizeCustomMcp([
    null,
    { id: 'metricool', label: 'x', transport: 'http', url: 'https://a.b/mcp' },                  // not custom-*
    { id: 'custom-a', label: 'A', transport: 'http', url: 'http://evil.example/mcp' },            // plain http off-box
    { id: 'custom-b', label: 'B', transport: 'http', url: 'https://u:p@a.b/mcp' },                // credentials in URL
    { id: 'custom-c', label: 'C', transport: 'http', url: 'https://a.b/mcp', auth: 'header', headerName: 'Host' },
    { id: 'custom-d', label: 'D', transport: 'stdio', command: 'node\nrm -rf /' },
    { id: 'custom-e', label: 'E', transport: 'stdio', command: 'node', envName: 'NODE_OPTIONS' },
    { id: 'custom-f', label: '', transport: 'stdio', command: 'node' }
  ]);
  assert.deepEqual(bad, []);
  const many = Array.from({ length: 30 }, (_, i) => ({ id: `custom-s${i}`, label: `S${i}`, transport: 'stdio', command: 'node' }));
  assert.equal(cat.sanitizeCustomMcp(many).length, cat.CUSTOM_MCP_MAX);
});

test('a custom remote server with a key goes through the broker; a keyless one is called directly', () => {
  const KEY = 'custom-key-DO-NOT-LEAK';
  const catalog = cat.fullMcpCatalog([
    { id: 'custom-remote', label: 'Remote', transport: 'http', url: 'https://mcp.example.com/mcp', auth: 'bearer' },
    { id: 'custom-open', label: 'Open', transport: 'http', url: 'https://open.example.com/mcp', auth: 'none' }
  ]);
  const r = cat.buildMcpServers({
    cwd: '/w', catalog, broker, getSecret: () => KEY,
    consent: { 'custom-remote': { enabled: true }, 'custom-open': { enabled: true } }
  });
  assert.equal(r.servers['atmt-custom-remote'].url, 'http://127.0.0.1:5555/i/mcp-custom-remote/');
  assert.deepEqual(r.servers['atmt-custom-open'], { type: 'http', url: 'https://open.example.com/mcp', headers: {} });
  assert.ok(!JSON.stringify(r.servers).includes(KEY));
  // Only the keyed one gets a broker grant.
  assert.deepEqual(cat.enabledBrokeredEntries({ 'custom-remote': { enabled: true }, 'custom-open': { enabled: true } }, catalog).map((e) => e.id), ['custom-remote']);
  // The broker is confined to the server's own MCP path.
  const e = catalog.find((x) => x.id === 'custom-remote');
  assert.deepEqual(cat.mcpBrokerTarget(e), { baseUrl: 'https://mcp.example.com/mcp', authType: 'bearer' });
});

test('a custom local server is off until switched on, and gets its key in the env var named', () => {
  const catalog = cat.fullMcpCatalog([
    { id: 'custom-notion', label: 'Notion', transport: 'stdio', command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], envName: 'NOTION_TOKEN' }
  ]);
  const off = cat.buildMcpServers({ cwd: '/w', catalog, consent: {}, getSecret: () => 'tok' });
  assert.equal(off.servers['atmt-custom-notion'], undefined);
  const noKey = cat.buildMcpServers({ cwd: '/w', catalog, consent: { 'custom-notion': { enabled: true } }, getSecret: () => undefined });
  assert.deepEqual(noKey.skipped.filter((s) => s.id === 'custom-notion'), [{ id: 'custom-notion', reason: 'no_secret' }]);
  const on = cat.buildMcpServers({ cwd: '/w', catalog, consent: { 'custom-notion': { enabled: true } }, getSecret: () => 'tok' });
  assert.deepEqual(on.servers['atmt-custom-notion'], { command: 'npx', args: ['-y', '@notionhq/notion-mcp-server'], env: { NOTION_TOKEN: 'tok' } });
});
