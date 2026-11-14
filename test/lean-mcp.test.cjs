'use strict';

// Lean agents: the MCP servers that duplicate Claude Code's own tools are off
// (and switched off once for existing installs), and the pinned npx servers
// run from DevLabs' one-time install instead of through npx.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'devlabs-lean-mcp-'));
const configFile = path.join(userData, 'config.json');
const electron = require.resolve('electron');
require.cache[electron] = { id: electron, filename: electron, loaded: true, exports: { app: { getPath: () => userData } } };

const { readConfig } = loadTs('src/main/config.ts');
const cat = loadTs('src/shared/mcpCatalog.ts');
const { localMcpCommand, installedRoot } = loadTs('src/main/mcpPackages.ts');
test.after(() => fs.rmSync(userData, { recursive: true, force: true }));

const DUPES = ['filesystem', 'git', 'time', 'fetch'];

test('existing installs: built-in duplicates switched off once, the rest kept, a later choice sticks', () => {
  const mcpDefaults = {};
  for (const e of cat.MCP_CATALOG) mcpDefaults[e.id] = { enabled: e.tier === 'safe-readonly' || e.id === 'webcake-landing' };
  fs.writeFileSync(configFile, JSON.stringify({ onboardingComplete: true, harnessHome: 'C:\\agents', triggersMigratedV1: true, modelDefaultsV2: true, mcpDefaults }));
  const cfg = readConfig();
  for (const id of DUPES) assert.equal(cfg.mcpDefaults[id].enabled, false, id);
  assert.equal(cfg.mcpDefaults['sequential-thinking'].enabled, true);
  assert.equal(cfg.mcpDefaults.context7.enabled, true);
  assert.equal(cfg.mcpDefaults['webcake-landing'].enabled, true, 'a consented connector is not touched');
  const stored = JSON.parse(fs.readFileSync(configFile, 'utf8'));
  assert.equal(stored.leanMcpV1, true);
  stored.mcpDefaults.git = { enabled: true };
  fs.writeFileSync(configFile, JSON.stringify(stored));
  assert.equal(readConfig().mcpDefaults.git.enabled, true, 'switching one back on is respected');
});

test('new installs: duplicates are off by default', () => {
  const d = cat.defaultMcpDefaults();
  for (const id of DUPES) assert.equal(d[id].enabled, false, id);
});

test('a pinned npx server runs from the installed copy, keeping its own args', () => {
  const ab = cat.MCP_CATALOG.find((e) => e.id === 'agent-browser');
  const local = (npm) => npm.pkg === 'agent-browser' ? { command: '/x/agent-browser', args: [] } : { command: 'node', args: [`/pk/${npm.pkg}/${npm.bin}`] };
  const r = cat.buildMcpServers({ cwd: '/w', consent: undefined, getSecret: () => undefined, vars: { agent: 'a1' }, features: { agentBrowser: true }, localPackage: local });
  assert.deepEqual(r.servers['atmt-agent-browser'], { command: '/x/agent-browser', args: ['mcp'], env: { AGENT_BROWSER_SESSION: 'devlabs-a1' } });
  assert.deepEqual(r.servers['atmt-context7'], { command: 'node', args: ['/pk/@upstash/context7-mcp/dist/index.js'] });
  assert.ok(ab.npm && ab.spec.args.includes(`${ab.npm.pkg}@${ab.npm.version}`), 'npx fallback uses the same pinned version');
  const viaNpx = cat.buildMcpServers({ cwd: '/w', consent: undefined, getSecret: () => undefined, localPackage: () => undefined });
  assert.equal(viaNpx.servers['atmt-context7'].command, 'npx');
});

test('every npx default pins an exact version', () => {
  for (const e of cat.MCP_CATALOG) {
    if (!e.npm) continue;
    assert.match(e.npm.version, /^\d+\.\d+\.\d+$/, e.id);
    assert.ok(e.spec.args.includes(`${e.npm.pkg}@${e.npm.version}`), e.id);
  }
});

test('localMcpCommand: version must match; native binary beats the JS launcher', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'devlabs-mcp-pk-'));
  const npm = { pkg: 'agent-browser', version: '0.43.0', bin: 'bin/agent-browser.js', native: '@agent-browser' };
  const root = path.join(dir, 'node_modules', 'agent-browser');
  fs.mkdirSync(path.join(root, 'bin'), { recursive: true });
  fs.writeFileSync(path.join(root, 'bin', 'agent-browser.js'), '');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.42.0' }));
  assert.equal(installedRoot(dir, npm), undefined, 'an older install is not used');
  fs.writeFileSync(path.join(root, 'package.json'), JSON.stringify({ version: '0.43.0' }));
  assert.deepEqual(localMcpCommand(dir, npm, 'NODE'), { command: 'NODE', args: [path.join(root, 'bin', 'agent-browser.js')] });
  const exe = path.join(dir, 'node_modules', '@agent-browser', 'cli-test', 'bin', process.platform === 'win32' ? 'agent-browser.exe' : 'agent-browser');
  fs.mkdirSync(path.dirname(exe), { recursive: true });
  fs.writeFileSync(exe, '');
  fs.chmodSync(exe, 0o755);
  assert.deepEqual(localMcpCommand(dir, npm, 'NODE'), { command: exe, args: [] });
  fs.rmSync(dir, { recursive: true, force: true });
});
