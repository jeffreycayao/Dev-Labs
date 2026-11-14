'use strict';

// Settings → General → Resource use: parsing both process-table formats and the
// CPU/memory math over the app's tree and each agent's tree.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const { parseCpuTime, parsePsTable, parseWinTable, summarizeUsage } = loadTs('src/shared/resourceUsage.ts');

test('ps cumulative time formats', () => {
  assert.equal(parseCpuTime('00:01'), 1);
  assert.equal(parseCpuTime('1:02.50'), 62.5);
  assert.equal(parseCpuTime('01:00:00'), 3600);
  assert.equal(parseCpuTime('2-00:00:01'), 172_801);
});

test('both table formats parse; junk lines are skipped', () => {
  const ps = parsePsTable('  10     1  2048 00:00:03\nbad line\n  11    10  1024 0:01.00\n');
  assert.deepEqual(ps.get(10), { pid: 10, ppid: 1, memBytes: 2048 * 1024, cpuSec: 3 });
  assert.equal(ps.get(11).cpuSec, 1);
  const win = parseWinTable('10 1 1048576 20000000\r\n\r\n11 10 2097152 5000000\r\n');
  assert.deepEqual(win.get(10), { pid: 10, ppid: 1, memBytes: 1048576, cpuSec: 2 });
  assert.equal(win.get(11).cpuSec, 0.5);
});

test('totals cover the whole tree; each agent gets its own subtree; CPU is a rate', () => {
  const MB = 1048576;
  const rows = (cpu) => new Map([
    [1, { pid: 1, ppid: 0, memBytes: 100 * MB, cpuSec: cpu[0] }], // app main
    [2, { pid: 2, ppid: 1, memBytes: 50 * MB, cpuSec: cpu[1] }], // agent A cli
    [3, { pid: 3, ppid: 2, memBytes: 30 * MB, cpuSec: cpu[2] }], // A's MCP server
    [4, { pid: 4, ppid: 1, memBytes: 20 * MB, cpuSec: cpu[3] }], // agent B cli
    [9, { pid: 9, ppid: 7, memBytes: 999 * MB, cpuSec: 99 }] // not ours
  ]);
  const agents = [{ id: 'a', name: 'A', pid: 2 }, { id: 'b', name: 'B', pid: 4 }];
  const first = summarizeUsage(null, { atMs: 0, rows: rows([0, 0, 0, 0]) }, 1, agents, 4);
  assert.equal(first.cpuPct, null, 'no rate without a previous sample');
  assert.equal(first.memMB, 200);
  assert.equal(first.procs, 4);
  const prev = { atMs: 0, rows: rows([0, 0, 0, 0]) };
  const cur = { atMs: 10_000, rows: rows([1, 2, 1, 0]) }; // 4 CPU-seconds in 10s on 4 cores = 10%
  const u = summarizeUsage(prev, cur, 1, agents, 4);
  assert.equal(u.cpuPct, 10);
  assert.deepEqual(u.agents[0], { id: 'a', name: 'A', procs: 2, memMB: 80, cpuPct: 7.5 });
  assert.deepEqual(u.agents[1], { id: 'b', name: 'B', procs: 1, memMB: 20, cpuPct: 0 });
});
