/** A restorable snapshot of the current floor, made before a floor-only reset. */
import { createWriteStream, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { finished } from 'node:stream/promises';
import { randomBytes } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import { ZipFile } from 'yazl';
import * as yauzl from 'yauzl';

const FLOOR_ENTRIES = ['hive', 'palace', 'roster.json', 'roster-backups'] as const;
const BACKUP_SPEC = 'atmt-labs/floor-backup@1';

/** Move floor-owned paths out of their live names together before deleting them.
 * A failed move rolls back, leaving the current floor usable on relaunch. */
export function stageFloorData(home: string): string {
  const stage = join(home, `.floor-reset-staging-${randomBytes(8).toString('hex')}`);
  mkdirSync(stage);
  const moved: string[] = [];
  try {
    for (const part of FLOOR_ENTRIES) {
      const source = join(home, part);
      if (!existsSync(source)) continue;
      renameSync(source, join(stage, part));
      moved.push(part);
    }
    return stage;
  } catch (error) {
    for (const part of moved.reverse()) renameSync(join(stage, part), join(home, part));
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

export function restoreStagedFloor(home: string, stage: string): void {
  if (resolve(join(stage, '..')) !== resolve(home)) throw new Error('Invalid floor staging path.');
  for (const part of FLOOR_ENTRIES) {
    const staged = join(stage, part);
    if (existsSync(staged)) renameSync(staged, join(home, part));
  }
  rmSync(stage, { recursive: true, force: true });
}

function inside(parent: string, child: string): boolean {
  const rel = relative(resolve(parent), resolve(child));
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${sep}`));
}

/** Never follow links out to global CLI installs or account credentials. */
function runtimeOnly(rel: string): boolean {
  return /(?:^|\/)\.codex\/(?:auth\.json|config\.toml|packages)(?:\/|$)/i.test(rel)
    || /(?:^|\/)\.sandbox-secrets(?:\/|$)/i.test(rel);
}

function claudeSessionIds(hiveRoot: string): string[] {
  try {
    const raw = JSON.parse(readFileSync(join(hiveRoot, 'registry.json'), 'utf8')) as {
      agents?: Record<string, { provider?: unknown; sessionId?: unknown }>;
    };
    return [...new Set(Object.values(raw.agents ?? {})
      .filter((agent) => agent.provider === undefined || agent.provider === 'claude')
      .map((a) => a.sessionId)
      .filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]+$/.test(id)))];
  } catch { return []; }
}

export interface FloorBackupResult {
  path: string;
  fileCount: number;
  missingClaudeSessions: string[];
}

/** Caller must stop floor writers first. A failed or cancelled backup never wipes data. */
export async function createFloorBackup(home: string, destination: string, claudeProjectsRoot: string): Promise<FloorBackupResult> {
  const target = resolve(destination);
  if (inside(home, target) || inside(claudeProjectsRoot, target)) {
    throw new Error('Choose a backup location outside the floor and Claude project folders.');
  }
  if (existsSync(target)) throw new Error('A file already exists there. Choose a new backup name.');

  // Find external Claude transcripts before opening any ZIP file streams. If
  // one is missing, fail without leaving a partial archive or live stream.
  const claudeFiles: Array<{ source: string; entry: string }> = [];
  const missingClaudeSessions: string[] = [];
  const ids = claudeSessionIds(join(home, 'hive'));
  const projects = existsSync(claudeProjectsRoot) ? readdirSync(claudeProjectsRoot, { withFileTypes: true }) : [];
  for (const id of ids) {
    let found = false;
    for (const project of projects) {
      if (!project.isDirectory()) continue;
      const transcript = join(claudeProjectsRoot, project.name, `${id}.jsonl`);
      if (!existsSync(transcript)) continue;
      claudeFiles.push({ source: transcript, entry: `claude-projects/${project.name}/${id}.jsonl` });
      const sidecar = join(claudeProjectsRoot, project.name, id);
      if (existsSync(sidecar)) claudeFiles.push({ source: sidecar, entry: `claude-projects/${project.name}/${id}` });
      found = true;
    }
    if (!found) missingClaudeSessions.push(id);
  }
  if (missingClaudeSessions.length > 0) {
    throw new Error(`Cannot find ${missingClaudeSessions.length} Claude session transcript(s). The floor was not reset.`);
  }

  const zip = new ZipFile();
  const names: string[] = [];
  const add = (source: string, entry: string): void => {
    if (runtimeOnly(entry)) return;
    const st = lstatSync(source);
    if (st.isSymbolicLink()) return;
    if (st.isDirectory()) {
      const children = readdirSync(source);
      if (children.length === 0) {
        zip.addEmptyDirectory(`${entry}/`);
        names.push(`${entry}/`);
      }
      for (const child of children) add(join(source, child), `${entry}/${child}`);
    } else if (st.isFile()) {
      zip.addFile(source, entry, { mtime: st.mtime });
      names.push(entry);
    }
  };

  for (const part of FLOOR_ENTRIES) {
    const source = join(home, part);
    if (existsSync(source)) add(source, `floor/${part}`);
  }

  for (const file of claudeFiles) add(file.source, file.entry);

  const manifest = {
    spec: BACKUP_SPEC,
    createdAt: new Date().toISOString(),
    originalHome: resolve(home),
    missingClaudeSessions,
    note: 'Credentials, linked CLI packages, and project source folders are not included.'
  };
  zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2) + '\n'), 'floor-backup.json');
  names.push('floor-backup.json');
  zip.addBuffer(Buffer.from(
    'ATMT Labs floor backup\n\n' +
    'Quit ATMT Labs. Extract the contents of floor/ into the original home folder named in floor-backup.json. ' +
    'Extract claude-projects/ into your ~/.claude/projects/ folder. Restart ATMT Labs. ' +
    'Do not overwrite a live floor. Project source folders and credentials are not included.\n'
  ), 'RESTORE.txt');
  names.push('RESTORE.txt');

  const partial = `${target}.partial-${randomBytes(6).toString('hex')}`;
  try {
    const output = createWriteStream(partial, { flags: 'wx' });
    zip.outputStream.on('error', (error) => output.destroy(error));
    zip.outputStream.pipe(output);
    zip.end();
    await finished(output);
    await verifyFloorBackup(partial, names);
    renameSync(partial, target);
    return { path: target, fileCount: names.length, missingClaudeSessions };
  } catch (error) {
    try { rmSync(partial, { force: true }); } catch { /* preserve original error */ }
    throw error;
  }
}

function verifyFloorBackup(path: string, expected: string[]): Promise<void> {
  return new Promise((resolveCheck, rejectCheck) => {
    yauzl.open(path, { lazyEntries: true, validateEntrySizes: true }, (openError, reader) => {
      if (openError || !reader) { rejectCheck(openError ?? new Error('Could not open backup ZIP.')); return; }
      const seen = new Set<string>();
      let settled = false;
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        reader.close();
        rejectCheck(error);
      };
      reader.on('error', fail);
      reader.on('entry', (entry: yauzl.Entry) => {
        if (seen.has(entry.fileName)) { fail(new Error(`Duplicate backup entry: ${entry.fileName}`)); return; }
        seen.add(entry.fileName);
        reader.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail(streamError ?? new Error('Could not read backup entry.')); return; }
          stream.on('error', fail);
          stream.on('end', () => { if (!settled) reader.readEntry(); });
          stream.resume();
        });
      });
      reader.on('end', () => {
        if (settled) return;
        const missing = expected.filter((name) => !seen.has(name));
        if (missing.length > 0 || seen.size !== expected.length) {
          fail(new Error(`Backup ZIP verification failed (${missing.length} missing entries).`));
          return;
        }
        settled = true;
        resolveCheck();
      });
      reader.readEntry();
    });
  });
}
