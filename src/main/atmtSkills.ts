/** The first-party ATMT Skills Library. The public catalog is data, never an
 * install URL supplied by the renderer. A catalog entry pins every file to one
 * Git commit and SHA-256 so an install can be checked before an agent sees it. */
import {
  existsSync, lstatSync, readFileSync, readdirSync, mkdirSync, mkdtempSync,
  renameSync, rmSync, statSync, writeFileSync
} from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { request as httpsRequest } from 'node:https';
import { join, dirname, basename, resolve, relative, sep } from 'node:path';
import { homedir } from 'node:os';

const OWNER = 'jeffreycayao';
const REPO = 'atmt_labs_floor_agentskills';
const RAW_ORIGIN = `https://raw.githubusercontent.com/${OWNER}/${REPO}`;
export const ATMT_CATALOG_URL = `${RAW_ORIGIN}/main/catalog.json`;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_CATALOG_BYTES = 512 * 1024;
const MAX_SKILLS = 200;
const MAX_FILES = 60;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_SKILL_BYTES = 2 * 1024 * 1024;
const MAX_FILE_DEPTH = 5;
const METADATA_NAME = '.atmt-skill.json';

export interface CatalogFile { path: string; sha256: string; size: number }
export interface CatalogSkill {
  id: string;
  name: string;
  description: string;
  category: string;
  version: string;
  sourceCommit: string;
  files: CatalogFile[];
  /** Derived from the validated id and pinned commit, never from catalog text. */
  sourceUrl: string;
  /** Claude Code's global skill folder is the current install target. */
  provider: 'claude';
  installedVersion?: string;
  modified?: boolean;
  installState: 'not-installed' | 'installed' | 'update-available' | 'modified' | 'unmanaged' | 'newer-installed';
}
interface CatalogDocument { schemaVersion: 1; publisher: 'ATMT Labs'; skills: CatalogSkill[] }
interface CachedCatalog { catalog: CatalogDocument; fetchedAt: number }
interface InstalledMetadata {
  schemaVersion: 1;
  publisher: 'ATMT Labs';
  id: string;
  version: string;
  sourceCommit: string;
  files: CatalogFile[];
}
export type FetchBytes = (url: string, maxBytes: number) => Promise<Buffer>;
type Options = { homeDir?: string; fetchBytes?: FetchBytes };

const record = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const windowsReserved = (v: string): boolean =>
  /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i.test(v);
const validId = (v: unknown): v is string =>
  typeof v === 'string' && /^[a-z][a-z0-9-]{0,63}$/.test(v) && !windowsReserved(v);
const validVersion = (v: unknown): v is string =>
  typeof v === 'string' && v.length <= 32 &&
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(v) &&
  v.split('.').every((part) => Number.isSafeInteger(Number(part)));
const validCommit = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{40}$/.test(v);
const validText = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\x00-\x1f\x7f]/.test(v);

function validateFiles(id: string, value: unknown): CatalogFile[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FILES) {
    throw new Error(`Invalid files for ${id}`);
  }
  const prefix = `skills/${id}/`;
  const seen = new Set<string>();
  let total = 0;
  return value.map((raw) => {
    if (!record(raw) || typeof raw.path !== 'string' || !raw.path.startsWith(prefix)) {
      throw new Error(`Invalid file path for ${id}`);
    }
    const rel = raw.path.slice(prefix.length);
    const parts = rel.split('/');
    const folded = rel.toLowerCase();
    if (!rel || rel.length > 240 || parts.length > MAX_FILE_DEPTH ||
        parts.some((p) => !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(p) ||
          p.includes('..') || p.endsWith('.') || windowsReserved(p)) ||
        folded === METADATA_NAME || seen.has(folded)) {
      throw new Error(`Unsafe or duplicate file path for ${id}`);
    }
    if (typeof raw.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(raw.sha256) ||
        typeof raw.size !== 'number' || !Number.isSafeInteger(raw.size) ||
        raw.size < 0 || raw.size > MAX_FILE_BYTES) {
      throw new Error(`Invalid file digest or size for ${id}`);
    }
    total += raw.size;
    if (total > MAX_SKILL_BYTES) throw new Error(`Skill ${id} exceeds size limit`);
    seen.add(folded);
    return { path: raw.path, sha256: raw.sha256, size: raw.size };
  });
}

/** Reject the entire catalog on malformed data. Last-good cache remains usable. */
export function validateCatalog(value: unknown): CatalogDocument {
  if (!record(value) || value.schemaVersion !== 1 || value.publisher !== 'ATMT Labs' ||
      !Array.isArray(value.skills) || value.skills.length === 0 || value.skills.length > MAX_SKILLS) {
    throw new Error('Invalid ATMT skills catalog schema');
  }
  const seen = new Set<string>();
  const skills: CatalogSkill[] = value.skills.map((raw) => {
    if (!record(raw) || !validId(raw.id) || seen.has(raw.id) ||
        !validText(raw.name, 100) || !validText(raw.description, 500) ||
        !validText(raw.category, 80) || !validVersion(raw.version) || !validCommit(raw.sourceCommit)) {
      throw new Error('Invalid ATMT skill entry');
    }
    seen.add(raw.id);
    const files = validateFiles(raw.id, raw.files);
    if (!files.some((f) => f.path === `skills/${raw.id}/SKILL.md`)) {
      throw new Error(`Skill ${raw.id} has no SKILL.md`);
    }
    return {
      id: raw.id, name: raw.name, description: raw.description, category: raw.category,
      version: raw.version, sourceCommit: raw.sourceCommit, files,
      sourceUrl: `https://github.com/${OWNER}/${REPO}/blob/${raw.sourceCommit}/skills/${raw.id}/SKILL.md`,
      provider: 'claude', installState: 'not-installed'
    };
  });
  return { schemaVersion: 1, publisher: 'ATMT Labs', skills };
}

/** Fixed-host HTTPS fetch with a byte cap, timeout and no redirect to another
 * origin. Raw GitHub URLs are constructed only from validated manifest fields. */
export function fetchBoundedBytes(url: string, maxBytes: number): Promise<Buffer> {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'raw.githubusercontent.com' ||
      parsed.port || parsed.username || parsed.password || !parsed.pathname.startsWith(`/${OWNER}/${REPO}/`)) {
    return Promise.reject(new Error('Untrusted ATMT skill source'));
  }
  return new Promise((resolve, reject) => {
    const req = httpsRequest(parsed, { headers: { 'user-agent': 'atmt-labs' } }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      const declared = Number(res.headers['content-length']);
      if (Number.isFinite(declared) && declared > maxBytes) {
        res.destroy();
        reject(new Error('Download exceeds size limit'));
        return;
      }
      const chunks: Buffer[] = [];
      let length = 0;
      res.on('data', (chunk: Buffer) => {
        length += chunk.length;
        if (length > maxBytes) res.destroy(new Error('Download exceeds size limit'));
        else chunks.push(chunk);
      });
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.setTimeout(12000, () => req.destroy(new Error('Download timed out')));
    req.end();
  });
}

function parseCache(cachePath: string): CachedCatalog | null {
  try {
    if (!existsSync(cachePath) || statSync(cachePath).size > MAX_CATALOG_BYTES + 64 * 1024) return null;
    const raw: unknown = JSON.parse(readFileSync(cachePath, 'utf8'));
    if (!record(raw) || typeof raw.fetchedAt !== 'number' || !Number.isFinite(raw.fetchedAt) ||
        raw.fetchedAt < 0 || raw.fetchedAt > Date.now() + CACHE_TTL_MS) return null;
    return { fetchedAt: raw.fetchedAt, catalog: validateCatalog(raw.catalog) };
  } catch { return null; }
}

function saveCache(cachePath: string, cached: CachedCatalog): void {
  let temp = '';
  try {
    mkdirSync(dirname(cachePath), { recursive: true });
    temp = `${cachePath}.${randomUUID()}.tmp`;
    writeFileSync(temp, JSON.stringify(cached), { flag: 'wx' });
    renameSync(temp, cachePath);
  } catch { /* Cache persistence is best effort; the fetched catalog still works. */ }
  finally { try { if (temp && existsSync(temp)) rmSync(temp, { force: true }); } catch { /* best effort */ } }
}

function semverParts(v: string): [number, number, number] {
  const [major, minor, patch] = v.split('.').map(Number);
  return [major, minor, patch];
}
function compareVersions(a: string, b: string): number {
  const x = semverParts(a); const y = semverParts(b);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) > (y[i] as number) ? 1 : -1;
  return 0;
}

function validateSkillMarkdown(bytes: Buffer): void {
  let markdown: string;
  try { markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
  catch { throw new Error('SKILL.md is not valid UTF-8'); }
  const frontmatter = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(markdown)?.[1];
  if (!frontmatter || !/^name:[ \t]*\S.*$/m.test(frontmatter) ||
      !/^description:[ \t]*\S.*$/m.test(frontmatter)) {
    throw new Error('SKILL.md is missing name or description frontmatter');
  }
}

function parseMetadata(raw: unknown, id: string): InstalledMetadata | null {
  try {
    if (!record(raw) || raw.schemaVersion !== 1 || raw.publisher !== 'ATMT Labs' ||
        raw.id !== id || !validVersion(raw.version) || !validCommit(raw.sourceCommit)) return null;
    const files = validateFiles(id, raw.files);
    if (!files.some((f) => f.path === `skills/${id}/SKILL.md`)) return null;
    return { schemaVersion: 1, publisher: 'ATMT Labs', id, version: raw.version,
      sourceCommit: raw.sourceCommit, files };
  } catch { return null; }
}

function actualFilesMatch(target: string, meta: InstalledMetadata): boolean {
  const expected = new Map(meta.files.map((f) => [f.path.slice(`skills/${meta.id}/`.length), f]));
  const seen = new Set<string>();
  const walk = (dir: string, depth: number): boolean => {
    if (depth > MAX_FILE_DEPTH) return false;
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) return false;
      if (entry.isDirectory()) { if (!walk(full, depth + 1)) return false; continue; }
      if (!entry.isFile()) return false;
      const rel = relative(target, full).split(sep).join('/');
      if (rel === METADATA_NAME) continue;
      const manifest = expected.get(rel);
      if (!manifest || seen.has(rel)) return false;
      const stat = statSync(full);
      if (stat.size !== manifest.size || stat.size > MAX_FILE_BYTES) return false;
      if (createHash('sha256').update(readFileSync(full)).digest('hex') !== manifest.sha256) return false;
      seen.add(rel);
    }
    return true;
  };
  try { return walk(target, 0) && seen.size === expected.size; } catch { return false; }
}

function pathEntryExists(path: string): boolean {
  try { lstatSync(path); return true; } catch (e) {
    return !record(e) || e.code !== 'ENOENT';
  }
}

function verifiedMetadataAt(target: string, id: string): InstalledMetadata | null {
  try {
    const dir = lstatSync(target);
    if (!dir.isDirectory() || dir.isSymbolicLink()) return null;
    const marker = join(target, METADATA_NAME);
    const markerStat = lstatSync(marker);
    if (!markerStat.isFile() || markerStat.isSymbolicLink() || markerStat.size > 64 * 1024) return null;
    const meta = parseMetadata(JSON.parse(readFileSync(marker, 'utf8')), id);
    return meta && actualFilesMatch(target, meta) ? meta : null;
  } catch { return null; }
}

const installing = new Set<string>();

/** A process crash can happen after the old directory is moved out of the
 * skills root but before the new staged directory takes its place. A fixed
 * backup name lets the next catalog read restore a verified, unmodified copy.
 * An unverified backup is left untouched for manual review. */
function recoverInterruptedUpdate(homeDir: string, id: string): 'none' | 'restored' | 'blocked' {
  if (installing.has(id)) return 'none';
  const root = join(homeDir, '.claude', 'skills');
  const target = join(root, id);
  const backup = join(dirname(root), `.atmt-backup-${id}`);
  if (!pathEntryExists(backup)) return 'none';
  const backupMeta = verifiedMetadataAt(backup, id);
  if (pathEntryExists(target)) {
    // A crash after the new directory was installed can leave the old backup.
    // Retire it only when both directories are verified and the target is newer.
    const targetMeta = verifiedMetadataAt(target, id);
    if (backupMeta && targetMeta && compareVersions(targetMeta.version, backupMeta.version) > 0) {
      try { rmSync(backup, { recursive: true }); } catch { /* leave it for later review */ }
    }
    return 'none';
  }
  if (!backupMeta) return 'blocked';
  try {
    mkdirSync(root, { recursive: true });
    if (lstatSync(root).isSymbolicLink() || pathEntryExists(target)) return 'blocked';
    renameSync(backup, target);
    return 'restored';
  } catch { return 'blocked'; }
}

/** Called before an explicit uninstall. A completed update may have left a
 * verified old backup after a crash; remove it first so deleting the visible
 * target cannot cause the old version to reappear on the next catalog read.
 * Unknown backup contents are never deleted automatically. */
export function prepareAtmtSkillUninstall(
  skillPath: string,
  homeDir: string = homedir()
): { ok: true } | { ok: false; error: string } {
  const id = basename(skillPath);
  if (!validId(id)) return { ok: true };
  const target = join(homeDir, '.claude', 'skills', id);
  const normalize = (path: string) => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path);
  if (normalize(skillPath) !== normalize(target)) return { ok: true };
  if (installing.has(id)) return { ok: false, error: 'That skill is still installing' };
  try {
    // Match uninstallSkill's directory/SKILL.md precheck, including a link to
    // a skill folder: removing that link must not resurrect a prior backup.
    if (!statSync(target).isDirectory() || !existsSync(join(target, 'SKILL.md'))) return { ok: true };
  } catch { return { ok: true }; }
  const backup = join(homeDir, '.claude', `.atmt-backup-${id}`);
  if (!pathEntryExists(backup)) return { ok: true };
  if (!verifiedMetadataAt(backup, id)) {
    return { ok: false, error: 'An interrupted update backup needs review before uninstalling' };
  }
  try { rmSync(backup, { recursive: true }); return { ok: true }; }
  catch { return { ok: false, error: 'Could not clear the verified update backup before uninstalling' }; }
}

function installationStatus(homeDir: string, skill: CatalogSkill): Pick<CatalogSkill, 'installedVersion' | 'modified' | 'installState'> {
  const target = join(homeDir, '.claude', 'skills', skill.id);
  const recovery = recoverInterruptedUpdate(homeDir, skill.id);
  if (recovery === 'blocked') return { installState: 'unmanaged' };
  if (!pathEntryExists(target)) return { installState: 'not-installed' };
  try {
    if (!lstatSync(target).isDirectory() || lstatSync(target).isSymbolicLink()) return { installState: 'unmanaged' };
    const marker = join(target, METADATA_NAME);
    if (!pathEntryExists(marker) || lstatSync(marker).isSymbolicLink() || statSync(marker).size > 64 * 1024) {
      return { installState: 'unmanaged' };
    }
    const meta = parseMetadata(JSON.parse(readFileSync(marker, 'utf8')), skill.id);
    if (!meta) return { installState: 'unmanaged' };
    if (!actualFilesMatch(target, meta)) return { installState: 'modified', installedVersion: meta.version, modified: true };
    const comparison = compareVersions(meta.version, skill.version);
    return { installedVersion: meta.version, modified: false,
      installState: comparison > 0 ? 'newer-installed' : comparison < 0 ? 'update-available' : 'installed' };
  } catch { return { installState: 'unmanaged' }; }
}

function decorate(catalog: CatalogDocument, homeDir: string): CatalogSkill[] {
  return catalog.skills.map((skill) => ({ ...skill, ...installationStatus(homeDir, skill) }));
}

/** Reads a validated last-good catalog when offline. Installed state is always
 * recomputed from disk, including when the catalog comes from cache. */
export async function loadAtmtCatalog(
  cachePath: string,
  opts: Options & { force?: boolean } = {}
): Promise<{ skills: CatalogSkill[]; fetchedAt: number; stale: boolean; error?: string }> {
  const cached = parseCache(cachePath);
  const homeDir = opts.homeDir ?? homedir();
  if (cached && !opts.force && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return { skills: decorate(cached.catalog, homeDir), fetchedAt: cached.fetchedAt, stale: false };
  }
  try {
    const bytes = await (opts.fetchBytes ?? fetchBoundedBytes)(ATMT_CATALOG_URL, MAX_CATALOG_BYTES);
    if (bytes.length > MAX_CATALOG_BYTES) throw new Error('Catalog exceeds size limit');
    const catalog = validateCatalog(JSON.parse(bytes.toString('utf8')));
    const fresh = { catalog, fetchedAt: Date.now() };
    saveCache(cachePath, fresh);
    return { skills: decorate(catalog, homeDir), fetchedAt: fresh.fetchedAt, stale: false };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    if (cached) return { skills: decorate(cached.catalog, homeDir), fetchedAt: cached.fetchedAt, stale: true, error };
    return { skills: [], fetchedAt: 0, stale: true, error };
  }
}

/** Installs or explicitly updates one catalog ID into Claude Code's global
 * skills root. Existing unmanaged or edited folders are never overwritten. */
export async function installAtmtSkill(
  id: string,
  expectedVersion: string,
  expectedSourceCommit: string,
  cachePath: string,
  opts: Options = {}
): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  if (!validId(id)) return { ok: false, error: 'Invalid skill ID' };
  if (!validVersion(expectedVersion) || !validCommit(expectedSourceCommit)) {
    return { ok: false, error: 'Invalid catalog version or commit' };
  }
  if (installing.has(id)) return { ok: false, error: 'That skill is already installing' };
  const homeDir = opts.homeDir ?? homedir();
  if (recoverInterruptedUpdate(homeDir, id) === 'blocked') {
    return { ok: false, error: 'An interrupted update backup needs review before installing' };
  }
  installing.add(id);
  let stage = '';
  try {
    const response = await loadAtmtCatalog(cachePath, { ...opts, force: true });
    const skill = response.skills.find((s) => s.id === id);
    if (!skill) return { ok: false, error: 'Skill is not in the ATMT catalog' };
    if (skill.version !== expectedVersion || skill.sourceCommit !== expectedSourceCommit) {
      return { ok: false, error: 'Catalog changed; refresh the library before installing' };
    }
    const root = join(homeDir, '.claude', 'skills');
    const target = join(root, id);
    if (skill.installState === 'unmanaged') {
      const backup = join(dirname(root), `.atmt-backup-${id}`);
      return { ok: false, error: !pathEntryExists(target) && pathEntryExists(backup)
        ? 'An interrupted update backup needs review before installing'
        : 'A local skill already uses this folder; it will not be overwritten' };
    }
    if (skill.installState === 'modified') return { ok: false, error: 'This ATMT skill has local edits; it will not be overwritten' };
    if (skill.installState === 'newer-installed') return { ok: false, error: 'The installed skill is newer than this catalog' };
    if (skill.installState === 'installed') return { ok: true, path: target };
    mkdirSync(root, { recursive: true });
    if (lstatSync(root).isSymbolicLink()) throw new Error('Skills root is a symbolic link');
    // Staging and backups are siblings of `skills`, so Claude cannot discover
    // an incomplete or temporarily duplicated SKILL.md during installation.
    const stagingParent = dirname(root);
    stage = mkdtempSync(join(stagingParent, `.atmt-stage-${id}-`));
    for (const file of skill.files) {
      const rel = file.path.slice(`skills/${id}/`.length);
      const rawUrl = `${RAW_ORIGIN}/${skill.sourceCommit}/${file.path}`;
      const bytes = await (opts.fetchBytes ?? fetchBoundedBytes)(rawUrl, Math.min(file.size, MAX_FILE_BYTES));
      if (bytes.length !== file.size || createHash('sha256').update(bytes).digest('hex') !== file.sha256) {
        throw new Error(`Integrity check failed for ${rel}`);
      }
      if (rel === 'SKILL.md') validateSkillMarkdown(bytes);
      const destination = join(stage, ...rel.split('/'));
      mkdirSync(dirname(destination), { recursive: true });
      writeFileSync(destination, bytes, { flag: 'wx' });
    }
    const meta: InstalledMetadata = { schemaVersion: 1, publisher: 'ATMT Labs', id,
      version: skill.version, sourceCommit: skill.sourceCommit, files: skill.files };
    writeFileSync(join(stage, METADATA_NAME), JSON.stringify(meta), { flag: 'wx' });
    // Recheck after downloads: a user may have edited or installed this skill
    // while network requests were in flight.
    const now = installationStatus(homeDir, skill);
    if (now.installState !== skill.installState || now.installedVersion !== skill.installedVersion) {
      throw new Error('Skill changed during download; retry after checking the local folder');
    }
    if (skill.installState === 'not-installed') {
      renameSync(stage, target);
      stage = '';
    } else {
      const backup = join(stagingParent, `.atmt-backup-${id}`);
      if (pathEntryExists(backup)) throw new Error('An earlier update backup needs review before updating');
      renameSync(target, backup);
      try {
        renameSync(stage, target);
        stage = '';
      } catch (e) {
        if (!pathEntryExists(target)) renameSync(backup, target);
        throw e;
      }
      try { rmSync(backup, { recursive: true, force: true }); } catch { /* Installed version is complete. */ }
    }
    return { ok: true, path: target };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    try { if (stage && existsSync(stage)) rmSync(stage, { recursive: true, force: true }); } catch { /* stage is not an active skill */ }
    installing.delete(id);
  }
}
