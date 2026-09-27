# Licensing service contract

Implemented in `services/licensing` and called by `src/main/licenseCore.ts`.
Design: [DESIGN.md](./DESIGN.md).

JSON errors are `{ "error": "<code>" }`.

---

## auth.labs.atmt.dev

### Desktop OAuth 2.0 (public client, PKCE S256 required)

The client ID is `atmt-labs-desktop`. Two redirect URIs are accepted:
- **Loopback (what the app uses):** `http://127.0.0.1:<port>/callback`, any port 1024–65535 ([RFC 8252 §7.3](https://datatracker.ietf.org/doc/html/rfc8252#section-7.3)). The app opens a one-shot listener on an OS-assigned port for each sign-in. Only the literal `127.0.0.1` is accepted, never `localhost`.
- **Fallback:** `atmtlabs://auth/callback` (exact match), used when the listener cannot start. Browsers do not reliably hand custom schemes to apps, so it is no longer the default.

**`GET /oauth/authorize`** takes these parameters:

| Parameter | Value |
|---|---|
| `response_type` | `code` |
| `client_id` | `atmt-labs-desktop` |
| `redirect_uri` | `http://127.0.0.1:<port>/callback` or `atmtlabs://auth/callback` |
| `code_challenge` | 43 characters |
| `code_challenge_method` | `S256` |
| `state` | Echoed back unchanged |
| `screen_hint` | Optional: `signup` |

Behaviour:
- **Unregistered `redirect_uri` or `client_id`:** an error page. It never redirects.
- **Signed-in browser, loopback:** a plain `302` to `http://127.0.0.1:<port>/callback?code=…&state=…`. The app's listener answers with its own "You're signed in" page.
- **Signed-in browser, `atmtlabs://`:** a hand-off page that redirects to `atmtlabs://auth/callback?code=…&state=…`, with a visible **Open ATMT Labs** button as a fallback.
- **Otherwise:** the login page (Google / Yahoo), then `/oauth/continue` issues the code.
- **Errors** after the redirect URI is validated go back to that same URI with `?error=…&state=…`.
- **Codes:** single use, valid for 60 s, stored hashed, and pinned to the exact `redirect_uri` they were issued for.

**`POST /oauth/token`** (form-encoded) supports two grants:
- `grant_type=authorization_code&code&code_verifier&redirect_uri&client_id`. `redirect_uri` must equal the one the code was issued for.
- `grant_type=refresh_token&refresh_token&client_id`

Returns `{ access_token (HS256, 15 min), refresh_token, token_type: "Bearer", expires_in: 900 }`.

Refresh tokens:
- They rotate on every use and live for 90 days.
- **Replaying a spent refresh token revokes the whole token family.**
- Any bad, spent or revoked code or token returns `400 invalid_grant`, the only response that signs the app out.

**`POST /oauth/revoke`** (form-encoded, RFC 7009): `token=…&client_id=…` → `200 {}`.

### Web

| Route | What |
|---|---|
| `GET /login?next=&signup=1` | Login page |
| `GET /login/:provider` → IdP → `GET /login/:provider/callback` | OIDC with Google/Yahoo using discovery, `state` + `nonce`, and PKCE where offered. A verified email is required; the account is keyed on it. |
| `GET /account` | License state, trial end, one-time price, devices, buttons |
| `POST /account/trial` · `/account/buy` · `/account/billing` · `/account/trial/cancel` · `/account/devices/:id/remove` · `/logout` | Account forms: Origin checked and SameSite=Lax |
| `GET /start?plan=trial\|buy` | Funnel entry for the landing page's CTA buttons |
| `GET /redeem?code=` | Shareable voucher link: sign in (sign-up screen), then the account page with the code pre-filled. **Never redeems on GET** (link previews would spend it). |
| `GET /admin` | Owner-only unlock-code page. Signed-out → login. Allowed only for `ADMIN_EMAILS` with a Google session under 12 h old (otherwise → `/login/google?next=/admin`); anyone else gets `404`. `noindex`. |
| `GET /admin/manifest.webmanifest` | Web app manifest for installing `/admin` (scope and start URL `/admin`, standalone). Fetched with the session cookie (`crossorigin="use-credentials"`). Owner email only; anyone else gets `404`. `private, no-cache`. |
| `POST /admin/codes` (`count` 1–500, `label`, `expires=YYYY-MM-DD`) | Mint codes. Renders them once in the response (never in a URL). Origin checked. |
| `POST /admin/codes/revoke` (`code=` or `hash=`) | Revoke an unused code. Redirects to `/admin?notice=…`. Origin checked. |
| `POST /account/redeem` (`code=`) | Redeem an unlock code from the account page. Origin checked. Redirects to `/account?notice=…` (`ok=1` on success). |

Account pages use `Referrer-Policy: same-origin`: browser form posts include the real Origin for the account CSRF check, while links to other sites send no referrer.

---

## api.labs.atmt.dev

All `/v1/*` routes except the webhook require `Authorization: Bearer <access_token>`. A missing or invalid token returns `401`.

**`POST /v1/licenses`** takes `{ device_id, device_name, platform, app_version }` and returns `200 { license }`.
- A trial past day 7 is charged here, immediately.
- Trialing and active accounts stamp the device. A new device over `MAX_DEVICES` returns `403 { "error": "device_limit" }`.
- License claims: DESIGN.md §5.

**`POST /v1/redeem`** takes `{ code }` and redeems a single-use unlock code for the signed-in account:
- `200 { ok: true, status: "active" }`: the account now has a lifetime license (`source = unlock_code`, amount 0). Call `/v1/licenses` next to get the perpetual token.
- `400 { error: "code_invalid" }`: malformed, never minted, or revoked.
- `409 { error: "code_used" | "code_expired" | "already_licensed" }`.
- An account that is already `active` never spends a code; the code stays usable for someone else.
- A running trial ends without a charge. A day-7 PaymentIntent waiting for 3-D Secure is cancelled.
- Code format: `ATMT-XXXXX-XXXXX-XXXXX-XXXXX` (Crockford base32, 100 bits). Case, spaces, dashes and O/0, I/L/1 are forgiven. Only a SHA-256 is stored.

**`DELETE /v1/devices/:id`** frees a seat and returns `204`. It does not un-stamp a perpetual machine.

**`POST /v1/billing/checkout`** → `{ url }`:
- Status `none`, trial never used: a trial Checkout (setup mode).
- Otherwise: a one-time payment Checkout.
- Trialing or active: the account page.

**`POST /v1/billing/portal`** → `{ url }`: the account page.

**`POST /v1/stripe/webhook`** is Stripe only:
- The `Stripe-Signature` header is verified, and events are de-duplicated by `event.id`.
- A handler error returns `500`, so Stripe retries.

| Event | Effect |
|---|---|
| `checkout.session.completed` (setup, `purpose=trial`) | Save the card as default, check the fingerprint → `trialing` for 7 days, or `payment_required` if the card was already used for a trial |
| `checkout.session.completed` (payment, paid) | `active` |
| `payment_intent.succeeded` (`trial_conversion` or `purchase`) | `active` |
| `payment_intent.payment_failed` (`trial_conversion`) | `payment_required` |
| `charge.refunded` (full), `charge.dispute.created` | `refunded`, except a license later granted by an unlock code |

**`GET /api/cron/charge-trials`** requires `Authorization: Bearer $CRON_SECRET` (Vercel Cron sends it). It charges every due trial and returns `{ attempted, paid, failed }`.

**`GET /health`** → `{ ok: true }`.
