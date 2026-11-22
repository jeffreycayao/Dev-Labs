'use strict';

// The loopback OTLP collector credits usage/api_errors only to the agent whose
// hook token rode in the `x-devlabs-agent` header, so one agent can't forge
// usage for another and walk its breaker.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const { TelemetryCollector } = loadTs('src/main/telemetry.ts');

const batch = (agentId, output) => ({
  resourceMetrics: [{
    resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
    scopeMetrics: [{ metrics: [{ name: 'claude_code.token.usage', sum: { dataPoints: [{
      asInt: String(output),
      attributes: [
        { key: 'session.id', value: { stringValue: `s-${agentId}` } },
        { key: 'type', value: { stringValue: 'output' } }
      ]
    }] } }] }]
  }]
});

const errorLog = (agentId) => ({
  resourceLogs: [{
    resource: { attributes: [{ key: 'agent.id', value: { stringValue: agentId } }] },
    scopeLogs: [{ logRecords: [{ attributes: [{ key: 'event.name', value: { stringValue: 'api_error' } }] }] }]
  }]
});

async function post(endpoint, kind, body, token) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers['x-devlabs-agent'] = token;
  const r = await fetch(`${endpoint}/v1/${kind}`, { method: 'POST', headers, body: JSON.stringify(body) });
  await r.text();
  return r.status;
}

test('the collector only credits the agent the token proves', async (t) => {
  const tokens = { 'tok-a': 'agent-a', 'tok-b': 'agent-b' };
  const telemetry = new TelemetryCollector({ host: '127.0.0.1', port: 0, resolveAgent: (tok) => tokens[tok] });
  await telemetry.start();
  t.after(() => telemetry.stop());
  const endpoint = telemetry.endpoint();
  const errors = [];
  telemetry.onApiError((id) => errors.push(id));

  assert.equal(await post(endpoint, 'metrics', batch('agent-b', 500)), 401, 'no token');
  assert.equal(await post(endpoint, 'metrics', batch('agent-b', 500), 'forged'), 401, 'unknown token');
  assert.equal(await post(endpoint, 'metrics', batch('agent-b', 500), 'tok-a'), 200);
  assert.equal(telemetry.getAgentUsage('agent-b')?.output ?? 0, 0, 'agent-a cannot report usage for agent-b');
  assert.equal(await post(endpoint, 'logs', errorLog('agent-b'), 'tok-a'), 200);
  assert.deepEqual(errors, [], 'agent-a cannot trip agent-b with api_errors');

  assert.equal(await post(endpoint, 'metrics', batch('agent-b', 7), 'tok-b'), 200);
  assert.equal(telemetry.getAgentUsage('agent-b').output, 7);
  await post(endpoint, 'logs', errorLog('agent-b'), 'tok-b');
  assert.deepEqual(errors, ['agent-b']);
});

test('the agent env carries its token and percent-encodes resource attributes', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src/main/hive.ts'), 'utf8');
  assert.match(src, /OTEL_EXPORTER_OTLP_HEADERS = `x-devlabs-agent=\$\{env\.HIVE_HOOK_TOKEN\}`/);
  assert.match(src, /agent\.id=\$\{encodeURIComponent\(meta\.id\)\},agent\.name=\$\{encodeURIComponent\(meta\.name\)\}/);
  assert.equal(encodeURIComponent('x,agent.id=victim'), 'x%2Cagent.id%3Dvictim');
});
