# Accounts, licensing & billing — design

Status: desktop client implemented (gate OFF until the servers are live).
Server contract: [API.md](./API.md).

## 1. Domains

| Host | Role | Owns |
|---|---|---|
| `labs.atmt.dev` | Marketing site | Landing, pricing, download page, release notes, funnel pages. Static; no session cookies. |
| `auth.labs.atmt.dev` | OAuth 2.0 authorization server | Google + Yahoo sign-in (OIDC), `/oauth/authorize`, `/oauth/token`, `/oauth/revoke`, the web account page. Session cookie is host-only (`__Host-` prefix), never `.atmt.dev`. |
| `api.labs.atmt.dev` | Licensing API | Signs license tokens, device activations, Stripe Checkout/Portal sessions, **Stripe webhooks**. Stateless; scales horizontally. |
| `dl.labs.atmt.dev` *(recommended)* | Binaries + update feed | Installers and `latest*.yml` for electron-updater on object storage + CDN (e.g. R2/S3). Public: an installer is useless without a license. |

Why `api.` is separate from `auth.`: different traffic and trust profiles
(browser sessions vs. machine calls and Stripe webhooks), and `auth.` can later
be moved to a hosted identity broker via a custom-domain CNAME without touching
licensing or billing. The app only ever speaks standard OAuth 2.0 to `auth.`.

## 2. Components

```
 labs.atmt.dev ──"Start free trial"──▶ auth.labs.atmt.dev ──OIDC──▶ Google / Yahoo
                                          │  (account + session)
                                          ▼
                                 api.labs.atmt.dev ◀──webhooks── Stripe
                                   │  users · subscriptions · devices
                                   │  Postgres
      ATMT Labs (Electron) ────────┘  POST /v1/licenses → signed license (EdDSA)
        src/main/license*.ts          verified OFFLINE with a baked-in public key
```

## 3. Funnels

Both entry points end in the same place: a signed-in desktop app holding a
license token for a `trialing` subscription.

**A. Web-first (paid acquisition, landing page)**

1. `labs.atmt.dev` → **Start 7-day free trial**
2. `auth.labs.atmt.dev/signup` → Continue with Google / Yahoo
3. API creates a Stripe Checkout Session → Stripe Checkout (card collected)
4. `checkout.session.completed` webhook → subscription `trialing`
5. Success page (`labs.atmt.dev/welcome`) → OS-specific download
6. App opens → sign-in gate → browser (already signed in, one click) → `atmtlabs://auth/callback` → licensed

**B. App-first (downloaded directly, word of mouth)**

1. App opens → gate → **Start 7-day free trial** (`screen_hint=signup`)
2. Browser sign-in → callback → app is signed in but `inactive` (no subscription)
3. Gate → **Start 7-day free trial** → API returns a Checkout URL → Stripe Checkout
4. App polls `/v1/licenses` every 10 s for 20 min → flips to licensed when the webhook lands
   (the user can also press **I've subscribed — check again**)

## 4. Stripe: 7-day, card-required trial

- Checkout Session: `mode=subscription`, one recurring Price,
  `subscription_data.trial_period_days=7`, `payment_method_collection=always`
  (the default for subscription mode; set it explicitly anyway),
  `customer` = the account's Stripe customer (create once, reuse).
- `subscription_data.trial_settings.end_behavior.missing_payment_method=cancel`
  as a safety net.
- Customer Portal for card changes, invoices and cancel.
- One trial per account. Also record `payment_method.card.fingerprint` on
  `checkout.session.completed`. If that fingerprint already had a trial on
  another account, end the new trial immediately (`trial_end=now`) so it bills.
  State this in the terms of service.

### Webhooks → entitlement (the API copies `subscription.status` verbatim)

| Event | Action |
|---|---|
| `checkout.session.completed` | Link customer ↔ account, store subscription id, card fingerprint check |
| `customer.subscription.created` / `updated` | Upsert status, `trial_end`, `current_period_end`, `cancel_at_period_end`, price → plan |
| `customer.subscription.deleted` | status `canceled` |
| `customer.subscription.trial_will_end` | Reminder email (3 days before) |
| `invoice.paid` / `invoice.payment_failed` | Receipts / dunning email (status changes arrive via `subscription.updated`) |

Verify every webhook signature (`Stripe-Signature`) and make handlers idempotent (store `event.id`).

**Entitled statuses:** `trialing`, `active`, `past_due` (Stripe is still retrying the card).
Everything else — `incomplete`, `incomplete_expired`, `unpaid`, `canceled`, `paused`, `none` — shows the subscribe screen.

## 5. The license token

A compact JWS, `alg=EdDSA` (Ed25519), `kid` in the header, signed by the API.
The app verifies it **offline** with `LICENSING.publicKeys` in `src/shared/brand.ts`.

| Claim | Meaning |
|---|---|
| `iss` / `aud` | `https://api.labs.atmt.dev` / `atmt-labs-desktop` |
| `sub` | Account id |
| `did` | Device id the token was issued to (copying it to another machine fails) |
| `plan`, `features[]` | Entitlements; gate features on these, not on the plan name |
| `status` | Stripe subscription status |
| `trial_end`, `period_end`, `cancel_at_period_end` | Shown in Settings → Account |
| `iat`, `exp` | Lifetime = the offline allowance. Recommended: 7 days |

The app renews at half-life. It also renews on launch, every 30 min (only once past half-life), and on wake from sleep.
Result: a canceled or unpaid subscription locks within days, while a laptop on a flight keeps working for up to 7.

**Key rotation:** ship the new public key in `publicKeys` one release before
the API starts signing with it; remove the old key a release after.

## 6. Desktop client (implemented)

| File | What |
|---|---|
| `src/shared/brand.ts` → `LICENSING` | Origins, client id, redirect URI, issuer/audience, public keys, the `enabled` switch |
| `src/shared/license.ts` | Shared types + the pure entitlement decision (`evaluateClaims`) |
| `src/main/licenseCore.ts` | PKCE, authorize URL, callback parsing, EdDSA verification, HTTP client |
| `src/main/licenseManager.ts` | State machine: sign-in, callback, refresh rotation, billing, sign-out (electron-free) |
| `src/main/license.ts` | Electron glue: `license.json` + safeStorage, IPC, timers |
| `src/main/index.ts` | `atmtlabs://auth/*` routing; **`spawnAgentCore` refuses every agent spawn while unlicensed**; `initLicensing()` before the first window |
| `src/renderer/src/components/LicenseGate.tsx` | Full-screen sign-in / subscribe / offline screens |
| `src/renderer/src/components/AccountSection.tsx` | Settings → General → Account (plan, trial end, manage billing, sign out) |
| `test/license-core.test.cjs`, `test/license-manager.test.cjs` | 39 tests incl. forgery, rotation, offline, device binding |

Sign-in is RFC 8252: system browser + PKCE (S256) + `state`, callback on the
`atmtlabs://` scheme the installer already registers. Only the refresh token is secret. It is:
- encrypted with the OS keychain (`safeStorage`), or kept in memory only if no keychain exists; never plaintext;
- rotated on every use;
- never sent over IPC.

### Turning it on

1. Deploy `auth.` and `api.` per [API.md](./API.md). Register the OAuth client
   `atmt-labs-desktop` with redirect URI `atmtlabs://auth/callback`.
2. Paste the API's Ed25519 public key (SPKI PEM) into `LICENSING.publicKeys`.
3. Set `LICENSING.enabled = true`. The test suite refuses `enabled` without a key.
4. Test against staging from a dev build:
   `ATMT_LICENSE_ENFORCE=1 ATMT_AUTH_ORIGIN=… ATMT_API_ORIGIN=… ATMT_LICENSE_ISSUER=… ATMT_LICENSE_PUBLIC_KEY="$(cat pub.pem)" npm run dev`
   (these overrides are ignored in packaged builds).

## 7. Threat model — plainly

- The check runs on the user's machine, so a determined cracker can patch the
  binary. The signed token stops the casual paths (edited files, copied licenses, forged status,
  clock rollback) and keeps honest customers honest.
- Next hardening step: Electron fuses (`RunAsNode` off,
  `EnableEmbeddedAsarIntegrityValidation` + `OnlyLoadAppFromAsar` on) in an `afterPack` hook.
- The durable moat is server-side value only paid accounts reach (hosted model
  catalog, team sync, cloud features), not the client check.

## 8. Scaling path

- `api.` is stateless: JWT in, JWT out. Put it behind a load balancer and add instances.
  Postgres holds accounts, subscriptions and devices; reads are one row per license call.
- Teams later: Organization → Subscription (quantity = seats) → Members → Devices.
  The token already carries `plan` + `features`, so no client change.
- Enterprise SSO (SAML / OIDC per customer) plugs into `auth.` only.
