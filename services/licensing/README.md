# ATMT Labs account service

This Vercel service runs Google/Yahoo sign-in, web account sessions, desktop OAuth with PKCE and refresh-token rotation, signed short-lived app access tokens, and signed-in computer management. **Every signed-in account receives free access.** There is no active checkout, trial charge, purchase, or unlock-code flow.

The folder keeps its historical `licensing` name and database schema so earlier accounts and payment records remain readable. `POST /v1/billing/*`, `POST /v1/redeem`, and the old trial cron return HTTP 410. The Stripe webhook acknowledges late retries without making a charge. No Stripe credentials are required for new deployments.

## Local setup

```bash
cd services/licensing
npm ci
cp .env.example .env.local
npm run keygen
npm run db:migrate
npm run typecheck
npm test
```

Set a Neon `DATABASE_URL`, `SESSION_SECRET`, `ACCESS_TOKEN_SECRET`, `LICENSE_SIGNING_KEY`, `LICENSE_SIGNING_KID`, and at least one Google or Yahoo OAuth client. The Ed25519 public key belongs in `src/shared/brand.ts` under the matching key ID. Preserve old public keys for existing app versions. The signed token is an account proof, expires after 24 hours, and is bound to the requesting computer. Refresh tokens rotate and last at most 90 days.

Google's redirect URI is `https://auth.labs.atmt.dev/login/google/callback`; Yahoo's is `https://auth.labs.atmt.dev/login/yahoo/callback`. The desktop client uses `atmtlabs://auth/callback` or a one-shot `http://127.0.0.1:<port>/callback` loopback redirect with PKCE.

The account page is `https://auth.labs.atmt.dev/account`. The app is free after sign-in; third-party AI providers may bill users separately.

## Retiring an earlier paid deployment

Deploy the account service and free desktop app together. Remove the old Vercel trial-charge cron, and disable any external Stripe automation tied to this product. Check historical pending trial/payment intents in Stripe and cancel them as appropriate: removing the app's cron prevents new app-initiated charges, but does not itself cancel an already pending external payment. Keep the historical database rows needed for customer support and legal retention. Update the marketing site and terms before announcing the free release.

Verify with an existing paid account, an old unpaid account, a new Google account, a Yahoo account, a revoked session and an expired token. All authenticated accounts should receive `status: free`; signed-out or revoked sessions should remain blocked. Then check that no checkout route redirects to Stripe and the account page has no purchase controls.
