'use strict';

/**
 * Main-process audit fixes whose failure would be silent: a key committed to
 * git, a gate that fails open, an undercounted cost, a config read that goes
 * stale, a broker that never answers, a webhook that approves itself, and an
 * integration that sends its old key to a new host.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, spawn } = require('node:child_process');
const { once } = require('node:events');
const loadTs = require('./load-ts.cjs');

// One Electron stand-in for every module below: config/integrations read
// userData from app.getPath, integrations encrypts with safeStorage, hooks
// imports Notification.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'md-audit-'));
const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron,
  filename: electron,
  loaded: true,
  exports: {
    app: { getPath: () => userData },
    safeStorage: {
      isEncryptionAvailable: () => true,
      encryptString: (s) => Buffer.from(s, 'utf8'),
      decryptString: (b) => b.toString('utf8')
    },
    Notification: class { static isSupported() { return false; } }
  }
};
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const { HiveManager } = loadTs('src/main/hive.ts');
const { HookServer } = loadTs('src/main/hooks.ts');
const { IntegrationBroker } = loadTs('src/main/integrationBroker.ts');
const { readConfig, writeConfig } = loadTs('src/main/config.ts');
const integrations = loadTs('src/main/integrations.ts');
const { classifyInboundKind, isAutoAllowed } = loadTs('src/shared/triggers.ts');

async function freshHive(t) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-audit-hive-'));
  const hive = new HiveManager(() => home);
  t.after(() => { hive.stopRouter(); fs.rmSync(home, { recursive: true, force: true }); });
  await hive.ensureAgent({ id: 'a1', name: 'A', provider: 'claude', cwd: home });
  return { home, root: path.join(home, 'hive'), hive };
}

const git = (cwd, ...args) => spawnSync('git', args, { cwd, encoding: 'utf8' });

test('#1 an agent mcp.json is never committed, and an old committed copy is untracked', async (t) => {
  const { root, hive } = await freshHive(t);
  const mcp = path.join(root, 'agents', 'a1', 'mcp.json');

  fs.writeFileSync(mcp, '{"mcpServers":{"x":{"env":{"KEY":"sk-secret"}}}}');
  hive.flushCommit();
  assert.equal(git(root, 'ls-files', '--', 'agents/a1/mcp.json').stdout.trim(), '');

  // A hive from before the ignore line: the file is already in the index.
  git(root, 'add', '-f', 'agents/a1/mcp.json');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'old');
  assert.notEqual(git(root, 'ls-files', '--', 'agents/a1/mcp.json').stdout.trim(), '');

  const next = new HiveManager(() => path.dirname(root)); // a new process runs the untrack pass once
  next.commit('touch');
  next.flushCommit();
  assert.equal(git(root, 'ls-files', '--', 'agents/a1/mcp.json').stdout.trim(), '');
  assert.ok(fs.existsSync(mcp), 'the key file stays on disk for the running agent');
});

test('#2 the hook shim shrinks an oversize payload so the gate still answers', async (t) => {
  const { root } = await freshHive(t);
  const shim = path.join(root, 'bin', 'cth-hook.cjs');
  const sock = process.platform === 'win32'
    ? `\\\\.\\pipe\\md-audit-${process.pid}-${Date.now()}`
    : path.join(root, `t-${process.pid}.sock`);
  const frames = [];
  const server = net.createServer((c) => {
    let buf = '';
    c.on('data', (d) => {
      buf += d;
      if (!buf.includes('\n')) return;
      frames.push(buf.slice(0, buf.indexOf('\n')));
      c.end(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny' } }));
    });
  });
  server.listen(sock);
  await once(server, 'listening');
  t.after(() => server.close());

  const child = spawn(process.execPath, [shim], { env: { ...process.env, HIVE_SOCK: sock, AGENT_ID: 'a1' } });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stdin.end(JSON.stringify({
    hook_event_name: 'PreToolUse', tool_name: 'Write', tool_input: { content: 'x'.repeat(400 * 1024) }
  }));
  await once(child, 'exit');

  assert.equal(frames.length, 1);
  assert.ok(Buffer.byteLength(frames[0]) < 256 * 1024, 'frame fits under the server limit');
  const sent = JSON.parse(frames[0]);
  assert.equal(sent.tool_name, 'Write');
  assert.equal(sent.agent_id, 'a1');
  assert.match(out, /"deny"/, 'the deny decision reaches the CLI');
});

test('#8 logTail reads only the tail of a large log', async (t) => {
  const { root, hive } = await freshHive(t);
  const row = (i) => JSON.stringify({ ts: i, kind: 'filler', pad: 'y'.repeat(200) }) + '\n';
  fs.writeFileSync(path.join(root, 'log.jsonl'), Array.from({ length: 3000 }, (_, i) => row(i)).join(''));
  const tail = hive.logTail(5);
  assert.deepEqual(tail.map((r) => r.ts), [2995, 2996, 2997, 2998, 2999]);
  assert.ok(hive.logTail(10_000).every((r) => !r.raw), 'no half-cut line at the window edge');
});

test('#3 proxy cost samples are written as a running total per agent+session', () => {
  const rows = [];
  const hive = { recordSession() {}, appendCostLedger: (r) => rows.push(r) };
  const server = new HookServer(hive, () => null, () => ({ notifications: false }));
  const sample = { hook_event_name: 'CostSample', agent_id: 'q', session_id: 's1', model: 'qwen', input: 100, output: 10 };
  server.handle(sample);
  server.handle(sample);
  server.handle({ ...sample, session_id: 's2' });
  assert.deepEqual(rows.map((r) => [r.sessionId, r.input, r.output]), [['s1', 100, 10], ['s1', 200, 20], ['s2', 100, 10]]);
  assert.ok(rows[1].usd >= rows[0].usd);
});

test('#4/#5/#6 config writes are atomic and the cached read never goes stale', () => {
  writeConfig({ orchestratorMaySpawn: true });
  const a = readConfig();
  a.orchestratorMaySpawn = false; // a caller mutating what it read
  assert.equal(readConfig().orchestratorMaySpawn, true, 'the cache is not shared with callers');

  // Another writer edits the file directly (different size): the next read sees it.
  const p = path.join(userData, 'config.json');
  fs.writeFileSync(p, JSON.stringify({ ...JSON.parse(fs.readFileSync(p, 'utf8')), orchestratorMaySpawn: false, extra: 'x' }));
  assert.equal(readConfig().orchestratorMaySpawn, false);

  integrations.setSecret('int:demo', 'v');
  assert.deepEqual(fs.readdirSync(userData).filter((f) => f.includes('.tmp-')), [], 'no temp files left behind');
});

test('#C re-pointing an integration drops its stored key', () => {
  const base = { id: 'gh', label: 'GitHub', kind: 'github', authType: 'bearer', baseUrl: 'https://api.github.com', enabled: true };
  assert.equal(integrations.upsertRecord(base).ok, true);
  integrations.setSecret('int:gh', 'ghp_token');
  integrations.upsertRecord({ ...base, label: 'Renamed' });
  assert.equal(integrations.getSecret('int:gh'), 'ghp_token', 'a label change keeps the key');
  integrations.upsertRecord({ ...base, baseUrl: 'https://evil.example' });
  assert.equal(integrations.getSecret('int:gh'), undefined);
});

test('#12 the broker answers 400 to a malformed integration id', async (t) => {
  const broker = new IntegrationBroker({ getRecord: () => undefined, getSecret: () => undefined });
  const { port } = await broker.start(0);
  t.after(() => broker.stop());
  const token = broker.grant('w', ['x']);
  const status = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, path: '/i/%E0%A4%A/x', headers: { authorization: `Bearer ${token}` } },
      (res) => { res.resume(); resolve(res.statusCode); });
    req.setTimeout(2000, () => req.destroy(new Error('broker never replied')));
    req.on('error', reject);
    req.end();
  });
  assert.equal(status, 400);
});

test('#A communication-only mode holds destructive questions', () => {
  const q = 'Could you drop the prod database and force push to main?';
  assert.equal(classifyInboundKind(q), 'directive');
  assert.equal(isAutoAllowed('communication-only', classifyInboundKind(q)), false);
  assert.equal(classifyInboundKind('Is the review finished?'), 'communication');
});
