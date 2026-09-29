# ATMT Labs free-account release checklist

ATMT Labs is free after Google or Yahoo sign-in. The service remains at `services/licensing` for deployment compatibility, but checkout and trial charging are retired. See [service setup](../services/licensing/README.md), [design](../docs/licensing/DESIGN.md), and [API](../docs/licensing/API.md).

1. Deploy the account service with its existing Neon database, OAuth provider credentials, session/access secrets and Ed25519 signing key. Stripe variables are no longer needed. Preserve historical database rows and the existing signing key until old clients have migrated.
2. Remove the old Vercel daily trial-charge cron. The current `vercel.json` has no cron. Separately inspect Stripe for pending external payment intents and cancel them as appropriate. Disabling the app's charge path does not cancel already-created external payments.
3. Deploy the static website from `site/`. Confirm the homepage, `/pricing`, `/welcome`, `/guide`, `/terms`, `/privacy`, and account page all describe free access with required sign-in and no checkout links.
4. Build and distribute the new desktop app after the service is live. Before every source push, bump the app version using `npm run version:major|minor|patch` and commit `package.json` plus `package-lock.json`.
5. Verify a new Google account, a Yahoo account, an old paid account and an old unpaid account all get `status: free` after sign-in. Verify existing paid stamps stay usable offline on the original computer, then stop working after sign-out. Verify signed-out, revoked, expired free-account and wrong-device tokens block agent spawning. Confirm the app menu and Settings account section contain no purchase controls.
6. Confirm `POST /v1/billing/checkout`, `POST /v1/redeem`, and `GET /api/cron/charge-trials` return HTTP 410; confirm there is no active Stripe webhook handler that creates charges. Check logs after deployment for errors.

The proprietary software license remains in force. Free distribution does not make the source code open source. Third-party AI providers may charge users separately.
