# ATMT Labs — Go-Live Checklist (Licensing & Payments)

How to take the licensing service from "merged" to "live in production".

All the code is already on `main`. What remains is creating accounts, domains
and keys, which only the owner can do.

| What | Where |
|---|---|
| Service code | `services/licensing/` |
| Detailed runbook | [`services/licensing/README.md`](../services/licensing/README.md) |
| Design & rules | [`docs/licensing/DESIGN.md`](../docs/licensing/DESIGN.md) |
| API contract | [`docs/licensing/API.md`](../docs/licensing/API.md) |

Run every command below **on your own computer**, from the
`services/licensing` folder. Secrets live only in `services/licensing/.env.local`,
which git ignores. **Never commit it.**

---

## Overview

| # | Step | Time | Who |
|---|---|---|---|
| 1 | Vercel project + domains | ~10 min | You (or Claude via the Vercel connector) |
| 2 | Neon database (Singapore) | ~5 min | You (or Claude via the Vercel connector) |
| 3 | Google sign-in | ~10 min | You |
| 4 | Yahoo sign-in (optional at first) | ~10 min | You |
| 5 | Stripe (test mode first) | ~15 min | You |
| 6 | Push env + deploy | ~5 min | You |
| 7 | Turn licensing on in the app | ~5 min + release | Claude can do it once you send the public key |
| 8 | Landing page buttons + `/welcome` page | varies | You |
| 9 | End-to-end test, then switch Stripe to live | ~30 min | You |
| 10 | Legal: finalize EULA + Privacy Policy, publish on the site | varies | You + a lawyer |
| 11 | (Optional) Mint unlock codes for free users | ~2 min | You |
| 12 | App release: signing, update feed, downloads | varies | You (+ Claude for config) |

---

## 1. Vercel project + domains

1. In Vercel, go to **Add New → Project** and import `jeffreycayao/ATMT_LABS_FLOOR`.
2. Set **Root Directory** to `services/licensing` and **Framework Preset** to **Other**, then deploy.
   - The first deploy will error on missing env vars. That's expected; it's fixed in step 6.
   - The region (`sin1`, Singapore) comes from `vercel.json` automatically.
3. Go to **Settings → Domains** and add:
   - `auth.labs.atmt.dev`
   - `api.labs.atmt.dev`
4. At your DNS host for `atmt.dev`, create the **2 CNAME records** Vercel shows you.
5. On your computer:
   ```bash
   npm i -g vercel
   cd services/licensing
   vercel link
   ```

## 2. Neon database (Singapore)

1. In the Vercel project, go to **Storage → Create Database → Neon**.
2. Choose the **Singapore** region (AWS `ap-southeast-1`) and connect it to the project.
   The integration sets `DATABASE_URL` for you.
3. On your computer:
   ```bash
   npm install
   vercel env pull .env.local   # brings DATABASE_URL down
   npm run keygen               # generates secrets + the license signing key
   npm run db:migrate           # creates the tables (safe to re-run)
   ```
4. **Save the public key that `keygen` prints.** You need it in step 7.

## 3. Google sign-in

At [console.cloud.google.com](https://console.cloud.google.com), under APIs & Services:

1. **OAuth consent screen:** choose External and add the scopes `openid`, `email`, `profile`.
   Fill in the app name, support email and logo, then **Publish**.
2. **Credentials → Create credentials → OAuth client ID**, type **Web application**.
3. Add the authorized redirect URI:
   ```
   https://auth.labs.atmt.dev/login/google/callback
   ```
4. Put the values in `.env.local`:
   ```
   GOOGLE_CLIENT_ID=...
   GOOGLE_CLIENT_SECRET=...
   ```

## 4. Yahoo sign-in (optional at first)

The Yahoo button only appears once these values are set, so you can launch with Google only.

At [developer.yahoo.com/apps](https://developer.yahoo.com/apps):

1. Create an app with the redirect URI:
   ```
   https://auth.labs.atmt.dev/login/yahoo/callback
   ```
2. Under API permissions, enable **OpenID Connect: Email and Profile**.
3. Put the values in `.env.local`:
   ```
   YAHOO_CLIENT_ID=...
   YAHOO_CLIENT_SECRET=...
   ```

## 5. Stripe (start in TEST mode)

At [dashboard.stripe.com](https://dashboard.stripe.com), with **Test mode ON**:

1. **Product:** "ATMT Labs lifetime license", with **one price** that is **one-time** (not recurring).
   ```
   STRIPE_PRICE_ID=price_...
   ```
2. **Developers → API keys:**
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
3. **Developers → Webhooks → Add endpoint:**
   ```
   https://api.labs.atmt.dev/v1/stripe/webhook
   ```
   Select these 5 events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `charge.dispute.created`

   Then copy the signing secret:
   ```
   STRIPE_WEBHOOK_SECRET=whsec_...
   ```
4. **Settings → Customer emails:** turn on receipts for successful payments.

## 6. Push env + deploy

```bash
npm run env:push              # uploads every value in .env.local to Vercel (production)
vercel --prod
```

Check that it's live: <https://api.labs.atmt.dev/health> should return `{"ok":true}`,
and <https://auth.labs.atmt.dev/login> should show the sign-in page.

## 7. Turn licensing on in the desktop app

1. Paste the public key from step 2 into `src/shared/brand.ts` → `LICENSING.publicKeys`,
   in the exact format `keygen` printed.
2. Set `enabled: true`.
3. Build and release the app.

> The public key is safe to share: send it to Claude and it will make this
> change and open the PR. The **private** key (`LICENSE_SIGNING_KEY` in
> `.env.local`) must never leave your machine or Vercel.

## 8. Landing page (labs.atmt.dev)

The site lives in `site/` (static, no build). Deploy it as a **separate Vercel project** with Root Directory `site`, then add the domain `labs.atmt.dev`. `/`, `/welcome` and `/pricing` are done. Still to fill in: the video, the price, the download redirects and `/terms` + `/privacy`. See `site/README.md`.

The app and the licensing service link to these pages. **Each one must exist before launch:**

| Page | Who links to it | What it needs |
|---|---|---|
| `/` | Everything | Product, price, CTA buttons (below), download section |
| `/welcome?trial=1` · `/welcome?paid=1` | Stripe Checkout success | "You're in" + download links for macOS / Windows / Linux |
| `/pricing` | The app, when signed out or offline | Price, trial terms ("card required, charged once on day 7"), the two CTA buttons |
| `/terms` | Sign-in page, app license screen, LICENSE | The final **EULA** (`EULA.md`, after legal review) |
| `/privacy` | Sign-in page, app license screen | The final **Privacy Policy** (`PRIVACY.md`, after legal review) |

| Button | Link |
|---|---|
| Start 7-day free trial | `https://auth.labs.atmt.dev/start?plan=trial` |
| Buy lifetime license | `https://auth.labs.atmt.dev/start?plan=buy` |

After Checkout, customers land on `https://labs.atmt.dev/welcome?trial=1`
or `?paid=1`. **Build that page with the download links.**

## 9. Test end to end, then go live

**Test mode run:**

1. Set `TRIAL_DAYS=1` for a short test, then run `npm run env:push -- --force` and `vercel --prod`.
2. Sign up from the landing page button using card `4242 4242 4242 4242`
   (any future date, any CVC). Confirm Checkout says *"Nothing is charged today…"*.
3. Open the app and sign in. It should show the trial.
4. After the trial, the app or the daily job charges once. The app should show the lifetime license.
5. Try the 3-D Secure path with card `4000 0027 6000 3184`. The app should ask you to complete the purchase.
6. Try canceling a trial on `https://auth.labs.atmt.dev/account`. No charge should happen.

**Switch to live:**

1. In Stripe **live** mode, recreate the product and price, the webhook endpoint and receipt emails.
2. Update `.env.local` with the live `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `STRIPE_PRICE_ID`.
   Set `TRIAL_DAYS=7`.
3. Run `npm run env:push -- --force` and `vercel --prod`.

---

## 10. Legal

1. **Resolve every `[CONFIRM]` in `EULA.md` and `PRIVACY.md`:**
   - refund window;
   - device limit;
   - whether a license covers a team;
   - whether future major versions are included;
   - governing law and venue;
   - registered address;
   - DPO;
   - PostHog region.
2. Have both **reviewed by a lawyer**. For a Philippine business, include the Data Privacy Act (RA 10173) registration and DPO duties.
3. Publish them at `/terms` and `/privacy`.
4. In Stripe, go to **Settings → Public details** and set the Terms of service and Privacy policy URLs. Stripe shows them at Checkout.

## 11. Unlock codes (free lifetime licenses)

For beta testers, partners, giveaways. No Stripe, no card.

```bash
cd services/licensing
npm run db:migrate                       # once, to add the unlock_codes table (safe to re-run)
npm run codes -- create --count 10 --label "Beta testers" --expires 2026-12-31
npm run codes -- list
npm run codes -- revoke ATMT-XXXXX-XXXXX-XXXXX-XXXXX
```

- **Codes are printed once.** Send each person their code, or the link printed next to it (`https://auth.labs.atmt.dev/redeem?code=…`).
- **Where they redeem:** in the app (**Have an unlock code?** on the license screen) or on the account page.
- **Each code works once.** An account that already has a license never uses a code up.

## 12. App release (installers + updates)

1. **Update feed.** Auto-update and the release links are off until `GITHUB_REPO` is set in `src/shared/brand.ts` and `publish:` is uncommented in `electron-builder.yml` (see `RELEASE.md`).
   - This repo is **private**, and customers can't download from a private repo's releases.
   - Use a **separate public releases-only repo** (installers, no source), or another update host.
2. **Code signing.**
   - **macOS:** a "Developer ID Application" certificate plus `APPLE_*` notarization secrets in CI.
   - **Windows:** a code-signing certificate, or SmartScreen warns every user.
3. **Telemetry (optional):** the PostHog key goes into release CI only (`TELEMETRY.md`).
4. **Release gate:** follow `RELEASE-CHECKLIST.md`. Ship a signed rc first, then the real release, with **`LICENSING.enabled = true`** and your public key in it (step 7).

## Rules to never break

- **Never commit `.env.local`** or paste the private signing key anywhere public.
- **Never change or remove the license signing key after launch.**
  - Every paid machine holds a license signed with it, forever.
  - If you ever rotate it, add the new public key to the app **alongside** the old one. Never replace it.
- **Refunds don't reach machines that are already licensed** (they never check in again).
  - Refunding someone blocks new activations only.
  - See `docs/licensing/DESIGN.md` §6.

## Defaults you can change (`.env.local`, then `env:push --force`)

| Variable | Default | Meaning |
|---|---|---|
| `TRIAL_DAYS` | `7` | Free trial length |
| `MAX_DEVICES` | `3` | Computers per license |

**Day-7 charge timing:** the daily job runs at 01:00 UTC, and the app also charges the
moment it's opened after the trial ends. On Vercel Pro you can make the job hourly in
`services/licensing/vercel.json`.
