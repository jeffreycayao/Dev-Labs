/**
 * Licensing — electron wiring for LicenseManager (src/main/licenseManager.ts).
 *
 *   - storage: <userData>/license.json. The refresh token is encrypted with
 *     safeStorage; if OS encryption is unavailable it is kept IN MEMORY ONLY
 *     (sign in again next launch) — never written in plaintext, same rule as
 *     the integrations secret store.
 *   - enforcement: LICENSING.enabled in a packaged build. Dev builds skip the
 *     gate unless ATMT_LICENSE_ENFORCE=1, and only dev builds honour the
 *     ATMT_AUTH_ORIGIN / ATMT_API_ORIGIN / ATMT_LICENSE_ISSUER /
 *     ATMT_LICENSE_PUBLIC_KEY / ATMT_LICENSE_KID overrides (for a local or
 *     staging licensing server).
 *   - IPC: license:current / signIn / cancelSignIn / refresh / signOut /
 *     openBilling, plus the `license:status` push. No token ever crosses IPC.
 *
 * Design: docs/licensing/DESIGN.md. Server contract: docs/licensing/API.md.
 */
import { app, ipcMain, powerMonitor, safeStorage, shell, BrowserWindow } from 'electron';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { hostname } from 'node:os';
import { dirname, join } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { LICENSING } from '../shared/brand';
import type { LicenseStatus } from '../shared/license';
import { LicenseManager, type LicenseStore, type PersistedLicense } from './licenseManager';
import type { FetchLike } from './licenseCore';

const TICK_MS = 30 * 60 * 1000;

let manager: LicenseManager | null = null;

function licensePath(): string {
  return join(app.getPath('userData'), 'license.json');
}

interface OnDisk {
  deviceId?: string;
  license?: string;
  lastSeenAt?: number;
  /** safeStorage ciphertext, base64. */
  refreshCipher?: string;
}

/** Refresh token held for this process only when the OS keychain is unavailable. */
let memoryOnlyRefresh: string | undefined;

const fileStore: LicenseStore = {
  load(): PersistedLicense {
    let disk: OnDisk = {};
    try {
      if (existsSync(licensePath())) {
        const parsed = JSON.parse(readFileSync(licensePath(), 'utf8'));
        if (parsed && typeof parsed === 'object') disk = parsed as OnDisk;
      }
    } catch { /* a corrupt file = signed out, never a crash */ }
    let refreshToken: string | undefined = memoryOnlyRefresh;
    if (disk.refreshCipher) {
      try {
        if (safeStorage.isEncryptionAvailable()) {
          refreshToken = safeStorage.decryptString(Buffer.from(disk.refreshCipher, 'base64'));
        }
      } catch { refreshToken = undefined; }
    }
    return {
      deviceId: typeof disk.deviceId === 'string' ? disk.deviceId : undefined,
      license: typeof disk.license === 'string' ? disk.license : undefined,
      lastSeenAt: typeof disk.lastSeenAt === 'number' ? disk.lastSeenAt : undefined,
      refreshToken
    };
  },
  save(next: PersistedLicense): void {
    const disk: OnDisk = { deviceId: next.deviceId, license: next.license, lastSeenAt: next.lastSeenAt };
    memoryOnlyRefresh = undefined;
    if (next.refreshToken) {
      let encrypted = false;
      try {
        if (safeStorage.isEncryptionAvailable()) {
          disk.refreshCipher = safeStorage.encryptString(next.refreshToken).toString('base64');
          encrypted = true;
        }
      } catch { encrypted = false; }
      if (!encrypted) memoryOnlyRefresh = next.refreshToken;
    }
    const p = licensePath();
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, JSON.stringify(disk, null, 2), { encoding: 'utf8', mode: 0o600 });
  }
};

/**
 * The OS's own stable machine identifier, hashed (never sent raw):
 *   macOS    IOPlatformUUID
 *   Windows  HKLM\SOFTWARE\Microsoft\Cryptography\MachineGuid
 *   Linux    /etc/machine-id (or the dbus copy)
 * Survives app reinstalls; changes on an OS reinstall or a different
 * computer — which is exactly what "stamped to this machine" means.
 * '' when unavailable; the manager then falls back to a random id.
 */
export function machineId(): string {
  let raw = '';
  try {
    if (process.platform === 'darwin') {
      const out = execFileSync('/usr/sbin/ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8', timeout: 5000 });
      raw = /"IOPlatformUUID"\s*=\s*"([^"]+)"/.exec(out)?.[1] ?? '';
    } else if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid', '/reg:64'], { encoding: 'utf8', timeout: 5000, windowsHide: true });
      raw = /MachineGuid\s+REG_SZ\s+(\S+)/.exec(out)?.[1] ?? '';
    } else {
      for (const p of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (existsSync(p)) { raw = readFileSync(p, 'utf8').trim(); if (raw) break; }
      }
    }
  } catch { raw = ''; }
  if (!raw) return '';
  return createHash('sha256').update(`atmt-labs-device:${raw.toLowerCase()}`).digest('base64url').slice(0, 32);
}

function devOverride(name: string): string | undefined {
  if (app.isPackaged) return undefined;
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

function isEnforced(): boolean {
  if (app.isPackaged) return LICENSING.enabled;
  return process.env.ATMT_LICENSE_ENFORCE === '1';
}

function broadcast(status: LicenseStatus): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send('license:status', status);
  }
}

function openExternal(url: string): Promise<void> {
  // Only ever our own origins or Stripe (licenseCore validates API-supplied
  // URLs). Plain http only for a local licensing server in a dev build.
  const devLoopback = !app.isPackaged && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//i.test(url);
  if (!/^https:\/\//i.test(url) && !devLoopback) return Promise.resolve();
  return shell.openExternal(url);
}

/** Build the manager, decide offline, then renew in the background. Call once
 *  in app.whenReady() BEFORE the first window so the gate paints correctly. */
export function initLicensing(): LicenseManager {
  if (manager) return manager;
  const devKey = devOverride('ATMT_LICENSE_PUBLIC_KEY');
  manager = new LicenseManager({
    enforced: isEnforced(),
    endpoints: {
      siteOrigin: LICENSING.siteOrigin,
      authOrigin: devOverride('ATMT_AUTH_ORIGIN') ?? LICENSING.authOrigin,
      apiOrigin: devOverride('ATMT_API_ORIGIN') ?? LICENSING.apiOrigin,
      clientId: LICENSING.clientId,
      redirectUri: LICENSING.redirectUri
    },
    verify: {
      issuer: devOverride('ATMT_LICENSE_ISSUER') ?? LICENSING.issuer,
      audience: LICENSING.audience,
      // The staging key is registered under the kid the staging server signs
      // with (LICENSE_SIGNING_KID there); `dev` if unset.
      publicKeys: devKey
        ? { ...LICENSING.publicKeys, [devOverride('ATMT_LICENSE_KID') ?? 'dev']: devKey.replace(/\\n/g, '\n') }
        : LICENSING.publicKeys
    },
    store: fileStore,
    fetch: globalThis.fetch as unknown as FetchLike,
    openExternal,
    device: { deviceName: hostname().slice(0, 64), platform: process.platform, appVersion: app.getVersion() },
    machineId,
    newDeviceId: randomUUID
  });
  manager.onChange(broadcast);
  const status = manager.init();
  if (status.enforced) {
    // A stamped (paid) machine makes no network call here or in tick().
    if (manager.canRefresh()) void manager.refresh();
    const timer = setInterval(() => { void manager?.tick(); }, TICK_MS);
    timer.unref?.();
    powerMonitor.on('resume', () => { void manager?.tick(); });
  }
  return manager;
}

/** Gate for anything that starts an agent. True when the gate is off. */
export function licenseAllowsAgents(): boolean {
  return manager ? manager.allowsAgents() : !isEnforced();
}

/** Route an atmtlabs:// link. True = it was the auth callback (handled). */
export function handleLicenseLink(url: string): Promise<boolean> {
  if (!manager) return Promise.resolve(false);
  return manager.handleCallback(url);
}

export function registerLicenseIpc(): void {
  const m = () => manager ?? initLicensing();
  ipcMain.handle('license:current', () => m().getStatus());
  ipcMain.handle('license:signIn', (_evt, hint: unknown) =>
    m().beginSignIn(hint === 'signup' ? 'signup' : 'signin'));
  ipcMain.handle('license:cancelSignIn', () => m().cancelSignIn());
  ipcMain.handle('license:refresh', () => m().refresh());
  ipcMain.handle('license:signOut', () => m().signOut());
  ipcMain.handle('license:openBilling', (_evt, kind: unknown) =>
    m().openBilling(kind === 'portal' ? 'portal' : 'checkout'));
  ipcMain.handle('license:redeem', (_evt, code: unknown) =>
    m().redeemCode(typeof code === 'string' ? code : ''));
}
