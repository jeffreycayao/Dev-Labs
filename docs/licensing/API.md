# Licensing server contract (what the desktop app calls)

The desktop client (`src/main/licenseCore.ts`) is built against exactly this.
Design and rationale: [DESIGN.md](./DESIGN.md).

All responses are JSON. Errors are `{ "error": "<code>" }` with a matching HTTP status.

---

## auth.labs.atmt.dev — OAuth 2.0 authorization server

Public client `atmt-labs-desktop`: no secret, **PKCE S256 required**.
Registered redirect URI: `atmtlabs://auth/callback` (exact match).

### `GET /oauth/authorize`

Opened in the system browser by the app.

| Param | Value |
|---|---|
| `response_type` | `code` |
| `client_id` | `atmt-labs-desktop` |
| `redirect_uri` | `atmtlabs://auth/callback` |
| `scope` | `openid email profile offline_access` |
| `code_challenge`, `code_challenge_method` | S256 challenge, `S256` |
| `state` | Opaque; echo it back unchanged |
| `screen_hint` | Optional: `signup` opens the create-account view |

The user signs in with Google or Yahoo (OIDC; verify the ID token, key the account on `iss`+`sub`, not email).
The server then redirects to:

```
atmtlabs://auth/callback?code=<one-time code, ≤60 s, single use>&state=<state>
atmtlabs://auth/callback?error=access_denied&state=<state>        (user cancelled)
```

Render a small "You can close this tab and return to ATMT Labs" page with a
manual **Open ATMT Labs** link to the same URL; some browsers block
automatic custom-scheme redirects.

### `POST /oauth/token` (form-encoded)

Authorization code:
```
grant_type=authorization_code&code=…&code_verifier=…&redirect_uri=atmtlabs://auth/callback&client_id=atmt-labs-desktop
```
Refresh:
```
grant_type=refresh_token&refresh_token=…&client_id=atmt-labs-desktop
```
`200`:
```json
{ "access_token": "<JWT, ~15 min>", "refresh_token": "<opaque>", "expires_in": 900, "token_type": "Bearer" }
```
- **Rotate the refresh token on every use.** If a spent refresh token is presented again, revoke the whole token family (theft detection).
- Dead, spent, revoked or expired code/refresh token → `400 { "error": "invalid_grant" }`.
  This is the only response that signs the app out.
- Suggested refresh-token lifetime: 90 days sliding.

### `POST /oauth/revoke` (form-encoded, RFC 7009)

`token=…&token_type_hint=refresh_token&client_id=atmt-labs-desktop` → `200 {}` always.

### `GET /account` (web page)

Signed-in account page: devices, billing link, sign out. The app opens it as a fallback when the API is unreachable.

---

## api.labs.atmt.dev — licensing API

Bearer = the access token from `auth.`. Validate its signature, `iss`, `aud`, `exp`.
Invalid or expired → `401` (the app refreshes once and retries).

### `POST /v1/licenses`

Activate this device (idempotent) and return a fresh license token.

```json
{ "device_id": "uuid", "device_name": "Jeff-MBP", "platform": "darwin", "app_version": "0.5.0" }
```
`200 { "license": "<compact JWS>" }`

Device limit reached for a new `device_id` → `403 { "error": "device_limit" }`.

The license JWS:
- header `{ "alg": "EdDSA", "kid": "<key id>", "typ": "JWT" }`
- payload:
```json
{
  "iss": "https://api.labs.atmt.dev", "aud": "atmt-labs-desktop",
  "sub": "acct_…", "email": "…", "name": "…",
  "did": "<device_id from the request>",
  "plan": "pro", "features": [],
  "status": "trialing | active | past_due | canceled | unpaid | incomplete | incomplete_expired | paused | none",
  "trial_end": 1790000000, "period_end": 1790000000, "cancel_at_period_end": false,
  "iat": 1789400000, "exp": 1790004800
}
```
- Sign with Ed25519. Keep the private key in a KMS or secret manager, never in the repo.
- `exp - iat` = offline allowance (7 days recommended).
- Always return a token, even for `status: "none"`. The app then shows the subscribe screen with the user's email instead of a sign-in loop.

### `DELETE /v1/devices/:device_id`

Free a seat (called on sign-out). `204`.

### `POST /v1/billing/checkout`

Creates a Stripe Checkout Session (subscription, `trial_period_days=7`, card required, existing Stripe customer).
`200 { "url": "https://checkout.stripe.com/…" }`.
`success_url` → `https://labs.atmt.dev/welcome`, `cancel_url` → `https://labs.atmt.dev/pricing`.
If the account already has an entitling subscription, return the portal URL instead.

### `POST /v1/billing/portal`

Stripe Customer Portal session. `200 { "url": "https://billing.stripe.com/…" }`.

> The app only opens `https` URLs on `checkout.stripe.com`, `billing.stripe.com`, or `*.atmt.dev`.
> Anything else falls back to the public page. If you enable a Stripe custom domain for Checkout, add it to `isAllowedBillingUrl` first.

### `POST /v1/stripe/webhook`

Stripe only. Verify `Stripe-Signature`, dedupe by `event.id`. Event mapping in DESIGN.md §4.

---

## Minimal data model (Postgres)

```
accounts(id, email, name, created_at)
identities(account_id, provider, provider_sub, UNIQUE(provider, provider_sub))
subscriptions(account_id, stripe_customer_id, stripe_subscription_id, status, price_id, plan,
              trial_end, current_period_end, cancel_at_period_end, updated_at)
trial_fingerprints(card_fingerprint PRIMARY KEY, account_id, used_at)
devices(account_id, device_id, name, platform, app_version, first_seen, last_seen, revoked_at,
        UNIQUE(account_id, device_id))
refresh_tokens(id, family_id, account_id, token_hash, expires_at, used_at, revoked_at)
stripe_events(event_id PRIMARY KEY, received_at)
```
