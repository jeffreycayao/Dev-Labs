'use strict';

// Office ATM usage analytics: cumulative ledger rows become per-day increases,
// restarts are detected, rows before the range set the baseline, and the
// renderer's range is validated.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const ua = loadTs('src/shared/office/usageAnalytics.ts');

// Local noon on a given day, so the bucket is never near a midnight edge.
const at = (day, hour = 12) => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, hour).getTime();
};
const row = (agent, session, day, usd, input = 0, output = 0, extra = {}) => ({
  agent_id: agent, session_id: session, ts: at(day, extra.hour), usd, input, output,
  cache_read: extra.cacheRead ?? 0, cache_creation: extra.cacheWrite ?? 0, model: extra.model ?? 'claude-sonnet-4',
});
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('cumulative samples become daily increases per agent', () => {
  const rows = [
    row('a1', 's1', '2026-10-01', 1, 100, 10),
    row('a1', 's1', '2026-10-01', 3, 300, 30, { hour: 15 }),
    row('a1', 's1', '2026-10-02', 4, 400, 40),
    row('a2', 's9', '2026-10-02', 2, 50, 5, { model: 'gpt-5' }),
  ];
  const r = ua.aggregateUsage(rows, { startDate: '2026-10-01', endDate: '2026-10-03' }, { a1: 'Dwight' });
  close(r.totals.totalCost, 6);
  assert.equal(r.totals.input, 450);
  assert.equal(r.totals.totalTokens, 495);
  assert.equal(r.sessions, 2);
  assert.deepEqual(r.byDay.map((d) => d.date), ['2026-10-01', '2026-10-02', '2026-10-03']);
  close(r.byDay[0].totals.totalCost, 3);
  close(r.byDay[1].totals.totalCost, 3);
  assert.equal(r.byDay[2].totals.totalCost, 0);
  assert.equal(r.byAgent[0].agentName, 'Dwight');
  close(r.byAgent[0].totals.totalCost, 4);
  assert.equal(r.byAgent[1].agentName, 'a2'); // falls back to the id
  assert.deepEqual(r.byModel.map((m) => m.model), ['claude-sonnet-4', 'gpt-5']);
});

test('a counter drop is a restart: the new value counts in full', () => {
  const rows = [
    row('a1', 's1', '2026-10-01', 5, 500),
    row('a1', 's1', '2026-10-02', 0.5, 50), // app restarted, same session
    row('a1', 's1', '2026-10-02', 2, 200, 0, { hour: 18 }),
  ];
  const r = ua.aggregateUsage(rows, { startDate: '2026-10-01', endDate: '2026-10-02' });
  close(r.totals.totalCost, 7); // matches costLifetime's sum of segment peaks
  close(r.byDay[1].totals.totalCost, 2);
  assert.equal(r.byDay[1].totals.input, 200);
});

test('rows before the range set the baseline but are not counted', () => {
  const rows = [
    row('a1', 's1', '2026-09-30', 10, 1000),
    row('a1', 's1', '2026-10-01', 12, 1200),
  ];
  const r = ua.aggregateUsage(rows, { startDate: '2026-10-01', endDate: '2026-10-01' });
  close(r.totals.totalCost, 2);
  assert.equal(r.totals.input, 200);
});

test('duplicates and junk rows are ignored', () => {
  const text = [
    JSON.stringify(row('a1', 's1', '2026-10-01', 1, 10)),
    JSON.stringify(row('a1', 's1', '2026-10-01', 1, 10)),
    '{"agent_id":',
    JSON.stringify({ agent_id: 'a1', ts: 'nope', usd: 9 }),
    '',
  ].join('\n');
  const r = ua.aggregateUsage(ua.parseLedgerLines(text), { startDate: '2026-10-01', endDate: '2026-10-01' });
  close(r.totals.totalCost, 1);
  assert.equal(r.sessions, 1);
});

test('the incremental fold gives the same answer as a one-shot fold', () => {
  const rows = [row('a1', 's1', '2026-10-01', 1, 10), row('a1', 's1', '2026-10-02', 3, 30)];
  const range = { startDate: '2026-10-01', endDate: '2026-10-02' };
  const fold = new ua.UsageLedgerFold();
  fold.add(rows[0]);
  fold.query(range);
  fold.add(rows[1]);
  assert.deepEqual(fold.query(range), ua.aggregateUsage(rows, range));
});

test('range validation rejects bad input in plain words', () => {
  assert.equal(ua.validateUsageRange({ startDate: '2026-10-01', endDate: '2026-10-07' }).ok, true);
  for (const bad of [null, {}, { startDate: '2026-10-08', endDate: '2026-10-07' },
    { startDate: '2026-02-31', endDate: '2026-03-01' }, { startDate: '2020-01-01', endDate: '2026-01-01' },
    { startDate: '1/2/2026', endDate: '2026-01-03' }]) {
    const v = ua.validateUsageRange(bad);
    assert.equal(v.ok, false);
    assert.match(v.error, /^[A-Z].*\.$/);
  }
});
