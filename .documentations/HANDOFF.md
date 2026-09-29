# ATMT Labs free-account handoff

The product now uses free access with required Google/Yahoo sign-in for new accounts. The desktop app expects a short-lived signed `status: free` token from the account service. Existing machine-bound paid or unlock-code activations keep their original offline grant until sign-out. Trial conversion, Stripe checkout, unlock-code administration and redemption, and scheduled trial charges have been removed from active routes.

For the current design, endpoints, setup and release checks, read [docs/licensing/DESIGN.md](../docs/licensing/DESIGN.md), [docs/licensing/API.md](../docs/licensing/API.md), [services/licensing/README.md](../services/licensing/README.md), and [GO_LIVE.md](GO_LIVE.md).

Historical payment data stays in the database for support and legal retention. Before announcing or deploying the free release, check Stripe for any pending external payment intents from the old trial flow. Deploy the account service before the new desktop app so its free tokens are available as soon as users update. The website and legal copy must be deployed with the change.
