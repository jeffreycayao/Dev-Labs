/**
 * The default MCP servers' pinned npm packages, installed once into
 * `<userData>/mcp-packages` so agents run them straight from disk.
 *
 * Through `npx -y`, every server of every agent paid for a `cmd.exe` shim and
 * an npm process that resolves the package (a registry check when the spec is
 * not pinned) before the real server even starts — measured on Windows at
 * several extra processes and hundreds of MB per agent. The installed copy is
 * one process. Until the install finishes (or when npm is missing) agents
 * keep using `npx`, so nothing ever waits on it.
 */
import { app } from 'electron';
import { spawn } from 'node:child_process';
import { accessSync, constants, existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { buildMcpServers, type McpNpmPackage } from '../shared/mcpCatalog';
import { resolveCommand } from './shellEnv';

const WIN = process.platform === 'win32';

export function mcpPackagesDir(): string {
  return join(app.getPath('userData'), 'mcp-packages');
}

/** The package's folder in `dir` when the installed version is the pinned one. */
export function installedRoot(dir: string, npm: McpNpmPackage): string | undefined {
  const root = join(dir, 'node_modules', ...npm.pkg.split('/'));
  try {
    return JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version === npm.version ? root : undefined;
  } catch {
    return undefined;
  }
}

/** How to run the installed package: its native binary for this machine when it
 *  ships one, else `node <bin>`. Undefined when it is not installed. */
export function localMcpCommand(dir: string, npm: McpNpmPackage, nodeBin: string): { command: string; args: string[] } | undefined {
  const root = installedRoot(dir, npm);
  if (!root) return undefined;
  if (npm.native) {
    const exe = basename(npm.bin).replace(/\.[cm]?js$/, '') + (WIN ? '.exe' : '');
    let platforms: string[] = [];
    try { platforms = readdirSync(join(dir, 'node_modules', npm.native)); } catch { /* none installed */ }
    for (const p of platforms) {
      const bin = join(dir, 'node_modules', npm.native, p, 'bin', exe);
      try { accessSync(bin, WIN ? constants.F_OK : constants.X_OK); return { command: bin, args: [] }; } catch { /* next */ }
    }
  }
  const script = join(root, npm.bin);
  return existsSync(script) ? { command: nodeBin, args: [script] } : undefined;
}

let nodeBin: string | null = null;
/** Absolute node for the servers (agents' PATH may differ from ours); cached. */
function node(): string {
  if (nodeBin === null) nodeBin = resolveCommand(WIN ? 'node.exe' : 'node');
  return nodeBin;
}

/** `buildMcpServers`' `localPackage` hook: the installed copy, or undefined → npx. */
export function localMcpPackage(npm: McpNpmPackage): { command: string; args: string[] } | undefined {
  return localMcpCommand(mcpPackagesDir(), npm, node());
}

let installing: Promise<void> | null = null;
/** One failed install per run is enough: offline, retrying on every spawn would
 *  only start a doomed npm each time. The next launch tries again. */
let gaveUp = false;

/** Install the pinned packages of the servers this consent map turns on, in the
 *  background, once. Safe to call on every spawn: a no-op when they are all
 *  present or an install is already running. Never throws. */
export function ensureMcpPackages(consent: Parameters<typeof buildMcpServers>[0]['consent'], features?: Parameters<typeof buildMcpServers>[0]['features']): Promise<void> {
  if (installing) return installing;
  if (gaveUp) return Promise.resolve();
  const dir = mcpPackagesDir();
  const wanted: McpNpmPackage[] = [];
  // Ask the catalog which npx servers this consent would write, so the install
  // follows exactly the same on/off rules as an agent's config.
  buildMcpServers({
    cwd: dir,
    consent,
    features,
    getSecret: () => 'present',
    vars: { agent: 'x', node: 'x', resources: 'x', 'obsidian-vault': 'x' },
    localPackage: (npm) => { if (!installedRoot(dir, npm)) wanted.push(npm); return undefined; }
  });
  if (!wanted.length) return Promise.resolve();
  const npm = resolveCommand(WIN ? 'npm.cmd' : 'npm');
  if (!existsSync(npm)) return Promise.resolve(); // no npm: agents keep using npx (or fail as before)
  installing = new Promise<void>((resolveDone) => {
    try {
      mkdirSync(dir, { recursive: true });
      // cwd + `--prefix .` keeps the (possibly spaced) path off the cmd.exe line.
      const args = ['install', '--prefix', '.', '--no-audit', '--no-fund', '--loglevel=error', ...wanted.map((p) => `${p.pkg}@${p.version}`)];
      const child = spawn(WIN ? `"${npm}"` : npm, args, { cwd: dir, shell: WIN, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let err = '';
      child.stderr?.on('data', (d) => { err = (err + String(d)).slice(-2000); });
      const timer = setTimeout(() => { try { child.kill(); } catch { /* gone */ } }, 5 * 60_000);
      child.on('exit', (code) => {
        clearTimeout(timer);
        if (code === 0) console.log(`[mcp] installed ${wanted.map((p) => p.pkg).join(', ')} into ${dir}`);
        else gaveUp = true;
        if (code !== 0) console.warn(`[mcp] package install exited ${code}; agents keep using npx. ${err.trim()}`);
        installing = null;
        resolveDone();
      });
      child.on('error', (e) => { console.warn('[mcp] package install failed:', e.message); gaveUp = true; installing = null; resolveDone(); });
    } catch (e) {
      console.warn('[mcp] package install failed:', e);
      installing = null;
      resolveDone();
    }
  });
  return installing;
}
