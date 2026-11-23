'use strict';

/**
 * index.ts wiring that only Electron runs, pinned by reading the source: the
 * order of a few calls is the whole fix, and a reorder would be silent.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8');
const body = (name) => {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `${name} not found`);
  return src.slice(start, src.indexOf('\n}\n', start));
};

test('fireAgent kills the terminal before it records the archive', () => {
  const fire = body('fireAgent');
  assert.ok(fire.indexOf('ptyManager.kill(') < fire.indexOf('hive.setArchived(id, true)'),
    'a registry.json that cannot be read must never leave a fired agent running');
  assert.match(fire, /registryFault\(\)/, 'a failed save names registry.json and the error');
});

test('a spawn whose hive setup fails says so instead of continuing silently', () => {
  const spawn = src.slice(src.indexOf("console.error('[hive] ensureAgent failed:'"));
  assert.match(spawn.slice(0, 400), /breakerToast\(/);
});

test('the worker token cap leaves cache reads out, like the per-agent breaker', () => {
  assert.doesNotMatch(body('workerTokensUsed'), /cacheRead/);
});

test('the floor reset cleans Codex links in the STAGED hive', () => {
  assert.match(src, /hive\.removeExposedCodexData\(join\(stage, 'hive'\)\)/);
});

test('open-terminal-here runs cmd.exe by absolute path, never from the chosen folder', () => {
  const handler = src.slice(src.indexOf("ipcMain.handle('terminal:openAtFolder'"));
  const win = handler.slice(0, handler.indexOf("'x-terminal-emulator'"));
  assert.match(win, /join\(process\.env\.SystemRoot \?\? 'C:\\\\Windows', 'System32', 'cmd\.exe'\)/);
  assert.doesNotMatch(win, /\['cmd\.exe'/);
});

test('god is a breaker input (counted in the floor budget) but exempt', () => {
  assert.match(body('runBreakerBeat'), /exempt: true/);
});

test('spawn-requests are signature-checked and limited to agent CLIs', () => {
  const spawn = body('processSpawnRequest');
  assert.match(spawn, /verifySpawnRequest\(/);
  assert.match(spawn, /launch\.fromRequest && !isAllowedWorkerBin\(bin\)/);
});
