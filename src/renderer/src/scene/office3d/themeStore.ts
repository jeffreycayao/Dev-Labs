/**
 * Office themes on this computer: apply a validated theme to one floor's saved
 * furniture, keeping ONE backup of what was there so the import can be undone.
 *
 * Pure over a storage-like object (localStorage in the app, a Map in tests) and
 * written against the same key the scene reads (`STORAGE_KEY` + namespace), so
 * the scene only has to remount to show the result — no edits in retro-office.
 */
import { STORAGE_KEY } from '../../features/retro-office/core/constants';
import type { OfficeTheme, OfficeThemeItem } from '@shared/officeTheme';

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type StoredFurniture = OfficeThemeItem & { _uid: string };

/** Mirrors retro-office's `resolveStorageKey` (persistence.ts). */
export function furnitureKey(namespace: string): string {
  return namespace === 'default' ? STORAGE_KEY : `${STORAGE_KEY}:${namespace}`;
}
export function backupKey(namespace: string): string {
  return `${furnitureKey(namespace)}:theme-backup`;
}

export function readFurniture(ls: StorageLike, namespace: string): StoredFurniture[] | null {
  try {
    const raw = ls.getItem(furnitureKey(namespace));
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) ? (parsed as StoredFurniture[]) : null;
  } catch {
    return null;
  }
}

let uidCounter = 0;
const freshUid = (): string => `fi_${Date.now()}_t${uidCounter++}`;

/**
 * Replace the floor's saved layout with the theme's items (fresh runtime uids),
 * after writing the previous layout to the backup slot. Returns the items as
 * stored, so the caller can map theme `id`s to the new uids for seats.
 */
export function applyTheme(ls: StorageLike, namespace: string, theme: OfficeTheme): StoredFurniture[] {
  const previous = readFurniture(ls, namespace) ?? [];
  ls.setItem(backupKey(namespace), JSON.stringify({ at: Date.now(), items: previous }));
  const items: StoredFurniture[] = theme.items.map((it) => ({ ...it, _uid: freshUid() }));
  ls.setItem(furnitureKey(namespace), JSON.stringify(items));
  return items;
}

export function hasBackup(ls: StorageLike, namespace: string): boolean {
  return ls.getItem(backupKey(namespace)) !== null;
}

/** Put the backed-up layout back and consume the backup. null when there is
 *  none, or it is unreadable (the current layout is then left alone). */
export function revertTheme(ls: StorageLike, namespace: string): StoredFurniture[] | null {
  try {
    const raw = ls.getItem(backupKey(namespace));
    if (raw === null) return null;
    const parsed = JSON.parse(raw) as { items?: unknown };
    if (!Array.isArray(parsed.items)) return null;
    ls.setItem(furnitureKey(namespace), JSON.stringify(parsed.items));
    ls.removeItem(backupKey(namespace));
    return parsed.items as StoredFurniture[];
  } catch {
    return null;
  }
}
