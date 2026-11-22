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

/** Look up one record by id. config.json is agent-writable, so the secretRef is
 *  re-derived from the id: a record can never point at another key's ref. */
export function getRecord(id: string): IntegrationRecord | undefined {
  const r = listRecords().find((rec) => rec.id === id);
  return r && { ...r, secretRef: authTypeNeedsSecret(r.authType) ? secretRefFor(r.id) : undefined };
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

// An integration key (`int:<id>`) is sealed together with the origin it was saved for.
// config.json is agent-writable, so an edited baseUrl must not receive the old key.
const BOUND = '\u0001origin:';
const isIntegrationRef = (ref: string): boolean => ref.startsWith(secretRefFor(''));

function originOf(url: string | undefined): string | undefined {
  try { return url ? new URL(url).origin : undefined; } catch { return undefined; }
}

const sealBound = (origin: string, secret: string): string =>
  safeStorage.encryptString(`${BOUND}${origin}\n${secret}`).toString('base64');

/** Thrown by getSecret when an integration's address no longer matches its key. */
export class SecretOriginMismatchError extends Error {
  readonly code = 'origin_mismatch';
  constructor() {
    super('This connection\'s address changed after its key was saved, so the key was not sent. '
      + 'Re-save the key in Settings → Connections.');
  }
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
    const blob = readSecretBlob(true);
    if (isIntegrationRef(secretRef)) {
      const origin = originOf(listRecords().find((r) => secretRefFor(r.id) === secretRef)?.baseUrl);
      if (!origin) return { ok: false, error: 'Save the connection first, then add its key.' };
      blob[secretRef] = sealBound(origin, plaintext);
    } else {
      blob[secretRef] = safeStorage.encryptString(plaintext).toString('base64');
    }
    writeSecretBlob(blob);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/** Decrypt a secret. MAIN-INTERNAL ONLY — never expose this over IPC. Returns
 *  undefined if absent or undecryptable (the broker maps that to 503 no_secret).
 *  Throws SecretOriginMismatchError when an integration key's sealed origin is not
 *  the one it is about to be sent to. Callers that SEND the key must pass
 *  `sendOrigin` = the origin of the exact URL they will request: re-reading
 *  config.json here would let an agent swap baseUrl between the caller's read
 *  and this one. Without it, the record's current baseUrl is used (display only). */
export function getSecret(secretRef: string | undefined, sendOrigin?: string): string | undefined {
  if (!secretRef) return undefined;
  const cipher = readSecretBlob()[secretRef];
  if (!cipher) return undefined;
  let plain: string;
  try {
    if (!safeStorage.isEncryptionAvailable()) return undefined;
    plain = safeStorage.decryptString(Buffer.from(cipher, 'base64'));
  } catch {
    return undefined;
  }
  if (!plain.startsWith(BOUND)) {
    // An unbound integration key is one bindLegacySecrets has not sealed yet.
    if (isIntegrationRef(secretRef)) throw new SecretOriginMismatchError();
    return plain;
  }
  const nl = plain.indexOf('\n', BOUND.length);
  const origin = plain.slice(BOUND.length, nl);
  if (isIntegrationRef(secretRef)) {
    const target = sendOrigin ?? originOf(listRecords().find((r) => secretRefFor(r.id) === secretRef)?.baseUrl);
    if (!target || target !== origin) throw new SecretOriginMismatchError();
  }
  return plain.slice(nl + 1);
}

/** One-time startup migration: seal integration keys saved before origin binding to
 *  the origin config.json names right now. Run in main before any agent starts;
 *  tampering that happened before this release can't be detected. */
export function bindLegacySecrets(): void {
  try {
    if (!safeStorage.isEncryptionAvailable()) return;
    const blob = readSecretBlob(true);
    let changed = false;
    for (const r of listRecords()) {
      const ref = secretRefFor(r.id);
      const origin = originOf(r.baseUrl);
      if (!blob[ref] || !origin) continue;
      try {
        const plain = safeStorage.decryptString(Buffer.from(blob[ref], 'base64'));
        if (plain.startsWith(BOUND)) continue;
        blob[ref] = sealBound(origin, plain);
        changed = true;
      } catch { /* undecryptable: leave it; getSecret returns undefined for it */ }
    }
    if (changed) writeSecretBlob(blob);
  } catch (e) {
    console.warn('[integrations] could not bind saved connector keys:', e instanceof Error ? e.message : e);
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
