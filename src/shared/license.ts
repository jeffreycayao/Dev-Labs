/**
 * Licensing — the shapes main and the renderer agree on, and the one pure
 * decision both sides need: "given these (already signature-checked) license
 * claims, is this install entitled right now, and if not, why not?"
 *
 * No crypto and no electron here, so the renderer can import it. Signature
 * verification lives in src/main/licenseCore.ts; the renderer never sees a
 * token, only the LicenseStatus main derives from one.
 *
 * Contract with the server: docs/licensing/API.md.
 */

/**
 * Where the account's ONE-TIME purchase stands (services/licensing/db/schema.sql):
 *   none              never started a trial or bought
 *   trialing          7-day trial, card on file, charged once on day 7
 *   active            paid — a lifetime license
 *   payment_required  the day-7 charge failed / needs 3-D Secure, or the card
 *                     already had a trial; finish the purchase to continue
 *   canceled          trial canceled before day 7
 *   refunded          refunded or disputed
 */
export type PurchaseStatus = 'none' | 'trialing' | 'active' | 'payment_required' | 'canceled' | 'refunded';

/** States that unlock the app. */
export const ENTITLED_STATUSES: ReadonlySet<PurchaseStatus> = new Set<PurchaseStatus>(['trialing', 'active']);

export function isEntitledStatus(s: string | undefined): boolean {
  return !!s && ENTITLED_STATUSES.has(s as PurchaseStatus);
}

/** The payload of a license token (a compact EdDSA JWS). Times are epoch SECONDS. */
export interface LicenseClaims {
  iss: string;
  aud: string | string[];
  /** Account id on the licensing server. */
  sub: string;
  iat: number;
  /** Absent only on a perpetual (paid) license. */
  exp?: number;
  /**
   * A paid lifetime license, stamped to this machine: no `exp`, never renewed,
   * never checked online again. Only honoured together with status 'active'.
   */
  perpetual?: boolean;
  paid_at?: number;
  nbf?: number;
  jti?: string;
  email?: string;
  name?: string;
  /** Hardware-derived id of the machine this token was issued to. A token
   *  (or the whole license file) copied to another machine fails. */
  did: string;
  /** Plan slug: 'lifetime'. */
  plan: string;
  status: PurchaseStatus;
  /** Feature flags the plan unlocks. Empty/absent = the plan's defaults. */
  features?: string[];
  trial_end?: number;
}

/** A paid, machine-stamped license that never needs the server again. */
export function isPerpetual(c: Pick<LicenseClaims, 'perpetual' | 'status'>): boolean {
  return c.perpetual === true && c.status === 'active';
}

export type LicenseState =
  /** Gate is off (licensing disabled, or a dev build without ATMT_LICENSE_ENFORCE). */
  | 'disabled'
  /** Not signed in (or the session was revoked / expired server side). */
  | 'signed_out'
  /** Browser sign-in in progress; waiting for the atmtlabs://auth/callback link. */
  | 'signing_in'
  /** Entitled: a paid lifetime license, or a running trial with an unexpired token. */
  | 'licensed'
  /** Signed in, but not entitled (never bought, trial canceled, payment needed, refunded). */
  | 'inactive'
  /** Last token expired and the server could not be reached to renew it. */
  | 'offline_expired'
  /** Something the user cannot fix by signing in (misconfigured build, bad token). */
  | 'error';

/** Stable error codes shown to the user through i18n, never raw server text. */
export type LicenseErrorCode =
  | 'network'
  | 'server_error'
  | 'session_expired'
  | 'state_mismatch'
  | 'sign_in_cancelled'
  | 'sign_in_timeout'
  | 'device_limit'
  | 'device_mismatch'
  | 'invalid_token'
  | 'clock_rollback'
  | 'misconfigured'
  // Unlock-code redemption (shown inline next to the code field).
  | 'code_invalid'
  | 'code_used'
  | 'code_expired'
  | 'already_licensed';

export interface LicenseStatus {
  /** True when this build blocks agents until state === 'licensed'. */
  enforced: boolean;
  state: LicenseState;
  email?: string;
  name?: string;
  plan?: string;
  purchase?: PurchaseStatus;
  features?: string[];
  /** Paid lifetime license stamped to this machine: nothing to renew, ever. */
  perpetual?: boolean;
  /** Epoch MILLISECONDS (renderer-friendly). */
  trialEndsAt?: number;
  paidAt?: number;
  /** When the current token stops working offline. Absent when perpetual. */
  expiresAt?: number;
  error?: LicenseErrorCode;
}

/** Clock allowance for iat/nbf checks and rollback detection. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;
/** A wall clock this far behind the last time we saw is treated as tampering. */
export const CLOCK_ROLLBACK_MS = 60 * 60 * 1000;

/**
 * Derive what the user sees from verified claims.
 *
 * `claims` MUST already have passed signature, issuer and audience checks —
 * this only looks at time, device and purchase state.
 */
export function evaluateClaims(
  claims: LicenseClaims,
  opts: { now: number; deviceId: string; lastSeenAt?: number }
): Omit<LicenseStatus, 'enforced'> {
  const perpetual = isPerpetual(claims);
  const base: Omit<LicenseStatus, 'enforced' | 'state'> = {
    email: claims.email,
    name: claims.name,
    plan: claims.plan,
    purchase: claims.status,
    features: claims.features,
    perpetual: perpetual || undefined,
    trialEndsAt: secToMs(claims.trial_end),
    paidAt: secToMs(claims.paid_at),
    expiresAt: secToMs(claims.exp)
  };
  if (claims.did !== opts.deviceId) {
    return { state: 'signed_out', error: 'device_mismatch' };
  }
  // Paid and stamped to this machine: valid forever, whatever the clock says.
  if (perpetual) {
    return { ...base, state: 'licensed' };
  }
  if (clockRolledBack(opts.now, opts.lastSeenAt)) {
    return { ...base, state: 'offline_expired', error: 'clock_rollback' };
  }
  if (typeof claims.exp !== 'number' || opts.now >= claims.exp * 1000) {
    return { ...base, state: 'offline_expired' };
  }
  if (!isEntitledStatus(claims.status)) {
    return { ...base, state: 'inactive' };
  }
  return { ...base, state: 'licensed' };
}

/** The wall clock moved backwards past the allowance since we last looked. */
export function clockRolledBack(now: number, lastSeenAt: number | undefined): boolean {
  return typeof lastSeenAt === 'number' && now + CLOCK_ROLLBACK_MS < lastSeenAt;
}

/**
 * Renew once half the token's lifetime is gone (trial tokens). A perpetual
 * license is never renewed — the machine does not contact the server again.
 */
export function shouldRefresh(claims: Pick<LicenseClaims, 'iat' | 'exp' | 'perpetual' | 'status'>, now: number): boolean {
  if (isPerpetual(claims)) return false;
  if (typeof claims.exp !== 'number') return true;
  const lifetime = Math.max(0, claims.exp - claims.iat) * 1000;
  const remaining = claims.exp * 1000 - now;
  return remaining < lifetime / 2;
}

/** Whether this status unlocks agents. A gate that is off always allows. */
export function statusAllowsAgents(status: Pick<LicenseStatus, 'enforced' | 'state'>): boolean {
  return !status.enforced || status.state === 'licensed';
}

/** Whole days left until `at`, rounded up; 0 once it has passed. */
export function daysUntil(at: number | undefined, now: number): number | undefined {
  if (typeof at !== 'number') return undefined;
  return Math.max(0, Math.ceil((at - now) / 86_400_000));
}

function secToMs(s: number | undefined): number | undefined {
  return typeof s === 'number' && Number.isFinite(s) ? s * 1000 : undefined;
}
