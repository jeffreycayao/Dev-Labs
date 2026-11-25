'use strict';

/**
 * Regression tests for the third repo audit (v4.8.4). Each test pins one fix:
 * an agent-writable file that main used to trust, or a counter that drifted.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const loadTs = require('./load-ts.cjs');

const { HiveManager } = loadTs('src/main/hive.ts');
const { TelemetryCollector } = loadTs('src/main/telemetry.ts');
const { CircuitBreaker } = loadTs('src/main/breaker.ts');
const { getStatus } = loadTs('src/main/git.ts');
const { writeFileText } = loadTs('src/main/fs.ts');
const { CumulativeSampleGate } = loadTs('src/main/usage.ts');

function tmp(t, prefix) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return dir;
}

async function floor(t) {
  const home = tmp(t, 'md-audit3-');
  const hive = new HiveManager(() => home);
  await hive.ensureAgent({ id: 'god-1', name: 'Ramon', provider: 'claude', cwd: home, isGod: true });
  await hive.ensureAgent({ id: 'w1', name: 'Worker', provider: 'claude', cwd: home });
  const regPath = path.join(home, 'hive', 'registry.json');
  const editRegistry = (fn) => {
    const reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
    fn(reg);
    fs.writeFileSync(regPath, JSON.stringify(reg));
  };
  return { home, hive, editRegistry };
}

test('an agent that names itself god in registry.json gets neither god mail nor god rights', async (t) => {
  const { hive, editRegistry } = await floor(t);
  editRegistry((reg) => { reg.godId = 'w1'; reg.agents.w1.isGod = true; });
  assert.equal(hive.isGod('w1'), false);
  assert.equal(hive.isGod('god-1'), true);
  hive.send({ to: 'human', act: 'inform', subject: 'for the human', body: 'b' }, 'w1');
  assert.ok(hive.inbox('god-1').some((m) => m.subject === 'for the human'), 'human mail still reaches Ramon');
  assert.equal(hive.inbox('w1').some((m) => m.subject === 'for the human'), false, 'the impostor got human mail');
});

test('a session id planted in registry.json never reaches a restart command line', async (t) => {
  const { hive, editRegistry } = await floor(t);
  editRegistry((reg) => { reg.agents.w1.sessionId = 'a" & calc & "'; });
  assert.equal(hive.lastSession('w1'), undefined);
  editRegistry((reg) => { reg.agents.w1.sessionId = '0b8e3c1a-1f2d-4c5b-9a7e-123456789abc'; });
  assert.equal(hive.lastSession('w1'), '0b8e3c1a-1f2d-4c5b-9a7e-123456789abc');
});

test('telemetry keeps one agent\'s spend out of another agent\'s session', async (t) => {
  const tokens = { 'tok-a': 'agent-a', 'tok-b': 'agent-b' };
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0, resolveAgent: (tok) => tokens[tok] });
  await telemetry.start();
  t.after(() => telemetry.stop());
  const batch = (agentId, sessionId, output) => ({
    resourceMetrics: [{
      resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
      scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [{
        asInt: String(output),
        attributes: [
          { key: 'session.id', value: { stringValue: sessionId } },
          { key: 'type', value: { stringValue: 'output' } }
        ]
      }] } }] }]
    }]
  });
  const post = async (body, token) => {
    const r = await fetch(`${telemetry.endpoint()}/v1/metrics`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-devlabs-agent': token }, body: JSON.stringify(body)
    });
    await r.text();
  };
  await post(batch('agent-b', 's-b', 10), 'tok-b');
  await post(batch('agent-a', 's-b', 5000), 'tok-a'); // A reports under B's (readable) session id
  assert.equal(telemetry.getAgentUsage('agent-b').output, 10, 'A\'s tokens landed in B\'s total');
  telemetry.forgetAgent('agent-a');
  assert.equal(telemetry.getAgentUsage('agent-b').output, 10, 'tearing A down wiped B\'s session');
});

test('the cost ledger gets one row per live session, and idle beats add none', () => {
  const gate = new CumulativeSampleGate();
  const row = (sessionId, usd) => ({ agentId: 'a', sessionId, ts: 0, input: 0, output: 0, cacheRead: 0, cacheCreation: 0, model: 'm', usd });
  assert.equal(gate.admits(row('s1', 5)), true);
  assert.equal(gate.admits(row('s2', 1)), true, 'a second session is its own row');
  assert.equal(gate.admits(row('s1', 5)), false, 'an unchanged session is not re-written');
  assert.equal(gate.admits(row('s2', 1)), false);
  gate.forget('a');
  assert.equal(gate.admits(row('s1', 5)), true);
});

test('no-progress needs back-to-back bursts: an idle beat in between resets it', () => {
  const b = new CircuitBreaker(() => ({ enabled: true, hardStop: false, repeatedToolLimit: 8, errorStormLimit: 5, tokenVelocityPerMin: 60000 }));
  const T0 = 1_000_000_000_000;
  const BEAT = 30_000;
  const s = (ts, output) => ({ agentId: 'a', sessionId: 's1', ts, input: 1000, output, cacheRead: 0, cacheCreation: 0, model: 'm', usd: 0 });
  const beat = (sample, now) => b.tick([{ agentId: 'a', sample, progressing: false }], now)[0];
  beat(s(T0, 0), T0);
  beat(s(T0 + BEAT, 500), T0 + BEAT);           // burst, no progress: count 1
  beat(s(T0 + 2 * BEAT, 500), T0 + 2 * BEAT);   // idle: no new output
  const d = beat(s(T0 + 3 * BEAT, 1000), T0 + 3 * BEAT); // burst again
  assert.equal(d.state.level, 'healthy', `tripped across an idle gap: ${d.state.reason}`);
});

test('git status after a rename lists the new path once, with no phantom entry', async (t) => {
  const repo = tmp(t, 'md-audit3-git-');
  const git = (...args) => execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd: repo, stdio: 'pipe' });
  git('init', '-q');
  fs.writeFileSync(path.join(repo, 'a.txt'), 'hello\n');
  git('add', 'a.txt');
  git('commit', '-qm', 'init');
  git('mv', 'a.txt', 'b.txt');
  const st = await getStatus(repo);
  assert.ok(!('error' in st), st.error);
  const paths = [...st.staged, ...st.unstaged].map((e) => e.path);
  assert.deepEqual([...new Set(paths)], ['b.txt'], `unexpected entries: ${paths.join(', ')}`);
});

test('an IDE save is refused when the file changed on disk since it was opened', async (t) => {
  const root = tmp(t, 'md-audit3-fs-');
  fs.writeFileSync(path.join(root, 'app.ts'), 'v1');
  fs.writeFileSync(path.join(root, 'app.ts'), 'agent edit'); // an agent rewrote it after the editor loaded 'v1'
  const refused = await writeFileText(root, 'app.ts', 'my edit', 'v1');
  assert.equal(refused.ok, false);
  assert.equal(fs.readFileSync(path.join(root, 'app.ts'), 'utf8'), 'agent edit', 'the agent\'s work was overwritten');
  const saved = await writeFileText(root, 'app.ts', 'my edit', 'agent edit');
  assert.equal(saved.ok, true);
  assert.equal(fs.readFileSync(path.join(root, 'app.ts'), 'utf8'), 'my edit');
});
