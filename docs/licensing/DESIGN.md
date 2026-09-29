# Free account access design

The `services/licensing` folder retains its historical name for deployment compatibility. ATMT Labs is now free after Google or Yahoo sign-in. The desktop app still has a main-process gate so a hidden renderer cannot start agents. The gate is enabled in packaged builds and accepts a current, signed `status: free` account token plus a stored refresh session, or an existing machine-bound perpetual activation issued after a prior sign-in.

## Flow

1. The desktop app opens `auth.labs.atmt.dev/oauth/authorize` with PKCE and a random state. It prefers a one-shot loopback redirect on `127.0.0.1` and falls back to `atmtlabs://auth/callback`.
2. The account service signs in through Google or Yahoo, validates the provider response and verified email, then issues a one-use authorization code.
3. The app exchanges the code for a short access token and rotating refresh token, then requests `POST /v1/licenses` with a computer ID. That endpoint issues a signed, computer-bound free-account token for 24 hours. The internal endpoint name stays for older clients.
4. The app renews the account token after half its lifetime. It can work briefly offline while the token remains valid. An expired token blocks agents until renewal succeeds. Revocation or sign-out deletes the local session and blocks agents.

Older paid or unlock-code perpetual tokens keep their original machine-bound offline grant, including after a desktop update. They never renew automatically. Signing out deletes the local activation; signing in again issues the current free token. Other old purchase-state tokens do not grant access and can be renewed through an existing session. Historical purchase rows remain for customer support and legal retention; new access never depends on them.

The app account page shows identity and signed-in computers. The service does not enforce a paid-plan computer seat limit. Connector secrets remain in Electron `safeStorage`; this change does not alter provider CLI sign-ins or third-party AI billing.

## Retired paths

Checkout, trial conversion, unlock-code redemption, code administration, and the trial-charge cron are no longer active. The old purchase endpoints return HTTP 410. The old Stripe webhook acknowledges late retries without processing them. Stripe credentials are no longer required. During migration, separately inspect and cancel any pending external Stripe payment intents; deployment of this code alone does not reverse an already-created payment.

## Security boundaries

- The renderer sees only status, never OAuth refresh or access tokens.
- `spawnAgentCore` checks status in Electron main before starting every agent path.
- The signed token pins issuer, audience, signature, device ID and expiry. The server issues it only for an authenticated bearer account.
- Browser sessions use secure cookies; account form posts require a same-origin `Origin`.
- Keep existing Ed25519 public keys in `src/shared/brand.ts` during rotation.

See [API.md](API.md) for the current endpoints and [services/licensing/README.md](../../services/licensing/README.md) for deployment.
