# ATMT Labs licensing service

Accounts (Google / Yahoo, bound to email), the desktop sign-in, one-time
purchases with a 7-day card trial (Stripe), and the signed licenses the app
stamps onto each machine. One Vercel project serving **auth.labs.atmt.dev** and
**api.labs.atmt.dev** from Singapore (`sin1`), with Neon Postgres in Singapore.

Design and rules: [docs/licensing/DESIGN.md](../../docs/licensing/DESIGN.md) ·
Endpoints: [docs/licensing/API.md](../../docs/licensing/API.md)

```
npm install
npm run typecheck
npm test            # 25 end-to-end tests: real SQL (PGlite), fake Stripe + Google/Yahoo
```

## Go-live runbook

Everything secret lives in **`.env.local`** (git-ignored) on your machine. You
push it to Vercel with one command. Nothing secret is ever committed.

### 1. Vercel project
1. Vercel → **Add New → Project** → import this repo.
2. Set **Root Directory** to `services/licensing` and **Framework Preset** to **Other**.
3. Deploy once. The region comes from `vercel.json` (`sin1`, Singapore).
4. **Settings → Domains:** add `auth.labs.atmt.dev` and `api.labs.atmt.dev`.
   Create the DNS records Vercel shows you at your DNS host for `atmt.dev`.
5. On your desktop, in this folder:
   ```
   npm i -g vercel
   vercel link
   ```

### 2. Database: Neon via the Vercel Marketplace (Singapore)
1. Vercel project → **Storage → Create Database → Neon**.
2. Pick the **Singapore** region (AWS `ap-southeast-1`) and connect it to this project.
   The integration injects `DATABASE_URL` for you.
3. Locally:
   ```
   vercel env pull .env.local     # brings DATABASE_URL down
   npm run keygen                 # adds session/access/cron secrets + the license signing key
   npm run db:migrate             # creates the tables (safe to re-run)
   ```
   `keygen` prints the license **public** key. Keep that output for step 6.

### 3. Google sign-in
In [console.cloud.google.com](https://console.cloud.google.com), under APIs & Services:
1. Set up the **OAuth consent screen**: External, scopes `openid`, `email`, `profile`. Publish it.
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Add the authorized redirect URI: `https://auth.labs.atmt.dev/login/google/callback`.
4. Put `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` in `.env.local`.

### 4. Yahoo sign-in
At [developer.yahoo.com/apps](https://developer.yahoo.com/apps):
1. Create an app with the redirect URI `https://auth.labs.atmt.dev/login/yahoo/callback`.
2. Under API permissions, enable **OpenID Connect: Email and Profile**.
3. Put `YAHOO_CLIENT_ID` and `YAHOO_CLIENT_SECRET` in `.env.local`.

Either provider can be left out: its button simply doesn't show.

### 5. Stripe
1. **Product:** "ATMT Labs lifetime license", with **one** price that is **one-time** (not recurring). Put that `price_…` ID in `STRIPE_PRICE_ID`.
2. **Developers → API keys:** put the secret key in `STRIPE_SECRET_KEY`.
3. **Developers → Webhooks → Add endpoint:** `https://api.labs.atmt.dev/v1/stripe/webhook`
   with these events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`

   Put its signing secret in `STRIPE_WEBHOOK_SECRET`.
4. **Settings → Customer emails:** turn on receipts for successful payments.
5. **Settings → Billing → Customer portal:** allow payment method updates and invoice history.

Test everything with test-mode keys first. Stripe's `4000 0027 6000 3184` card forces the 3-D Secure path on the day-7 charge.

### 6. Push and switch on
```
npm run env:push                      # every value in .env.local → Vercel (production)
npm run env:push -- --target=preview  # optional: preview deployments too
vercel --prod
```
Then, in the desktop app repo:
1. Paste the `keygen` public key into `src/shared/brand.ts` → `LICENSING.publicKeys`.
2. Set `enabled: true` and release.

A stamped machine keeps its token forever, so **never remove a public key from the app** once licenses have been signed with it.

### 7. Landing page (labs.atmt.dev)
- **Start free trial** → `https://auth.labs.atmt.dev/start?plan=trial`
- **Buy** → `https://auth.labs.atmt.dev/start?plan=buy`
- Checkout returns to `https://labs.atmt.dev/welcome?trial=1` or `?paid=1`. Put the downloads there.

## Local and staging testing against the desktop app

Run a dev build of the app against a deployed preview (or `vercel dev`):
```
ATMT_LICENSE_ENFORCE=1 \
ATMT_AUTH_ORIGIN=https://<preview>.vercel.app ATMT_API_ORIGIN=https://<preview>.vercel.app \
ATMT_LICENSE_ISSUER=https://api.labs.atmt.dev \
ATMT_LICENSE_PUBLIC_KEY="<public PEM from keygen>" ATMT_LICENSE_KID=<LICENSE_SIGNING_KID> \
npm run dev
```
These overrides are ignored in packaged builds.

## Operations

- **Daily cron (01:00 UTC)** charges trials that reached day 7. The app also triggers the charge itself when it renews after day 7, so most customers are charged at the moment the trial ends. On Vercel Pro you can make the cron hourly in `vercel.json`.
- **Refund:** refund in Stripe. The webhook marks the license `refunded` (see DESIGN.md §6 for what that can and can't do).
- **Rate limits:** add Vercel Firewall rules for `/oauth/token` and `/login/*` if you see abuse.
