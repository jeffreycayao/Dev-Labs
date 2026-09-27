/**
 * LicenseManager — the sign-in / license lifecycle as a small state machine.
 *
 * Electron-free by design (like integrationBroker.ts): storage, the browser,
 * fetch and the clock are injected, so every flow — sign in, callback, refresh
 * with token rotation, offline expiry, sign out — is unit-tested under plain
 * node (test/license-manager.test.cjs). src/main/license.ts wires the real deps.
 *
 * Lifecycle:
 *   init()           read the stored license, decide offline, never blocks on net
 *   beginSignIn()    PKCE + state → system browser → auth.labs.atmt.dev
 *   handleCallback() atmtlabs://auth/callback?code&state → tokens → license
 *   refresh()        rotate refresh token → POST /v1/licenses → new license
 *   tick()           periodic: renew past half-life, re-evaluate expiry
 *   openBilling()    Stripe Checkout (trial) / Customer Portal via the API
 *   signOut()        release the device seat, revoke, forget
 */
import {
  buildAuthorizeUrl,
  createBillingSession,
  createPkce,
  exchangeCode,
  fetchLicense,
  LicenseApiError,
  parseAuthCallback,
  randomState,
  refreshTokens,
  releaseDevice,
  revokeToken,
  verifyLicenseToken,
  type DeviceInfo,
  type FetchLike,
  type LicensingEndpoints,
  type OAuthTokens,
  type TokenVerifyConfig
} from './licenseCore';
import {
  evaluateClaims,
  shouldRefresh,
  statusAllowsAgents,
  type LicenseErrorCode,
  type LicenseStatus
} from '../shared/license';

export interface PersistedLicense {
  deviceId?: string;
  /** Secret. The store is responsible for encrypting it at rest. */
  refreshToken?: string;
  /** Signed, not secret. */
  license?: string;
  /** High-water mark of the wall clock, for rollback detection. */
  lastSeenAt?: number;
}

export interface LicenseStore {
  load(): PersistedLicense;
  save(next: PersistedLicense): void;
}

export interface LicenseManagerDeps {
  /** Block agents until licensed. False → state 'disabled', no network at all. */
  enforced: boolean;
  endpoints: LicensingEndpoints & { siteOrigin: string };
  verify: TokenVerifyConfig;
  store: LicenseStore;
  fetch: FetchLike;
  openExternal: (url: string) => void | Promise<void>;
  device: Omit<DeviceInfo, 'deviceId'>;
  newDeviceId: () => string;
  now?: () => number;
  setTimer?: (fn: () => void, ms: number) => { cancel(): void };
}

/** How long a browser sign-in may take before the gate gives up waiting. */
export const SIGN_IN_TIMEOUT_MS = 10 * 60 * 1000;
/** After opening Stripe Checkout, re-check this often for the new subscription. */
export const CHECKOUT_POLL_MS = 10 * 1000;
export const CHECKOUT_POLL_FOR_MS = 20 * 60 * 1000;

interface PendingSignIn {
  verifier: string;
  state: string;
  startedAt: number;
}

export class LicenseManager {
  private readonly deps: LicenseManagerDeps;
  private readonly now: () => number;
  private readonly setTimer: NonNullable<LicenseManagerDeps['setTimer']>;
  private persisted: PersistedLicense = {};
  private status: LicenseStatus = { enforced: false, state: 'disabled' };
  private pending: PendingSignIn | null = null;
  private pendingTimer: { cancel(): void } | null = null;
  private checkoutPoll: { cancel(): void } | null = null;
  private tokens: OAuthTokens | null = null;
  private inflight: Promise<LicenseStatus> | null = null;
  private readonly listeners = new Set<(s: LicenseStatus) => void>();

  constructor(deps: LicenseManagerDeps) {
    this.deps = deps;
    this.now = deps.now ?? Date.now;
    this.setTimer = deps.setTimer ?? ((fn, ms) => {
      const t = setTimeout(fn, ms);
      (t as { unref?: () => void }).unref?.();
      return { cancel: () => clearTimeout(t) };
    });
  }

  // ─── read side ────────────────────────────────────────────────────────────

  getStatus(): LicenseStatus {
    return { ...this.status };
  }

  allowsAgents(): boolean {
    return statusAllowsAgents(this.status);
  }

  onChange(cb: (s: LicenseStatus) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private set(next: LicenseStatus): void {
    this.status = next;
    const snap = this.getStatus();
    for (const cb of this.listeners) {
      try { cb(snap); } catch { /* a bad listener never breaks licensing */ }
    }
  }

  // ─── lifecycle ────────────────────────────────────────────────────────────

  /** Offline decision from what is on disk. Callers then `refresh()` in the
   *  background; the gate never waits on the network to open. */
  init(): LicenseStatus {
    if (!this.deps.enforced) {
      this.set({ enforced: false, state: 'disabled' });
      return this.getStatus();
    }
    if (Object.keys(this.deps.verify.publicKeys).length === 0) {
      this.set({ enforced: true, state: 'error', error: 'misconfigured' });
      return this.getStatus();
    }
    this.persisted = this.deps.store.load() ?? {};
    if (!this.persisted.deviceId) this.save({ deviceId: this.deps.newDeviceId() });
    this.recompute();
    return this.getStatus();
  }

  /** Whether a background refresh is worth attempting right now. */
  canRefresh(): boolean {
    return this.status.enforced && this.status.state !== 'error' && !!this.persisted.refreshToken;
  }

  /** Periodic: renew past half-life (or when not licensed but signed in), and
   *  re-evaluate so an expiry that happened while idle is noticed. */
  async tick(): Promise<void> {
    if (!this.status.enforced || this.status.state === 'error' || this.pending) return;
    const claims = this.currentClaims();
    const due = !claims || shouldRefresh(claims, this.now()) || this.status.state !== 'licensed';
    if (due && this.persisted.refreshToken) await this.refresh();
    else this.recompute();
  }

  /** Rotate the refresh token and fetch a new license. De-duplicated. */
  refresh(): Promise<LicenseStatus> {
    if (!this.status.enforced) return Promise.resolve(this.getStatus());
    if (!this.inflight) {
      this.inflight = this.doRefresh().finally(() => { this.inflight = null; });
    }
    return this.inflight;
  }

  private async doRefresh(): Promise<LicenseStatus> {
    const rt = this.persisted.refreshToken;
    if (!rt) {
      this.recompute();
      return this.getStatus();
    }
    try {
      await this.rotate(rt);
      await this.pullLicense();
      this.recompute();
    } catch (e) {
      this.handleError(e);
    }
    return this.getStatus();
  }

  private async rotate(refreshToken: string): Promise<OAuthTokens> {
    const tokens = await refreshTokens(this.deps.fetch, this.deps.endpoints, refreshToken, this.now());
    this.tokens = tokens;
    this.save({ refreshToken: tokens.refreshToken });
    return tokens;
  }

  private async pullLicense(): Promise<void> {
    const license = await this.withAccess((access) =>
      fetchLicense(this.deps.fetch, this.deps.endpoints, access, this.deviceInfo()));
    const v = verifyLicenseToken(license, this.deps.verify, this.now());
    if (!v.ok) throw new LicenseApiError('invalid_token');
    if (v.claims.did !== this.persisted.deviceId) throw new LicenseApiError('device_mismatch');
    // The server just vouched for the time (iat passed the skew check), so a
    // clock that was legitimately corrected backwards stops reading as rollback.
    this.save({ license, lastSeenAt: this.now() });
  }

  /** Run with a live access token; on a 401 rotate once and retry. */
  private async withAccess<T>(fn: (access: string) => Promise<T>): Promise<T> {
    const fresh = async (): Promise<string> => {
      const rt = this.persisted.refreshToken;
      if (!rt) throw new LicenseApiError('session_expired');
      return (await this.rotate(rt)).accessToken;
    };
    let access = this.tokens && this.tokens.accessExpiresAt - 30_000 > this.now()
      ? this.tokens.accessToken
      : await fresh();
    try {
      return await fn(access);
    } catch (e) {
      if (!(e instanceof LicenseApiError) || e.code !== 'unauthorized') throw e;
      access = await fresh();
      return fn(access);
    }
  }

  // ─── sign in ──────────────────────────────────────────────────────────────

  async beginSignIn(screenHint: 'signin' | 'signup' = 'signin'): Promise<LicenseStatus> {
    if (!this.status.enforced || (this.status.state === 'error' && this.status.error === 'misconfigured')) {
      return this.getStatus();
    }
    const { verifier, challenge } = createPkce();
    const state = randomState();
    this.pending = { verifier, state, startedAt: this.now() };
    this.pendingTimer?.cancel();
    this.pendingTimer = this.setTimer(() => {
      if (this.pending?.state === state) {
        this.pending = null;
        this.recompute('sign_in_timeout');
      }
    }, SIGN_IN_TIMEOUT_MS);
    this.set({ ...this.status, state: 'signing_in', error: undefined });
    await this.deps.openExternal(buildAuthorizeUrl(this.deps.endpoints, { challenge, state, screenHint }));
    return this.getStatus();
  }

  cancelSignIn(): LicenseStatus {
    this.clearPending();
    this.recompute();
    return this.getStatus();
  }

  private clearPending(): void {
    this.pending = null;
    this.pendingTimer?.cancel();
    this.pendingTimer = null;
  }

  /** Returns false when `url` is not the auth callback (let the hire handler have it). */
  async handleCallback(url: string): Promise<boolean> {
    const cb = parseAuthCallback(url, this.deps.endpoints.redirectUri);
    if (!cb) return false;
    if (!this.status.enforced) return true;
    const pending = this.pending;
    // A callback we did not ask for (stale tab, another app, replay) is dropped
    // without touching an existing session or a sign-in still in flight.
    if (!pending || cb.state !== pending.state) {
      if (!pending && this.status.state !== 'licensed') this.recompute('state_mismatch');
      return true;
    }
    this.clearPending();
    if (cb.kind === 'error') {
      this.recompute(cb.error === 'access_denied' ? 'sign_in_cancelled' : 'server_error');
      return true;
    }
    if (this.now() - pending.startedAt > SIGN_IN_TIMEOUT_MS) {
      this.recompute('sign_in_timeout');
      return true;
    }
    try {
      const tokens = await exchangeCode(this.deps.fetch, this.deps.endpoints, cb.code, pending.verifier, this.now());
      this.tokens = tokens;
      this.save({ refreshToken: tokens.refreshToken });
      await this.pullLicense();
      this.recompute();
    } catch (e) {
      this.handleError(e);
    }
    return true;
  }

  // ─── billing ──────────────────────────────────────────────────────────────

  /**
   * 'checkout' → Stripe Checkout for the 7-day, card-required trial.
   * 'portal'   → Stripe Customer Portal (card, invoices, cancel).
   * Signed out, or the API unreachable → the public pricing/account page.
   */
  async openBilling(kind: 'checkout' | 'portal'): Promise<{ ok: boolean; error?: LicenseErrorCode }> {
    const fallback = kind === 'checkout'
      ? new URL('/pricing', this.deps.endpoints.siteOrigin).toString()
      : new URL('/account', this.deps.endpoints.authOrigin).toString();
    if (!this.persisted.refreshToken) {
      await this.deps.openExternal(fallback);
      return { ok: true };
    }
    try {
      const url = await this.withAccess((access) =>
        createBillingSession(this.deps.fetch, this.deps.endpoints, access, kind));
      await this.deps.openExternal(url);
      if (kind === 'checkout') this.pollForSubscription();
      return { ok: true };
    } catch (e) {
      const code = e instanceof LicenseApiError ? e.code : 'server_error';
      if (code === 'session_expired') {
        this.handleError(e);
        return { ok: false, error: 'session_expired' };
      }
      await this.deps.openExternal(fallback);
      return { ok: true };
    }
  }

  /** Stripe Checkout completes in the browser; the webhook lands on the API a
   *  moment later. Re-check quietly until the trial shows up or we give up. */
  private pollForSubscription(): void {
    this.checkoutPoll?.cancel();
    const until = this.now() + CHECKOUT_POLL_FOR_MS;
    const step = () => {
      this.checkoutPoll = this.setTimer(async () => {
        if (this.status.state === 'licensed' || !this.persisted.refreshToken) return;
        const next = await this.refresh();
        if (next.state !== 'licensed' && this.now() < until) step();
      }, CHECKOUT_POLL_MS);
    };
    step();
  }

  // ─── sign out ─────────────────────────────────────────────────────────────

  async signOut(): Promise<LicenseStatus> {
    this.clearPending();
    this.checkoutPoll?.cancel();
    const rt = this.persisted.refreshToken;
    const deviceId = this.persisted.deviceId;
    if (rt && deviceId) {
      // Best effort: free the seat, then kill the session server side. The
      // local sign-out happens regardless — being offline must not trap a user.
      try {
        await this.withAccess((access) => releaseDevice(this.deps.fetch, this.deps.endpoints, access, deviceId));
      } catch { /* ignore */ }
      try {
        await revokeToken(this.deps.fetch, this.deps.endpoints, this.persisted.refreshToken ?? rt);
      } catch { /* ignore */ }
    }
    this.forgetSession();
    this.set({ enforced: this.status.enforced, state: this.status.enforced ? 'signed_out' : 'disabled' });
    return this.getStatus();
  }

  // ─── internals ────────────────────────────────────────────────────────────

  private deviceInfo(): DeviceInfo {
    return { deviceId: this.persisted.deviceId ?? '', ...this.deps.device };
  }

  private currentClaims() {
    const token = this.persisted.license;
    if (!token) return null;
    const v = verifyLicenseToken(token, this.deps.verify, this.now());
    return v.ok ? v.claims : null;
  }

  private forgetSession(): void {
    this.tokens = null;
    this.save({ refreshToken: undefined, license: undefined });
  }

  private save(patch: Partial<PersistedLicense>): void {
    this.persisted = { ...this.persisted, ...patch };
    try { this.deps.store.save(this.persisted); } catch { /* keep going in memory */ }
  }

  /** Re-derive status from the stored license. `error` annotates a non-licensed result. */
  private recompute(error?: LicenseErrorCode): void {
    const now = this.now();
    const token = this.persisted.license;
    let next: LicenseStatus;
    if (!token) {
      next = { enforced: true, state: 'signed_out', error };
    } else {
      const v = verifyLicenseToken(token, this.deps.verify, now);
      if (!v.ok) {
        // A stored token that no longer verifies (key rotated out, file edited):
        // drop it; a refresh token, if any, can still fetch a good one.
        this.save({ license: undefined });
        next = { enforced: true, state: 'signed_out', error: error ?? 'invalid_token' };
      } else {
        const evald = evaluateClaims(v.claims, {
          now,
          deviceId: this.persisted.deviceId ?? '',
          lastSeenAt: this.persisted.lastSeenAt
        });
        next = { enforced: true, ...evald };
        if (next.state !== 'licensed' && error && !next.error) next.error = error;
      }
    }
    // Only move the high-water mark forward, and never on a rolled-back clock.
    if (next.error !== 'clock_rollback' && now > (this.persisted.lastSeenAt ?? 0)) {
      this.save({ lastSeenAt: now });
    }
    this.set(next);
  }

  private handleError(e: unknown): void {
    const code: LicenseErrorCode = e instanceof LicenseApiError
      ? (e.code === 'unauthorized' ? 'session_expired' : e.code)
      : 'server_error';
    if (code === 'session_expired') {
      this.forgetSession();
      this.set({ enforced: true, state: 'signed_out', error: 'session_expired' });
      return;
    }
    if (code === 'device_limit' || code === 'invalid_token' || code === 'device_mismatch') {
      this.recompute();
      // Keep whatever still-valid license we had; otherwise explain.
      if (this.status.state !== 'licensed') this.set({ ...this.status, state: 'error', error: code });
      return;
    }
    // network / server_error: keep the offline decision, annotate if blocked.
    this.recompute(code);
  }
}
