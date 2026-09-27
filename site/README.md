# labs.atmt.dev — the ATMT Labs Floor website

Static HTML and CSS, with no build step and no JavaScript. It follows
`brand/Automatika-Design-System-v2.md`, like the auth pages.

| Path | File | Who links to it |
|---|---|---|
| `/` | `index.html` | Everything: the landing page and funnel |
| `/welcome` | `welcome.html` | Stripe Checkout success (`?trial=1` / `?paid=1`): downloads and first steps |
| `/pricing` | `pricing.html` | The app, when signed out or offline |
| `/terms`, `/privacy` | **not yet** | Sign-in page and app license screen. Publish `EULA.md` / `PRIVACY.md` here after legal review |

## Deploy (Vercel)

1. Vercel → **Add New → Project** → this repo. Set **Root Directory** to `site` and **Framework Preset** to **Other**, with no build command.
2. **Settings → Domains:** add `labs.atmt.dev`.

## Before launch, fill in

- **Video:** replace the placeholder in `index.html` (search `VIDEO PLACEHOLDER`). If you embed YouTube or Vimeo, add that host to `frame-src` in `vercel.json`'s Content-Security-Policy.
- **Price:** replace "Pay once" with the amount of your Stripe price (search `PRICE:` in `index.html`).
- **Downloads:** point the three `/download/*` redirects in `vercel.json` at your installers.
- **Legal:** `/terms` and `/privacy`.
