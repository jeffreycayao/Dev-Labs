/**
 * ATTITUDE.md on disk: one file per user in the app's userData folder (never in
 * a repo, never in the hive, so agents cannot edit how they are told to talk).
 */
import { app } from 'electron';
import { lstatSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ATTITUDE_MAX_CHARS, normalizeAttitude } from '../shared/attitude';

export function attitudePath(): string {
  return join(app.getPath('userData'), 'ATTITUDE.md');
}

/** The normalised text, or '' when the file is missing, not a regular file or empty. */
export function readAttitude(): string {
  const p = attitudePath();
  try {
    if (!lstatSync(p).isFile()) return '';
    // Read a bounded slice: the cap is in characters, so a few bytes per char is plenty.
    return normalizeAttitude(readFileSync(p, 'utf8').slice(0, ATTITUDE_MAX_CHARS * 4));
  } catch {
    return '';
  }
}

/** Replace the file with the normalised text; an empty text removes it. */
export function writeAttitude(text: unknown): { ok: true; text: string } | { ok: false; error: string } {
  const body = normalizeAttitude(text);
  const p = attitudePath();
  try {
    rmSync(p, { force: true }); // a planted link is removed, never followed
    if (body) writeFileSync(p, body + '\n', { encoding: 'utf8', flag: 'wx' });
    return { ok: true, text: body };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
