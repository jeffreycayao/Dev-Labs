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

/** Stripe's subscription.status values, plus 'none' for an account that has
 *  never started a subscription. The server copies Stripe's value verbatim. */
export type SubscriptionStatus =
  | 'trialing'
  | 'active'
  | 'past_due'
  | 'incomplete'
  | 'incomplete_expired'
  | 'unpaid'
  | 'canceled'
  | 'paused'
  | 'none';

/**
 * Stripe states that unlock the app.
 *
 * past_due is IN on purpose: Stripe is still retrying the card (Smart Retries),
 * and locking someone out over a bank hiccup loses the customer the retry was
 * about to save. The server moves the subscription to unpaid/canceled when the
 * retries run out, and that is when access ends.
 */
export const ENTITLED_STATUSES: ReadonlySet<SubscriptionStatus> = new Set<SubscriptionStatus>([
  'trialing',
  'active',
  'past_due'
]);

export function isEntitledStatus(s: string | undefined): boolean {
  return !!s && ENTITLED_STATUSES.has(s as SubscriptionStatus);
}

/** The payload of a license token (a compact EdDSA JWS). Times are epoch SECONDS. */
export interface LicenseClaims {
  iss: string;
  aud: string | string[];
  /** Account id on the licensing server. */
  sub: string;
  iat: number;
  exp: number;
  nbf?: number;
  jti?: string;
  email?: string;
  name?: string;
  /** Device id this token was issued to. A token copied to another machine fails. */
  did: string;
  /** Plan slug, e.g. 'pro'. */
  plan: string;
  status: SubscriptionStatus;
  /** Feature flags the plan unlocks. Empty/absent = the plan's defaults. */
  features?: string[];
  trial_end?: number;
  period_end?: number;
  cancel_at_period_end?: boolean;
}

export type LicenseState =
  /** Gate is off (licensing disabled, or a dev build without ATMT_LICENSE_ENFORCE). */
  | 'disabled'
  /** Not signed in (or the session was revoked / expired server side). */
  | 'signed_out'
  /** Browser sign-in in progress; waiting for the atmtlabs://auth/callback link. */
  | 'signing_in'
  /** Entitled: trialing, active or past_due, token unexpired. */
  | 'licensed'
  /** Signed in, but no entitling subscription (never subscribed, canceled, unpaid). */
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
  | 'misconfigured';

export interface LicenseStatus {
  /** True when this build blocks agents until state === 'licensed'. */
  enforced: boolean;
  state: LicenseState;
  email?: string;
  name?: string;
  plan?: string;
  subscription?: SubscriptionStatus;
  features?: string[];
  /** Epoch MILLISECONDS (renderer-friendly). */
  trialEndsAt?: number;
  periodEndsAt?: number;
  cancelAtPeriodEnd?: boolean;
  /** When the current token stops working offline. */
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
 * this only looks at time, device and subscription state.
 */
export function evaluateClaims(
  claims: LicenseClaims,
  opts: { now: number; deviceId: string; lastSeenAt?: number }
): Omit<LicenseStatus, 'enforced'> {
  const base: Omit<LicenseStatus, 'enforced' | 'state'> = {
    email: claims.email,
    name: claims.name,
    plan: claims.plan,
    subscription: claims.status,
    features: claims.features,
    trialEndsAt: secToMs(claims.trial_end),
    periodEndsAt: secToMs(claims.period_end),
    cancelAtPeriodEnd: claims.cancel_at_period_end,
    expiresAt: claims.exp * 1000
  };
  if (claims.did !== opts.deviceId) {
    return { state: 'signed_out', error: 'device_mismatch' };
  }
  if (clockRolledBack(opts.now, opts.lastSeenAt)) {
    return { ...base, state: 'offline_expired', error: 'clock_rollback' };
  }
  if (opts.now >= claims.exp * 1000) {
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
 * Renew once half the token's lifetime is gone. With a 7-day token that is
 * every ~3.5 days offline-tolerant, and in practice every launch/timer tick
 * after the halfway mark, so a canceled subscription stops within days while
 * a laptop on a flight keeps working.
 */
export function shouldRefresh(claims: Pick<LicenseClaims, 'iat' | 'exp'>, now: number): boolean {
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
