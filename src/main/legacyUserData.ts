/**
 * One-time carry-over of the userData folder across app renames.
 *
 * Electron names userData after the app, so renaming (ATMT LAB → ATMT Labs)
 * silently starts from an empty folder: onboarding again, no agents, no config.
 * Imported FIRST in main/index.ts (side effect at import time) so it runs before
 * any module reads config.json or opens harness.db.
 *
 * Copies only when the current folder has no data yet; caches are skipped and
 * the legacy folder is left untouched.
 */
import { app } from 'electron';
import { cpSync, existsSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

/** Earlier userData folder names of this app, newest first. */
const LEGACY_NAMES = ['atmt-lab'];

const SKIP = new Set([
  'Cache', 'Code Cache', 'GPUCache', 'DawnGraphiteCache', 'DawnWebGPUCache',
  'Shared Dictionary', 'blob_storage', 'Crashpad'
]);

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

migrateLegacyUserData();
