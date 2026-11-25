'use strict';

/** Regression tests for the fourth repo audit: each pins one fix. */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const { checkPrecondition, lastHandoff } = loadTs('src/renderer/src/hooks/queueDelivery.ts');
const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { resolveUpstreamUrl } = loadTs('src/shared/integrations.ts');
const { parseOpenRouterModels } = loadTs('src/main/cliModels.ts');
const { buildOpenCodeConfig } = loadTs('src/shared/opencodeConfig.ts');
const { HiveManager, syncCodexAuth } = loadTs('src/main/hive.ts');

function tmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('a handoff clear is sent only once a new "## Handoff" section exists; unreadable memory drops it', async () => {
  const before = '# Memory\n\n## Handoff 2026-01-01\nold\n';
  const msg = { precondition: 'handoff-saved', handoffBase: lastHandoff(before) };
  const inbox = async () => [];
  assert.equal(await checkPrecondition(msg, inbox, async () => before), 'drop', 'nothing new written');
  assert.equal(await checkPrecondition(msg, inbox, async () => `${before}\n## Handoff 2026-02-02\nnew\n`), 'send');
  assert.equal(await checkPrecondition(msg, inbox, async () => { throw new Error('gone'); }), 'drop', 'fails closed');
  assert.equal(await checkPrecondition(msg, inbox), 'drop', 'no reader, no clear');
  // Only the newest 4 MB is read: the old heading can drop out of view as the new
  // one lands, so the newest heading is compared, never a count.
  assert.equal(await checkPrecondition(msg, inbox, async () => '…tail…\n## Handoff 2026-02-02\nnew\n'), 'send');
  assert.equal(await checkPrecondition({ precondition: 'handoff-saved', handoffBase: '' }, inbox, async () => 'no handoff yet'), 'drop');
});

test('a negative cost report cannot pull an agent total below zero', async (t) => {
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0, resolveAgent: (tok) => (tok === 'tok-a' ? 'agent-a' : undefined) });
  await telemetry.start();
  t.after(() => telemetry.stop());
  const batch = (name, attrs, point) => ({
    resourceMetrics: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: 'agent-a' } }] },
      scopeMetrics: [{ metrics: [{ name, sum: { dataPoints: [{ ...point, attributes: attrs }] } }] }]
    }]
  });
  const sid = [{ key: 'session.id', value: { stringValue: 's1' } }];
  for (const body of [
    batch('claude_code.cost.usage', sid, { asDouble: -1e9 }),
    batch('claude_code.token.usage', [...sid, { key: 'type', value: { stringValue: 'output' } }], { asInt: '-500' })
  ]) {
    const r = await fetch(`${telemetry.endpoint()}/v1/metrics`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-devlabs-agent': 'tok-a' }, body: JSON.stringify(body)
    });
    await r.text();
  }
  const u = telemetry.getAgentUsage('agent-a');
  assert.ok(!u || (u.usd >= 0 && u.output >= 0), JSON.stringify(u));
});

test('a remote MCP connector stays on its MCP path, and the bare endpoint keeps its exact form', () => {
  const ghl = 'https://services.leadconnectorhq.com/mcp/';
  assert.equal(resolveUpstreamUrl(ghl, '')?.href, ghl);
  assert.equal(resolveUpstreamUrl(ghl, '../contacts/123'), null);
  const ff = 'https://api.fireflies.ai/mcp';
  assert.equal(resolveUpstreamUrl(ff, '')?.href, ff, 'no trailing slash added');
  assert.equal(resolveUpstreamUrl(ff, '?x=1')?.href, `${ff}?x=1`);
  assert.equal(resolveUpstreamUrl(ff, '../graphql'), null);
  assert.equal(resolveUpstreamUrl(ff, '%2e%2e/graphql'), null);
});

test('one bad OpenRouter row does not empty the list; a pick without the broker still registers', () => {
  const tools = ['tools'];
  const models = parseOpenRouterModels({
    data: [
      null,
      { name: 'no id', pricing: { prompt: '0', completion: '0' }, supported_parameters: tools },
      { id: 'qwen/qwen3-coder:free', name: 'Q', pricing: { prompt: '0', completion: '0' }, supported_parameters: tools }
    ]
  });
  assert.deepEqual(models.map((m) => m.id), ['openrouter/qwen/qwen3-coder:free']);
  const oc = buildOpenCodeConfig({ autoMode: false, model: 'openrouter/qwen/qwen3-coder:free' });
  assert.deepEqual(oc.provider.openrouter.models, { 'qwen/qwen3-coder:free': { name: 'qwen/qwen3-coder:free' } });
});

test('the message log is ignored and untracked by the hive repo', async (t) => {
  const home = tmp(t, 'md-audit4-');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Ramon', provider: 'claude', cwd: home, isGod: true });
  hive.appendLog({ kind: 'probe' });
  hive.commit('probe');
  hive.flushCommit();
  const git = (...a) => execFileSync('git', [
    `--git-dir=${path.join(home, 'hive-internal', 'git')}`, `--work-tree=${path.join(home, 'hive')}`, ...a
  ], { encoding: 'utf8' });
  assert.match(fs.readFileSync(path.join(home, 'hive', '.gitignore'), 'utf8'), /^log\.jsonl$/m);
  assert.equal(git('ls-files', '--', 'log.jsonl').trim(), '');
});

test('without symlinks a Codex worker gets a hard link, so its token refresh reaches the user', (t) => {
  const dir = tmp(t, 'md-codex-link-');
  const src = path.join(dir, 'auth.json');
  const dest = path.join(dir, 'worker-auth.json');
  fs.writeFileSync(src, '{"v":1}');
  const real = fs.symlinkSync;
  fs.symlinkSync = () => { const e = new Error('EPERM'); e.code = 'EPERM'; throw e; };
  t.after(() => { fs.symlinkSync = real; });
  syncCodexAuth(src, dest);
  assert.equal(fs.lstatSync(dest).isSymbolicLink(), false);
  fs.writeFileSync(dest, '{"v":2}'); // Codex rewrites the file in place
  assert.equal(fs.readFileSync(src, 'utf8'), '{"v":2}');
});
