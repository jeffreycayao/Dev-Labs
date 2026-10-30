/**
 * One-time carry-over of the userData folder across app renames.
 *
 * Electron names userData after the app, so a rename (ATMT LAB → ATMT Labs →
 * Jepoy Floor AI → DevLabs) silently starts from an empty folder: onboarding again, no
 * agents, no config.
 * Imported FIRST in main/index.ts (side effect at import time) so it runs before
 * any module reads config.json or opens harness.db.
 *
 * Copies only when the current folder has no data yet; caches are skipped and
 * the legacy folder is otherwise left untouched.
 *
 * Also removes the sign-in leftovers of the v2 account era: `license.json` held
 * an encrypted refresh token for the retired account service
 * (auth.labs.atmt.dev). v3 dropped sign-in but never deleted the file, so it is
 * never carried over, and it is removed from the current and legacy folders.
 */
import { app } from 'electron';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Earlier userData folder names of this app, newest first. */
const LEGACY_NAMES = ['Jepoy Floor AI', 'ATMT Labs', 'atmt-lab'];

const SKIP = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'Shared Dictionary', 'blob_storage', 'Crashpad',
  // Retired account-service token (see above). Never copy it forward.
  'license.json'
]);

/** Files left behind by the retired sign-in, deleted wherever they are found. */
const RETIRED_AUTH_FILES = ['license.json'];

const hasData = (dir: string): boolean =>
  existsSync(join(dir, 'config.json')) || existsSync(join(dir, 'harness.db'));

export function migrateLegacyUserData(): string | null {
  try {
    const target = app.getPath('userData');
    if (hasData(target)) return null;
    for (const name of LEGACY_NAMES) {
      const src = join(dirname(target), name);
      if (src === target || !hasData(src)) continue;
      cpSync(src, target, {
        recursive: true,
        force: false,
        errorOnExist: false,
        filter: (p) => p === src || !SKIP.has(basename(p))
      });
      console.log(`[userData] carried over ${src} → ${target}`);
      return src;
    }
  } catch (e) {
    console.warn('[userData] legacy carry-over skipped:', e);
  }
  return null;
}

/** Delete retired sign-in tokens from the current and legacy userData folders. */
export function removeRetiredAuthData(): number {
  let removed = 0;
  try {
    const target = app.getPath('userData');
    const dirs = [target, ...LEGACY_NAMES.map((n) => join(dirname(target), n))];
    for (const dir of dirs) {
      for (const f of RETIRED_AUTH_FILES) {
        const p = join(dir, f);
        if (!existsSync(p)) continue;
        rmSync(p, { force: true });
        removed += 1;
      }
    }
    if (removed) console.log(`[userData] removed ${removed} retired sign-in file(s)`);
  } catch (e) {
    console.warn('[userData] retired sign-in cleanup skipped:', e);
  }
  return removed;
}

migrateLegacyUserData();
removeRetiredAuthData();
