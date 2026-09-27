# Accounts, licensing & billing — design

Status: desktop client and licensing service implemented. The desktop gate
stays OFF (`LICENSING.enabled = false`) until the service is deployed.
Server contract: [API.md](./API.md). Setup runbook:
[services/licensing/README.md](../../services/licensing/README.md).

## 1. The product rules

- **One-time purchase.** No subscription. Pay once, own the license.
- **7-day free trial, card required.** The card is saved at the start and
  charged **once** on day 7, unless the user cancels first.
- **The license is bound to the email.** Google and Yahoo sign-ins with the
  same verified email are the same account and the same license.
- **A paid machine is stamped for good.** After the purchase, the app holds a
  perpetual license tied to that computer's hardware ID and **never contacts the
  server again** on that machine: no renewals, no online checks, works offline forever.
- **Device cap:** `MAX_DEVICES` machines per license (default 3). New machines
  sign in with the same email.
- **Unlock codes.** The owner can give a free lifetime license with a
  single-use code, without Stripe. It works exactly like a paid license
  (perpetual, stamped), just `source = unlock_code` and amount 0.

## 2. Domains

| Host | Role |
|---|---|
| `labs.atmt.dev` | Landing, pricing, downloads, release notes, funnel pages (`/welcome` after Checkout) |
| `auth.labs.atmt.dev` | Google/Yahoo sign-in, desktop OAuth (`/oauth/*`), account page (`/account`), funnel entry (`/start`) |
| `api.labs.atmt.dev` | License tokens, devices, Stripe Checkout sessions, Stripe webhook, daily cron |

`auth.` and `api.` are **one Vercel project** (`services/licensing`) with both
domains attached. The app enforces the split: each host serves only its own
routes, so it can become two projects later without changing a URL. Functions
run in **sin1 (Singapore)**, next to the **Neon database in Singapore
(aws-ap-southeast-1)**. That is the lowest latency for customers in Asia.

## 3. Funnels

**Web-first** (landing page CTA → `https://auth.labs.atmt.dev/start?plan=trial`):

1. Sign in with Google or Yahoo, which creates the account keyed on the email.
2. Stripe Checkout in **setup** mode. The card is saved and nothing is charged; the button text says so.
3. The `checkout.session.completed` webhook moves the license to `trialing`, with day 7 set.
4. The user lands on `labs.atmt.dev/welcome` and downloads the app. In the app, sign-in is one click (the browser session already exists).

**App-first:**

1. Gate → **Start 7-day free trial** → browser sign-in → the app comes back signed in, with no license yet.
2. **Start 7-day free trial** again → Stripe Checkout.
3. The app polls every 10 s and unlocks when the webhook lands.

`/start?plan=buy` skips the trial and goes to a one-time payment Checkout.

## 4. License lifecycle

```
none ──trial checkout──▶ trialing ──day 7 charge ok──▶ active (perpetual)
  │                        │  └─day 7 charge fails / 3DS─▶ payment_required ──pay──▶ active
  │                        └─cancel before day 7─▶ canceled ──buy──▶ active
  └──────────────buy now──────────────────────────────────────────▶ active
active ──full refund / dispute──▶ refunded   (never for source = unlock_code)
none | trialing | payment_required | canceled | refunded ──unlock code──▶ active (perpetual)
```

**Unlock codes** (`src/codes.ts`, `unlock_codes` table):
- Only the SHA-256 of the normalized code is stored.
- Redeeming is **one SQL statement**. It spends the code and grants the license together, only if the account isn't already `active`. So a code can't be burned on a licensed account, and two people can't both win the same code (the row lock lets one through).
- Codes may expire (`expires_at`) and can be revoked before use.
- Owner CLI: `npm run codes -- create|list|revoke` in `services/licensing`.

Why not a Stripe 100%-off promotion code? Stripe Checkout does support them for one-time payments ("no-cost orders", no card collected). This service doesn't use them because:
- the buy Checkout isn't created with `allow_promotion_codes`;
- a free session completes without a PaymentIntent, and `onCheckoutCompleted` only grants on `payment_status = paid`.

Unlock codes also work from inside the app, need no Stripe customer, can be revoked before use, and are single-use by construction.

- **Day-7 charge:** an off-session PaymentIntent for the one-time price.
  - It's triggered by a **daily Vercel Cron** (01:00 UTC), and also immediately
    when the app renews its trial license after day 7.
  - A Stripe idempotency key makes concurrent attempts share one charge.
  - Status changes are conditional, so a webhook racing the cron can't double-apply.
- **Charge fails or needs 3-D Secure** → `payment_required`.
  - The app and the account page offer a normal Checkout to pay. Nothing retries against the card on its own.
- **One trial per account and per card.** The card fingerprint is recorded when the trial starts.
  - A second account using the same card gets `payment_required (trial_already_used)` instead of a trial.
- **Cancel trial** on `auth.labs.atmt.dev/account` → `canceled`. The card is never charged.
  - A later purchase is still possible; a second trial is not.

## 5. The license token

A compact JWS signed EdDSA (Ed25519) by the service. The app verifies it
**offline** against `LICENSING.publicKeys` in `src/shared/brand.ts`.

| Status | Token |
|---|---|
| `active` | `perpetual: true`, **no `exp`**, `paid_at` — valid forever on that machine |
| `trialing` | `exp` = `trial_end` + 2-day grace; renewed at half-life |
| anything else | `exp` = 24 h; the gate shows the subscribe or complete-purchase screen |

Common claims:

| Claim | Meaning |
|---|---|
| `iss` / `aud` | `https://api.labs.atmt.dev` / `atmt-labs-desktop` |
| `sub` | Account ID |
| `email` | The account's email, which the license is bound to |
| `did` | The hardware-derived device ID (the stamp) |
| `plan` | `lifetime` |
| `status` | One of the statuses above |

The app accepts a token without `exp` **only** when `perpetual: true` and
`status: active`. A forged "perpetual trial" fails verification.

**The stamp (`did`).** It's `sha256("atmt-labs-device:" + OS machine id)`:

| OS | Machine ID source |
|---|---|
| macOS | `IOPlatformUUID` |
| Windows | `MachineGuid` |
| Linux | `/etc/machine-id` |

The raw ID never leaves the machine. Copying `license.json` to another computer doesn't carry the license. An OS reinstall counts as a new machine: sign in again, and remove the old one on the account page if the cap is reached.

## 6. Plain truths about "never check again"

- **A refund or chargeback can't reach an already-stamped machine.**
  `refunded` blocks new activations and every non-stamped machine, but a stamped
  machine keeps working offline. This is the cost of the no-check guarantee.
- **Removing a device on the account page frees the seat but can't un-stamp that computer**, for the same reason.
  So the device cap limits new activations; it can't pull the license off a machine that's already stamped.
- **Anyone who can patch the binary can bypass any client check.**
  The signed, machine-bound token stops casual copying and forging, not a determined cracker.
- **Key rotation affects only new licenses.** Keep old public keys in the app
  forever: stamped machines carry tokens signed with them.

If you later want revocation, the option that keeps the offline guarantee is
an occasional, best-effort check. It would lock a machine only when the server
positively says `refunded`, and never because the server can't be reached.
That's a change to your "never check" rule, so it's not built.

## 7. Code map

| Where | What |
|---|---|
| `services/licensing/` | The Vercel service (Hono): `src/app.ts` routes, `src/billing.ts` Stripe + code redemption, `src/codes.ts` unlock codes, `src/oidc.ts` Google/Yahoo, `src/store.ts` SQL, `src/tokens.ts` signing, `db/schema.sql`, `scripts/codes.ts` owner CLI |
| `services/licensing/test/` | 35 end-to-end tests on real SQL (PGlite) with fake Stripe and fake IdPs |
| `src/shared/brand.ts` → `LICENSING` | Origins, client ID, public keys, the `enabled` switch |
| `src/shared/license.ts` | Shared types and the entitlement decision (perpetual handling) |
| `src/main/licenseCore.ts` | PKCE, callback parsing, EdDSA verification, HTTP client |
| `src/main/licenseManager.ts` | Sign-in, renewal, billing, sign-out; no network once stamped |
| `src/main/license.ts` | Electron glue, machine ID, `license.json` + safeStorage |
| `src/main/index.ts` | `spawnAgentCore` refuses every agent spawn while unlicensed |
| `src/renderer/…/LicenseGate.tsx`, `AccountSection.tsx` | The gate and Settings → Account |

## 8. Scaling

- **The service is stateless.** Functions scale out on their own. Each license call is a handful of indexed single-row queries on Neon (HTTP driver, no connection pool to exhaust).
- **Stamped machines cost nothing:** they never call the service. Load grows only with sign-ins, trials and purchases.
- **Per-host projects:** splitting `auth.` and `api.` into two Vercel projects later is a deploy change, not a code change.
- **Teams later:** an `organizations` table with seats. The license token already carries `plan` + `features`.
