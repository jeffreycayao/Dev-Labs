# jepoy.dev — the DevLabs website

Static HTML and CSS with no build step on Vercel. One server function, `api/download.js`, handles download links. A small motion script (`assets/js/site.js`) adds smooth scrolling, scroll reveals and the 3D hero; the pages work fully without it.
The pages use the live visual language of
[automatika.ph](https://www.automatika.ph/): dark espresso surfaces, lime
accents, Instrument Serif headlines, Manrope body text, and IBM Plex Mono
labels. Fonts are self-hosted under `assets/fonts/` with their OFL notice.

| Path | File | Who links to it |
|---|---|---|
| `/` | `index.html` | Everything: the landing page and funnel |
| `/download/:os` | `api/download.js` | Download buttons. Redirects to the installer in the **latest public release** (see below) |
| `/guide` | `guide.html` | Nav and footer. HTML copy of `docs/USER_GUIDE.md`; update both together |
| `/privacy` | `privacy.html` | Footer. Published Privacy Policy (based on `PRIVACY.md`) |

`/welcome`, `/pricing` and `/terms` are old links; `vercel.json` redirects them.

## Deploy (Vercel)

1. Vercel → **Add New → Project** → this repo. Set **Root Directory** to `site` and **Framework Preset** to **Other**, with no build command.
2. **Settings → Domains:** add `jepoy.dev`.

## Before launch, fill in

- **Video:** replace the placeholder in `index.html` (search `VIDEO PLACEHOLDER`). If you embed YouTube or Vimeo, add that host to `frame-src` in `vercel.json`'s Content-Security-Policy.
- **Privacy:** when you change `privacy.html`, update its "Last updated" date and `PRIVACY.md`.

## Download links (automatic)

`/download/mac`, `/download/mac-zip`, `/download/windows`, `/download/windows-portable` and `/download/linux` are handled by a small Vercel function, `api/download.js`. It asks GitHub for the latest stable release of `jeffreycayao/Dev-Labs` and redirects to the matching installer. The CDN caches each redirect for 5 minutes, so a new release shows up within about 5 minutes of the release being published. You don't edit the site for a release.

- If GitHub is unreachable, or the release has no file for that platform, the link opens the public releases page instead.
- Prereleases and drafts are skipped (GitHub's "latest" is the newest stable release).
- Optional: set a `GITHUB_TOKEN` environment variable on this Vercel project (a fine-grained token with no permissions, or public read-only) to raise GitHub's API rate limit. It isn't needed at normal traffic because redirects are cached.
- If you rename installers in `electron-builder.yml` (`artifactName`), update `PLATFORMS` in `api/download.js`. `test/site-download.test.cjs` fails if they drift apart.

## Motion and 3D (assets/js)

- `assets/js/site.js` (~22 KB): [Lenis](https://github.com/darkroomengineering/lenis) smooth scroll, scroll reveals, count-up numbers, card spotlight, nav blur, scroll progress bar.
- `assets/js/hero3d-*.js` (~135 KB gzipped): a [three.js](https://threejs.org) night city behind the hero. Loaded lazily, only on screens 720px and wider with WebGL, and paused when off screen.
- Everything is off for visitors with "reduce motion" turned on, and the pages read normally with scripts blocked.
- These files are **built output**. Edit `tools/site-bundle/src/`, then run `npm install && npm run build` in `tools/site-bundle` and commit the result. Vercel still has no build step.
- The CSP allows `script-src 'self'` only. It blocks inline `style="…"` attributes, so use classes in `assets/site.css` (see the `.mt-*` utilities).
