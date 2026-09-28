# labs.atmt.dev — the ATMT Labs Floor website

Static HTML and CSS, with no build step and no JavaScript. The landing,
welcome, and pricing pages use the live visual language of
[automatika.ph](https://www.automatika.ph/): dark espresso surfaces, lime
accents, Instrument Serif headlines, Manrope body text, and IBM Plex Mono
labels. Fonts are self-hosted under `assets/fonts/` with their OFL notice.
The auth pages currently use a separate, older brand treatment.

| Path | File | Who links to it |
|---|---|---|
| `/` | `index.html` | Everything: the landing page and funnel |
| `/welcome` | `welcome.html` | Stripe Checkout success (`?trial=1` / `?paid=1`): downloads and first steps |
| `/pricing` | `pricing.html` | The app, when signed out or offline |
| `/guide` | `guide.html` | Footer, welcome page. HTML copy of `docs/USER_GUIDE.md`; update both together |
| `/terms` | `terms.html` | Sign-in page, app license screen, footer. Published Terms of Service + license (based on `EULA.md`) |
| `/privacy` | `privacy.html` | Sign-in page, app license screen, footer, Google OAuth consent screen. Published Privacy Policy (based on `PRIVACY.md`) |

## Deploy (Vercel)

1. Vercel → **Add New → Project** → this repo. Set **Root Directory** to `site` and **Framework Preset** to **Other**, with no build command.
2. **Settings → Domains:** add `labs.atmt.dev`.

## Before launch, fill in

- **Video:** replace the placeholder in `index.html` (search `VIDEO PLACEHOLDER`). If you embed YouTube or Vimeo, add that host to `frame-src` in `vercel.json`'s Content-Security-Policy.
- **Price:** replace "Pay once" with the amount of your Stripe price (search `PRICE:` in `index.html`).
- **Downloads:** point the three `/download/*` redirects in `vercel.json` at your installers.
- **Legal:** fill every `[CONFIRM]` in `terms.html` and `privacy.html` (search `class="todo"`), have them reviewed, then delete the `DRAFT BANNER` paragraph at the top of each.
- **Google sign-in verification:** in Google Cloud → OAuth consent screen, set the homepage to `https://labs.atmt.dev`, privacy policy to `https://labs.atmt.dev/privacy`, terms to `https://labs.atmt.dev/terms`, and add `labs.atmt.dev` and `atmt.dev` as authorised domains (verify the domain in Search Console).
