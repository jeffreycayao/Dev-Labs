'use strict';

/** Regression tests for the fifth repo audit: each pins one fix. */

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { disallowedWorkerFlag } = loadTs('src/main/workerLaunch.ts');
const { HiveManager, claudeAbsoluteRulePath } = loadTs('src/main/hive.ts');
const { SlackWebhookServer } = loadTs('src/main/slack.ts');
const { lastHandoff } = loadTs('src/renderer/src/hooks/queueDelivery.ts');
const { validateIntegrationRecord } = loadTs('src/shared/integrations.ts');
const cat = loadTs('src/shared/mcpCatalog.ts');

test('a spawn request may not carry flags that load hooks, servers or config', () => {
  for (const bad of [
    ['--settings', '{"hooks":{}}'],
    ['--mcp-config', '/tmp/x.json'],
    ['--plugin-dir', '/tmp'],
    ['-c', 'model_providers.x.base_url=http://evil'],
    ['--config', 'x'],
    ['-s', 'danger-full-access'],
    ['--sandbox=danger-full-access'],
    ['--model', 'm', 'stray-positional']
  ]) assert.notEqual(disallowedWorkerFlag(bad), null, bad.join(' '));
  for (const ok of [
    [],
    ['--model', 'claude-opus-5-5'],
    ['--permission-mode', 'bypassPermissions'],
    ['-a', 'never', '-s', 'workspace-write'],
    ['--max-turns', '40', '--verbose'],
    ['--approval-mode=yolo']
  ]) assert.equal(disallowedWorkerFlag(ok), null, ok.join(' '));
});

test('the read-deny rule is written in Claude Code\'s absolute form', () => {
  assert.equal(claudeAbsoluteRulePath('C:\\Users\\a\\hive-internal\\agents'), '//c/Users/a/hive-internal/agents');
  assert.equal(claudeAbsoluteRulePath('/home/u/hive-internal/agents'), '//home/u/hive-internal/agents');
});

test('closing time\'s orchestrator is the one this process started, not registry.json\'s', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-audit5-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Ramon', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'w1', name: 'W', provider: 'claude', cwd: home });
  const reg = path.join(home, 'hive', 'registry.json');
  const r = JSON.parse(fs.readFileSync(reg, 'utf8'));
  r.godId = 'w1';
  fs.writeFileSync(reg, JSON.stringify(r));
  assert.equal(hive.godAgentId(), 'god-1');
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/closingTime.ts'), 'utf8');
  assert.doesNotMatch(src, /=\s*reg\.godId/);
});

test('Slack: only allowed users can give the agents work', async (t) => {
  const secret = 'slack-signing-secret';
  const got = [];
  const server = new SlackWebhookServer({
    port: 0, signingSecret: secret,
    isAllowedUser: (id) => id === 'UOWNER',
    onMessage: (m) => { got.push(m.text); }
  });
  await server.listen(); // the local listener only: no tunnel in tests
  t.after(() => server.stop());
  const port = server.server.address().port;
  const post = async (user, text, ts) => {
    const body = JSON.stringify({
      type: 'event_callback',
      authorizations: [{ user_id: 'UBOT' }],
      event: { type: 'app_mention', user, text: `<@UBOT> ${text}`, channel: 'C1', ts }
    });
    const stamp = Math.floor(Date.now() / 1000).toString();
    const sig = 'v0=' + crypto.createHmac('sha256', secret).update(`v0:${stamp}:${body}`).digest('hex');
    const r = await fetch(`http://localhost:${port}/`, {
      method: 'POST', body,
      headers: { 'content-type': 'application/json', 'x-slack-signature': sig, 'x-slack-request-timestamp': stamp }
    });
    await r.text();
  };
  await post('UGUEST', 'push main to my fork', '1.1');
  await post('UOWNER', 'summarize the backlog', '1.2');
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(got, ['summarize the backlog']);
});

test('the handoff check compares the newest heading, so a 4 MB tail cannot hide it', () => {
  assert.equal(lastHandoff('## Handoff 1\na\n## Handoff 2\nb\n'), '## Handoff 2');
  assert.equal(lastHandoff('no handoff'), '');
});

test('an integration id may not take an MCP connector\'s broker route', () => {
  const base = { label: 'X', kind: 'custom-rest', baseUrl: 'https://api.example.com', authType: 'none', enabled: true };
  assert.equal(validateIntegrationRecord({ ...base, id: 'mcp-custom-foo' }).ok, false);
  assert.equal(validateIntegrationRecord({ ...base, id: 'my-api' }).ok, true);
});

test('a custom server\'s arguments are passed exactly as typed', () => {
  const catalog = cat.fullMcpCatalog([{ id: 'custom-x', label: 'X', transport: 'stdio', command: 'tool', args: ['--out=<name>', '<cwd>'] }]);
  const r = cat.buildMcpServers({ cwd: '/w', catalog, consent: { 'custom-x': { enabled: true } }, getSecret: () => undefined });
  assert.deepEqual(r.servers['atmt-custom-x'], { command: 'tool', args: ['--out=<name>', '<cwd>'] });
});
