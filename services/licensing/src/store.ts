/**
 * Persistence. Plain SQL over a `(text, params) => rows` function, so the same
 * statements run on Neon in production (`neonQuery`) and on an in-process
 * Postgres (PGlite) in tests — the SQL itself is under test, not a mock of it.
 */
import { randomToken } from './tokens.js';

export type Query = (text: string, params?: unknown[]) => Promise<Record<string, any>[]>;

export type LicenseStatus = 'none' | 'trialing' | 'active' | 'payment_required' | 'canceled' | 'refunded';

export interface AccountRow {
  id: string;
  email: string;
  name: string | null;
}

export interface LicenseRow {
  account_id: string;
  status: LicenseStatus;
  stripe_customer_id: string | null;
  payment_method_id: string | null;
  trial_started_at: Date | null;
  trial_end: Date | null;
  paid_at: Date | null;
  payment_intent_id: string | null;
  amount: number | null;
  currency: string | null;
  failure_reason: string | null;
}

export interface DeviceRow {
  device_id: string;
  name: string | null;
  platform: string | null;
  app_version: string | null;
  first_seen: Date;
  last_seen: Date;
}

const LICENSE_COLUMNS = new Set([
  'status', 'stripe_customer_id', 'payment_method_id', 'trial_started_at', 'trial_end',
  'paid_at', 'payment_intent_id', 'amount', 'currency', 'failure_reason'
]);

function toDate(v: unknown): Date | null {
  if (v === null || v === undefined) return null;
  return v instanceof Date ? v : new Date(String(v));
}

function licenseFrom(r: Record<string, any>): LicenseRow {
  return {
    account_id: r.account_id,
    status: r.status,
    stripe_customer_id: r.stripe_customer_id ?? null,
    payment_method_id: r.payment_method_id ?? null,
    trial_started_at: toDate(r.trial_started_at),
    trial_end: toDate(r.trial_end),
    paid_at: toDate(r.paid_at),
    payment_intent_id: r.payment_intent_id ?? null,
    amount: r.amount ?? null,
    currency: r.currency ?? null,
    failure_reason: r.failure_reason ?? null
  };
}

export class Store {
  constructor(private readonly q: Query) {}

  // ─── accounts ───────────────────────────────────────────────────────────

  /** The account for a verified email (created on first sign-in). The IdP
   *  identity is recorded and re-pointed at the email's account. */
  async signIn(provider: string, subject: string, email: string, name: string | null): Promise<AccountRow> {
    const e = email.trim().toLowerCase();
    const rows = await this.q(
      `INSERT INTO accounts (id, email, name) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = COALESCE(accounts.name, EXCLUDED.name)
       RETURNING id, email, name`,
      [`acct_${randomToken(12)}`, e, name]
    );
    const acct = rows[0] as AccountRow;
    await this.q(
      `INSERT INTO identities (provider, subject, account_id) VALUES ($1, $2, $3)
       ON CONFLICT (provider, subject) DO UPDATE SET account_id = EXCLUDED.account_id`,
      [provider, subject, acct.id]
    );
    await this.q(`INSERT INTO licenses (account_id) VALUES ($1) ON CONFLICT DO NOTHING`, [acct.id]);
    return acct;
  }

  async account(id: string): Promise<AccountRow | null> {
    const rows = await this.q(`SELECT id, email, name FROM accounts WHERE id = $1`, [id]);
    return (rows[0] as AccountRow) ?? null;
  }

  // ─── licenses ───────────────────────────────────────────────────────────

  async license(accountId: string): Promise<LicenseRow> {
    const rows = await this.q(`SELECT * FROM licenses WHERE account_id = $1`, [accountId]);
    if (rows[0]) return licenseFrom(rows[0]);
    await this.q(`INSERT INTO licenses (account_id) VALUES ($1) ON CONFLICT DO NOTHING`, [accountId]);
    return licenseFrom({ account_id: accountId, status: 'none' });
  }

  async licenseByCustomer(customerId: string): Promise<LicenseRow | null> {
    const rows = await this.q(`SELECT * FROM licenses WHERE stripe_customer_id = $1`, [customerId]);
    return rows[0] ? licenseFrom(rows[0]) : null;
  }

  async updateLicense(accountId: string, patch: Partial<Omit<LicenseRow, 'account_id'>>): Promise<LicenseRow> {
    const keys = Object.keys(patch).filter((k) => LICENSE_COLUMNS.has(k));
    if (keys.length === 0) return this.license(accountId);
    const sets = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
    const rows = await this.q(
      `UPDATE licenses SET ${sets}, updated_at = now() WHERE account_id = $1 RETURNING *`,
      [accountId, ...keys.map((k) => (patch as Record<string, unknown>)[k] ?? null)]
    );
    return licenseFrom(rows[0]);
  }

  /**
   * Conditional status move, for webhook/cron races: only applies when the
   * row is still in one of `from`. Returns the updated row, or null if it had
   * already moved on (e.g. the cron and a webhook both converting a trial).
   */
  async transition(
    accountId: string,
    from: LicenseStatus[],
    patch: Partial<Omit<LicenseRow, 'account_id'>>
  ): Promise<LicenseRow | null> {
    const keys = Object.keys(patch).filter((k) => LICENSE_COLUMNS.has(k));
    const sets = keys.map((k, i) => `${k} = $${i + 3}`).join(', ');
    const rows = await this.q(
      `UPDATE licenses SET ${sets}${sets ? ', ' : ''}updated_at = now()
       WHERE account_id = $1 AND status = ANY($2::text[]) RETURNING *`,
      [accountId, from, ...keys.map((k) => (patch as Record<string, unknown>)[k] ?? null)]
    );
    return rows[0] ? licenseFrom(rows[0]) : null;
  }

  async dueTrials(now: Date, limit = 100): Promise<LicenseRow[]> {
    const rows = await this.q(
      `SELECT * FROM licenses WHERE status = 'trialing' AND trial_end <= $1 ORDER BY trial_end LIMIT $2`,
      [now, limit]
    );
    return rows.map(licenseFrom);
  }

  /** Record a card's first trial. False when another account already used it. */
  async claimTrialCard(fingerprint: string, accountId: string): Promise<boolean> {
    await this.q(
      `INSERT INTO trial_fingerprints (fingerprint, account_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [fingerprint, accountId]
    );
    const rows = await this.q(`SELECT account_id FROM trial_fingerprints WHERE fingerprint = $1`, [fingerprint]);
    return rows[0]?.account_id === accountId;
  }

  // ─── devices ────────────────────────────────────────────────────────────

  /** Stamp (or re-stamp) a machine. 'limit' when a NEW machine would exceed the cap. */
  async activateDevice(
    accountId: string,
    d: { deviceId: string; name?: string; platform?: string; appVersion?: string },
    maxDevices: number
  ): Promise<'ok' | 'limit'> {
    const existing = await this.q(
      `SELECT revoked_at FROM devices WHERE account_id = $1 AND device_id = $2`,
      [accountId, d.deviceId]
    );
    if (existing[0] && existing[0].revoked_at === null) {
      await this.q(
        `UPDATE devices SET last_seen = now(), name = $3, platform = $4, app_version = $5
         WHERE account_id = $1 AND device_id = $2`,
        [accountId, d.deviceId, d.name ?? null, d.platform ?? null, d.appVersion ?? null]
      );
      return 'ok';
    }
    const count = await this.q(
      `SELECT count(*)::int AS n FROM devices WHERE account_id = $1 AND revoked_at IS NULL`,
      [accountId]
    );
    if ((count[0]?.n ?? 0) >= maxDevices) return 'limit';
    await this.q(
      `INSERT INTO devices (account_id, device_id, name, platform, app_version) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (account_id, device_id) DO UPDATE
         SET revoked_at = NULL, last_seen = now(), name = EXCLUDED.name,
             platform = EXCLUDED.platform, app_version = EXCLUDED.app_version`,
      [accountId, d.deviceId, d.name ?? null, d.platform ?? null, d.appVersion ?? null]
    );
    return 'ok';
  }

  async devices(accountId: string): Promise<DeviceRow[]> {
    const rows = await this.q(
      `SELECT device_id, name, platform, app_version, first_seen, last_seen FROM devices
       WHERE account_id = $1 AND revoked_at IS NULL ORDER BY last_seen DESC`,
      [accountId]
    );
    return rows.map((r) => ({ ...r, first_seen: toDate(r.first_seen)!, last_seen: toDate(r.last_seen)! })) as DeviceRow[];
  }

  async releaseDevice(accountId: string, deviceId: string): Promise<void> {
    await this.q(
      `UPDATE devices SET revoked_at = now() WHERE account_id = $1 AND device_id = $2 AND revoked_at IS NULL`,
      [accountId, deviceId]
    );
  }

  // ─── desktop OAuth ──────────────────────────────────────────────────────

  async createAuthCode(r: { codeHash: string; accountId: string; clientId: string; redirectUri: string; codeChallenge: string; expiresAt: Date }): Promise<void> {
    await this.q(
      `INSERT INTO auth_codes (code_hash, account_id, client_id, redirect_uri, code_challenge, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [r.codeHash, r.accountId, r.clientId, r.redirectUri, r.codeChallenge, r.expiresAt]
    );
  }

  /** Single use, atomically: a replayed or expired code returns null. */
  async consumeAuthCode(codeHash: string, now: Date): Promise<{ account_id: string; client_id: string; redirect_uri: string; code_challenge: string } | null> {
    const rows = await this.q(
      `UPDATE auth_codes SET used_at = $2 WHERE code_hash = $1 AND used_at IS NULL AND expires_at > $2
       RETURNING account_id, client_id, redirect_uri, code_challenge`,
      [codeHash, now]
    );
    return (rows[0] as any) ?? null;
  }

  async createRefreshToken(tokenHash: string, familyId: string, accountId: string, expiresAt: Date): Promise<void> {
    await this.q(
      `INSERT INTO refresh_tokens (token_hash, family_id, account_id, expires_at) VALUES ($1, $2, $3, $4)`,
      [tokenHash, familyId, accountId, expiresAt]
    );
  }

  /**
   * Spend a refresh token. Reuse of an already-spent token means it leaked:
   * the whole family (every descendant) is revoked.
   */
  async spendRefreshToken(tokenHash: string, now: Date): Promise<{ ok: true; accountId: string; familyId: string } | { ok: false }> {
    const rows = await this.q(
      `UPDATE refresh_tokens SET used_at = $2
       WHERE token_hash = $1 AND used_at IS NULL AND revoked_at IS NULL AND expires_at > $2
       RETURNING account_id, family_id`,
      [tokenHash, now]
    );
    if (rows[0]) return { ok: true, accountId: rows[0].account_id, familyId: rows[0].family_id };
    const seen = await this.q(`SELECT family_id, used_at FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
    if (seen[0]?.used_at) await this.revokeFamily(seen[0].family_id);
    return { ok: false };
  }

  async revokeFamily(familyId: string): Promise<void> {
    await this.q(`UPDATE refresh_tokens SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL`, [familyId]);
  }

  async revokeRefreshToken(tokenHash: string): Promise<void> {
    const rows = await this.q(`SELECT family_id FROM refresh_tokens WHERE token_hash = $1`, [tokenHash]);
    if (rows[0]) await this.revokeFamily(rows[0].family_id);
  }

  // ─── browser sessions ───────────────────────────────────────────────────

  async createSession(tokenHash: string, accountId: string, expiresAt: Date): Promise<void> {
    await this.q(`INSERT INTO web_sessions (token_hash, account_id, expires_at) VALUES ($1, $2, $3)`, [tokenHash, accountId, expiresAt]);
  }

  async sessionAccount(tokenHash: string, now: Date): Promise<string | null> {
    const rows = await this.q(`SELECT account_id FROM web_sessions WHERE token_hash = $1 AND expires_at > $2`, [tokenHash, now]);
    return rows[0]?.account_id ?? null;
  }

  async deleteSession(tokenHash: string): Promise<void> {
    await this.q(`DELETE FROM web_sessions WHERE token_hash = $1`, [tokenHash]);
  }

  // ─── stripe ─────────────────────────────────────────────────────────────

  /** True the first time an event id is seen (webhook de-duplication). */
  async firstSighting(eventId: string): Promise<boolean> {
    const rows = await this.q(
      `INSERT INTO stripe_events (event_id) VALUES ($1) ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId]
    );
    return rows.length === 1;
  }

  async forgetEvent(eventId: string): Promise<void> {
    await this.q(`DELETE FROM stripe_events WHERE event_id = $1`, [eventId]);
  }
}
