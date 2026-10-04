-- Jepoy Floor AI licensing schema (Postgres / Neon). Idempotent: safe to re-run.
-- Apply with `npm run db:migrate` (reads DATABASE_URL from .env.local).

-- One account per verified email. Google and Yahoo sign-ins with the same
-- email land on the same account, so the license follows the email.
CREATE TABLE IF NOT EXISTS accounts (
  id          text PRIMARY KEY,
  email       text NOT NULL UNIQUE,          -- lower-cased
  name        text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS identities (
  provider    text NOT NULL,                 -- 'google' | 'yahoo'
  subject     text NOT NULL,                 -- the IdP's stable `sub`
  account_id  text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, subject)
);

-- One license per account (one-time purchase, optional 7-day card trial first).
--   none → trialing → active            (card charged once on day 7)
--   none → active                       (bought outright)
--   trialing → payment_required         (day-7 charge failed / needs 3-D Secure)
--   trialing → canceled                 (user canceled before day 7)
--   active → refunded                   (full refund or dispute)
CREATE TABLE IF NOT EXISTS licenses (
  account_id          text PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  status              text NOT NULL DEFAULT 'none',
  stripe_customer_id  text UNIQUE,
  payment_method_id   text,
  trial_started_at    timestamptz,
  trial_end           timestamptz,
  paid_at             timestamptz,
  payment_intent_id   text,
  amount              integer,
  currency            text,
  failure_reason      text,
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS licenses_trial_due ON licenses (trial_end) WHERE status = 'trialing';

-- One free trial per card, across all accounts.
CREATE TABLE IF NOT EXISTS trial_fingerprints (
  fingerprint  text PRIMARY KEY,
  account_id   text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  used_at      timestamptz NOT NULL DEFAULT now()
);

-- Machines stamped with this account's license.
CREATE TABLE IF NOT EXISTS devices (
  account_id   text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  device_id    text NOT NULL,
  name         text,
  platform     text,
  app_version  text,
  first_seen   timestamptz NOT NULL DEFAULT now(),
  last_seen    timestamptz NOT NULL DEFAULT now(),
  revoked_at   timestamptz,
  PRIMARY KEY (account_id, device_id)
);

-- Desktop OAuth: one-time codes (hash only), refresh tokens (hash only, rotated).
CREATE TABLE IF NOT EXISTS auth_codes (
  code_hash       text PRIMARY KEY,
  account_id      text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  client_id       text NOT NULL,
  redirect_uri    text NOT NULL,
  code_challenge  text NOT NULL,
  expires_at      timestamptz NOT NULL,
  used_at         timestamptz
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  token_hash  text PRIMARY KEY,
  family_id   text NOT NULL,
  account_id  text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  used_at     timestamptz,
  revoked_at  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refresh_tokens_family ON refresh_tokens (family_id);

-- Browser sessions on auth.labs.atmt.dev (hash only).
CREATE TABLE IF NOT EXISTS web_sessions (
  token_hash  text PRIMARY KEY,
  account_id  text NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at  timestamptz NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Stripe webhook de-duplication.
CREATE TABLE IF NOT EXISTS stripe_events (
  event_id     text PRIMARY KEY,
  received_at  timestamptz NOT NULL DEFAULT now()
);

-- How an 'active' license was obtained: 'stripe' (paid) or 'unlock_code' (free voucher).
ALTER TABLE licenses ADD COLUMN IF NOT EXISTS source text;

-- Single-use unlock codes (free lifetime license). Hash only; see src/codes.ts.
-- Minted with `npm run codes -- create`. A code is spent atomically together
-- with the license change, and never on an account that is already licensed.
CREATE TABLE IF NOT EXISTS unlock_codes (
  code_hash    text PRIMARY KEY,
  label        text,                           -- who/what it was for, e.g. "Beta tester: Ana"
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,                    -- NULL = never
  revoked_at   timestamptz,                    -- voided before use
  redeemed_by  text REFERENCES accounts(id) ON DELETE SET NULL,
  redeemed_at  timestamptz
);

-- Which IdP a browser session signed in with. The owner-only /admin page
-- requires a recent Google session (Google always verifies the email).
ALTER TABLE web_sessions ADD COLUMN IF NOT EXISTS provider text;
