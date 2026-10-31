/**
 * Integrations registry + encrypted secret store (Phase 2 foundation, main process).
 *
 * Two responsibilities, deliberately separated from the broker:
 *   1. Registry — config-backed CRUD over IntegrationRecord metadata (NO secrets).
 *   2. Secret store — secrets ENCRYPTED AT REST via Electron `safeStorage`, kept in a
 *      file SEPARATE from config.json, decrypted only here, only in main.
 *
 * The broker (src/main/integrationBroker.ts) is electron-free and receives `getRecord`
 * + `getSecret` from here by injection, so it stays unit-testable without electron.
 *
 * SECURITY: a secret is never written unless `safeStorage.isEncryptionAvailable()`
 * (fail closed — no plaintext fallback), never returned to the renderer, never logged,
 * never placed in agent env/transcript, never echoed in any response. Records carry
 * only a `secretRef` handle.
 *
 * Contract: hive/docs/integrations-spec.md.
 */
import { app, safeStorage } from 'electron';
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { basename, dirname, join } from 'node:path';
import {
  type IntegrationRecord,
  validateIntegrationRecord,
  authTypeNeedsSecret,
  secretRefFor
} from '../shared/integrations';
import { copyAsideUnreadable, readConfig, writeConfig } from './config';

// ─── Registry (config-backed) ────────────────────────────────────────────────

/** All registered integration records (metadata only). */
export function listRecords(): IntegrationRecord[] {
  return readConfig().integrations ?? [];
}

/** Look up one record by id. */
export function getRecord(id: string): IntegrationRecord | undefined {
  return listRecords().find((r) => r.id === id);
}

/** Ids of integrations a worker may use right now (enabled, and — for secret auth —
 *  actually holding a stored secret). This is the default capability scope granted to
 *  every ephemeral worker. */
export function enabledIds(): string[] {
  return listRecords()
    .filter((r) => r.enabled && (!authTypeNeedsSecret(r.authType) || hasSecret(r.secretRef)))
    .map((r) => r.id);
}

/** Create or replace a record (validated). Stamps createdAt/updatedAt; preserves the
 *  original createdAt on update. Drops the stored secret when where/how it is sent
 *  changes, so a re-pointed baseUrl can never receive the old key. */
export function upsertRecord(input: unknown): { ok: true; record: IntegrationRecord } | { ok: false; error: string } {
  const v = validateIntegrationRecord(input);
  if (!v.ok) return v;
  const now = Date.now();
  const existing = getRecord(v.value.id);
  if (existing && (existing.baseUrl !== v.value.baseUrl || existing.authType !== v.value.authType
    || existing.authHeader !== v.value.authHeader)) {
    deleteSecret(existing.secretRef ?? secretRefFor(existing.id));
  }
  const record: IntegrationRecord = {
    ...v.value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now
  };
  const next = listRecords().filter((r) => r.id !== record.id);
  next.push(record);
  writeConfig({ integrations: next });
  return { ok: true, record };
}

/** Remove a record AND its stored secret. */
export function removeRecord(id: string): { ok: boolean } {
  const next = listRecords().filter((r) => r.id !== id);
  writeConfig({ integrations: next });
  deleteSecret(secretRefFor(id));
  return { ok: true };
}

/** Records with the secretRef redacted to a boolean — the renderer-safe shape. */
export function listRecordsRedacted(): Array<Omit<IntegrationRecord, 'secretRef'> & { hasSecret: boolean }> {
  return listRecords().map(({ secretRef, ...rest }) => ({ ...rest, hasSecret: !!secretRef && hasSecret(secretRef) }));
}

// ─── Secret store (encrypted at rest) ────────────────────────────────────────

function secretsPath(): string {
  return join(app.getPath('userData'), 'integration-secrets.json');
}

let secretsCopy: string | undefined; // one copy per run, not one per refused write

/** `forWrite` throws instead of returning {} when the file exists but cannot be
 *  read: saving {} + one key would wipe every other stored key. */
function readSecretBlob(forWrite = false): Record<string, string> {
  const p = secretsPath();
  if (!existsSync(p)) return {};
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf8'));
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, string>) : {};
  } catch (e) {
    if ((e as NodeJS.ErrnoException)?.code === 'ENOENT' || !forWrite) return {};
    const copy = (secretsCopy ??= copyAsideUnreadable(p));
    throw new Error('The saved connector keys file could not be read, so the key was not saved (nothing was overwritten).'
      + (copy ? ` A copy was saved as ${basename(copy)}.` : '') + ' Fix or remove integration-secrets.json, then try again.');
  }
}

function writeSecretBlob(blob: Record<string, string>): void {
  const p = secretsPath();
  mkdirSync(dirname(p), { recursive: true });
  // Temp + rename: a torn write reads as {} and would drop every stored key.
  const tmp = `${p}.tmp-${randomBytes(4).toString('hex')}`;
  try {
    writeFileSync(tmp, JSON.stringify(blob, null, 2), { encoding: 'utf8', mode: 0o600 });
    renameSync(tmp, p);
  } catch (e) {
    try { rmSync(tmp, { force: true }); } catch { /* the tmp file is disposable */ }
    throw e;
  }
}

/** Store a secret ENCRYPTED. Fail closed if OS encryption is unavailable (never
 *  writes plaintext). The plaintext is used only to encrypt and is not retained. */
export function setSecret(secretRef: string, plaintext: string): { ok: boolean; error?: string } {
  if (!secretRef) return { ok: false, error: 'secretRef required' };
  if (typeof plaintext !== 'string' || plaintext === '') return { ok: false, error: 'secret required' };
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      return { ok: false, error: 'OS secret encryption is unavailable; refusing to store a secret in plaintext' };
    }
    const cipher = safeStorage.encryptString(plaintext).toString('base64');
    const blob = readSecretBlob(true);
    blob[secretRef] = cipher;
    writeSecretBlob(blob);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Decrypt a secret. MAIN-INTERNAL ONLY — never expose this over IPC. Returns
 *  undefined if absent or undecryptable (the broker maps that to 503 no_secret). */
export function getSecret(secretRef: string | undefined): string | undefined {
  if (!secretRef) return undefined;
  const cipher = readSecretBlob()[secretRef];
  if (!cipher) return undefined;
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    return safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    return undefined;
  }
}

/** Whether a secret is stored for this ref (no decryption). */
export function hasSecret(secretRef: string | undefined): boolean {
  if (!secretRef) return false;
  return !!readSecretBlob()[secretRef];
}

/** Delete a stored secret. Idempotent. */
export function deleteSecret(secretRef: string | undefined): void {
  if (!secretRef) return;
  const blob = readSecretBlob();
  if (secretRef in blob) {
    delete blob[secretRef];
    if (Object.keys(blob).length === 0) {
      try { rmSync(secretsPath(), { force: true }); } catch { /* best-effort */ }
    } else {
      writeSecretBlob(blob);
    }
  }
}
