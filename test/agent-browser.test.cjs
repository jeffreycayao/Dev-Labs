'use strict';

// Vercel's agent-browser as an owner-controlled capability: the catalog entry's
// shape, the feature switch hiding it from agents (connector and skill alike)
// however the consent is set, and the per-agent browser session.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const loadTs = require('./load-ts.cjs');

const electron = require.resolve('electron');
require.cache[electron] = {
  id: electron, filename: electron, loaded: true,
  exports: { Notification: class { show() {} static isSupported() { return false; } } }
};

const cat = loadTs('src/shared/mcpCatalog.ts');
const features = loadTs('src/shared/features.ts');
const { HiveManager } = loadTs('src/main/hive.ts');

const SKILLS = path.join(__dirname, '..', 'resources', 'skills');
const consent = { 'agent-browser': { enabled: true } };
const build = (feats) => cat.buildMcpServers({ cwd: '/w', consent, getSecret: () => undefined, vars: { agent: 'ana-1' }, features: feats });

test('the catalog entry: pinned npx package, browser tier, off, behind the agentBrowser switch', () => {
  const e = cat.mcpCatalogEntry('agent-browser');
  assert.equal(e.spec.command, 'npx');
  assert.match(e.spec.args.join(' '), /^-y agent-browser@\d+\.\d+\.\d+ mcp$/, 'never an unpinned/latest install');
  assert.equal(e.spec.env.AGENT_BROWSER_SESSION, 'devlabs-<agent>', 'one browser per agent');
  assert.equal(e.tier, 'browser');
  assert.equal(e.defaultEnabled, false);
  assert.equal(e.secret, undefined, 'no key: nothing to store');
  assert.equal(e.feature, 'agentBrowser');
  assert.equal(features.FEATURE_DEFAULTS.agentBrowser, false, 'drives a real browser: off until the owner flips it');
  for (const flag of ['--allow-file-access', '--cdp', '--auto-connect', '--profile']) {
    assert.ok(!e.spec.args.includes(flag), `${flag} is never baked in`);
  }
});

test('switch off = not offered to agents, even with consent on; switch on + consent = a per-agent session', () => {
  const off = build({ agentBrowser: false });
  assert.equal(off.servers['atmt-agent-browser'], undefined);
  assert.deepEqual(off.skipped, [], 'hidden, not "skipped": nothing to warn about');
  assert.equal(build(undefined).servers['atmt-agent-browser'], undefined, 'the default is off');

  const on = build({ agentBrowser: true });
  assert.deepEqual(on.servers['atmt-agent-browser'], {
    command: 'npx', args: ['-y', 'agent-browser@0.43.0', 'mcp'], env: { AGENT_BROWSER_SESSION: 'devlabs-ana-1' }
  });
  // Consent is still required: the switch alone offers nothing.
  const noConsent = cat.buildMcpServers({ cwd: '/w', consent: undefined, getSecret: () => undefined, vars: { agent: 'a' }, features: { agentBrowser: true } });
  assert.equal(noConsent.servers['atmt-agent-browser'], undefined);
});

test('Settings shows the entry only while the switch is on', () => {
  assert.ok(!cat.mcpCatalogFor({ agentBrowser: false }).some((e) => e.id === 'agent-browser'));
  assert.ok(!cat.mcpCatalogFor(undefined).some((e) => e.id === 'agent-browser'));
  assert.ok(cat.mcpCatalogFor({ agentBrowser: true }).some((e) => e.id === 'agent-browser'));
  assert.equal(cat.mcpCatalogFor({ agentBrowser: true }).length, cat.MCP_CATALOG.length, 'nothing else is gated by it');
});

test('every skill a switch controls is a bundled folder; off switches list theirs', () => {
  for (const ids of Object.values(features.FEATURE_SKILLS)) {
    for (const id of ids) assert.ok(fs.existsSync(path.join(SKILLS, id, 'SKILL.md')), id);
  }
  assert.ok(features.excludedSkillIds(undefined).includes('agent-browser'), 'off by default');
  assert.ok(!features.excludedSkillIds(undefined).includes('game-dev-3d'), 'extraSkills is on by default');
  assert.deepEqual(features.excludedSkillIds({ agentBrowser: true }), []);
  assert.ok(features.excludedSkillIds({ extraSkills: false, agentBrowser: true }).includes('game-dev-3d'));
});

test('the agent-browser skill is copied only when the switch is on, and the per-agent session rides in mcp.json', async (t) => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'md-agent-browser-'));
  t.after(() => fs.rmSync(home, { recursive: true, force: true }));
  const hive = new HiveManager(() => home);
  const meta = { id: 'ana-1', name: 'Ana', provider: 'claude', cwd: home };
  const skill = path.join(home, 'hive', 'agents', 'ana-1', '.claude', 'skills', 'agent-browser', 'SKILL.md');
  const mcpJson = path.join(home, 'hive', 'agents', 'ana-1', 'mcp.json');
  const servers = () => (fs.existsSync(mcpJson) ? JSON.parse(fs.readFileSync(mcpJson, 'utf8')).mcpServers : {});

  const off = { agentBrowser: false };
  await hive.ensureAgent(meta, { skillsDir: SKILLS, skillsExclude: features.excludedSkillIds(off), mcpDefaults: consent, features: off });
  assert.equal(fs.existsSync(skill), false, 'skill not copied while off');
  assert.equal(servers()['atmt-agent-browser'], undefined);

  const on = { agentBrowser: true };
  await hive.ensureAgent(meta, { skillsDir: SKILLS, skillsExclude: features.excludedSkillIds(on), mcpDefaults: consent, features: on });
  assert.ok(fs.readFileSync(skill, 'utf8').startsWith('---\nname: agent-browser'), 'skill copied while on');
  assert.equal(servers()['atmt-agent-browser'].env.AGENT_BROWSER_SESSION, 'devlabs-ana-1');

  // Flipping it off again removes the stale copy on the next spawn.
  await hive.ensureAgent(meta, { skillsDir: SKILLS, skillsExclude: features.excludedSkillIds(off), mcpDefaults: consent, features: off });
  assert.equal(fs.existsSync(skill), false);
  assert.equal(servers()['atmt-agent-browser'], undefined);
});
