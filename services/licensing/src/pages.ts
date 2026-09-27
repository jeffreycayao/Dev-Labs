/**
 * Server-rendered pages for auth.labs.atmt.dev. No client JS at all (the CSP
 * says `script-src 'none'`); every value is HTML-escaped.
 */
import type { AccountRow, DeviceRow, LicenseRow, UnlockCodeRow } from './store.js';
import { unlockCodeState } from './codes.js';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export const PAGE_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'cache-control': 'no-store'
};

/**
 * Automatika Design System v2 (brand/Automatika-Design-System-v2.md): white
 * and cream ground, charcoal type, lime #C7FD11 only for the one primary
 * action, Poppins headings over Inter body, rounded cards with a soft shadow.
 * Fonts and logos are served by this service (src/brandAssets.ts).
 */
const CSS = `
@font-face{font-family:Poppins;font-style:normal;font-weight:600;font-display:swap;src:url(/brand/fonts/poppins-latin-600-normal.woff2) format('woff2')}
@font-face{font-family:Poppins;font-style:normal;font-weight:700;font-display:swap;src:url(/brand/fonts/poppins-latin-700-normal.woff2) format('woff2')}
@font-face{font-family:Inter;font-style:normal;font-weight:400 700;font-display:swap;src:url(/brand/fonts/inter-latin-var.woff2) format('woff2')}
:root{--bg:#faf8f2;--panel:#ffffff;--ink:#111827;--muted:#4b5563;--line:#e5e7eb;--soft:#f5f3ec;--accent:#c7fd11;--on-accent:#111827;--danger:#b42318;--danger-bg:#fef3f2;--ok-bg:#f6ffdb;--ok-line:#a8d80e;--shadow:0 10px 25px rgba(0,0,0,.06)}
@media (prefers-color-scheme: dark){:root{--bg:#0f1115;--panel:#171a21;--ink:#f3f4f6;--muted:#a1a7b3;--line:#2a2f3a;--soft:#1d212a;--danger:#f97066;--danger-bg:#2a1715;--ok-bg:#1d2508;--ok-line:#7fa30a;--shadow:0 10px 25px rgba(0,0,0,.35)}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;background:var(--bg);color:var(--ink);font:16px/1.6 Inter,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:32px 16px}
main{width:100%;max-width:480px;background:var(--panel);border:1px solid var(--line);border-radius:18px;box-shadow:var(--shadow);padding:32px}
main.wide{max-width:980px}
.brand{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 24px;padding-bottom:20px;border-bottom:1px solid var(--line)}
.brand img{display:block;height:30px;width:auto}
.product{font:600 12px/1 Poppins,Inter,sans-serif;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);white-space:nowrap}
h1,h2{font-family:Poppins,Inter,system-ui,sans-serif;font-weight:700;letter-spacing:-.01em;margin:0 0 6px}
h1{font-size:24px;line-height:1.3}h2{font-size:18px;margin-top:28px}
p{margin:8px 0;color:var(--muted)}a{color:inherit}
.btn{display:block;width:100%;text-align:center;padding:12px 16px;margin:12px 0 0;border:1px solid var(--line);border-radius:12px;background:var(--panel);color:var(--ink);font:600 15px/1.4 Inter,system-ui,sans-serif;cursor:pointer;text-decoration:none;transition:transform .3s ease,box-shadow .3s ease,background-color .3s ease}
.btn:hover{transform:translateY(-1px);box-shadow:0 6px 16px rgba(0,0,0,.08)}
.btn:focus-visible,input:focus-visible,textarea:focus-visible,summary:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
.btn.primary{background:var(--accent);border-color:var(--accent);color:var(--on-accent)}
.btn.danger{color:var(--danger);border-color:var(--danger)}
.row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-top:1px solid var(--line);align-items:center}
.row form{margin:0}.row .btn,td .btn{width:auto;margin:0;padding:6px 12px;font-size:13px;border-radius:10px}
.tag{display:inline-block;padding:3px 12px;border-radius:999px;background:var(--accent);color:var(--on-accent);font:600 12px/1.5 Inter,sans-serif}
.err{border:1px solid var(--danger);background:var(--danger-bg);color:var(--danger);border-radius:12px;padding:10px 14px;margin:12px 0}
.ok{border:1px solid var(--ok-line);background:var(--ok-bg);color:var(--ink);border-radius:12px;padding:10px 14px;margin:12px 0}
input,textarea{width:100%;padding:11px 12px;margin:10px 0 0;border:1px solid var(--line);border-radius:10px;background:var(--panel);color:var(--ink);font:15px/1.4 Inter,system-ui,sans-serif}
input[name=code],textarea{font-family:ui-monospace,"SF Mono",Menlo,Consolas,monospace;letter-spacing:.04em}
textarea{min-height:140px;font-size:13px;line-height:1.6}
details{margin-top:18px}summary{cursor:pointer;color:var(--muted);font-weight:500}
small{color:var(--muted);font-size:13px}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
label{display:block;font-size:13px;font-weight:500;color:var(--muted);margin-top:10px}label input,label textarea{margin-top:4px}
.scroll{overflow-x:auto;border:1px solid var(--line);border-radius:14px;margin-top:8px}
table{width:100%;border-collapse:collapse;font-size:14px}
th,td{text-align:left;padding:10px 12px;border-top:1px solid var(--line);vertical-align:middle}
thead th{border-top:0;background:var(--soft);color:var(--muted);font-weight:600;font-size:13px}
td form{margin:0}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:12px;margin:12px 0}
.stats span{display:block;border:1px solid var(--line);border-radius:14px;padding:12px 14px;color:var(--muted);font-size:13px}
.stats b{display:block;font:700 28px/1.2 Poppins,Inter,sans-serif;color:var(--ink)}
footer{color:var(--muted);font-size:13px}
th,td{white-space:nowrap}
@media (max-width:520px){body{padding:16px 12px}main{padding:22px 18px}.brand img{height:24px;width:auto}}`;

const HEAD = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0f1115" media="(prefers-color-scheme: dark)">`;

const LOGO = `<picture><source srcset="/brand/logo-on-dark.webp" media="(prefers-color-scheme: dark)"><img src="/brand/logo-on-light.webp" alt="automatika" width="186" height="30"></picture>`;

function page(title: string, body: string, extraHead = '', wide = false): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ATMT Labs</title>${HEAD}${extraHead}<style>${CSS}</style></head>
<body><main${wide ? ' class="wide"' : ''}><div class="brand">${LOGO}<span class="product">ATMT Labs</span></div>${body}</main>
<footer>ATMT Labs by automatika™</footer></body></html>`;
}

/** Legal pages live on the marketing site (labs.atmt.dev). */
function legal(site: string): string {
  return `<p><small>By continuing you agree to the <a href="${esc(site)}/terms" style="color:inherit">ATMT Labs License Agreement</a> and <a href="${esc(site)}/privacy" style="color:inherit">Privacy Policy</a>.</small></p>`;
}

export function loginPage(o: { providers: { id: string; label: string }[]; next: string; signup: boolean; error?: string; site?: string }): string {
  const buttons = o.providers
    .map((p, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="/login/${esc(p.id)}?next=${encodeURIComponent(o.next)}">Continue with ${esc(p.label)}</a>`)
    .join('');
  return page(o.signup ? 'Start your free trial' : 'Sign in', `
<h1>${o.signup ? 'Start your 7-day free trial' : 'Sign in'}</h1>
<p>${o.signup
      ? 'Sign in to create your account. Your license is tied to your email address.'
      : 'Use the same email you bought ATMT Labs with.'}</p>
${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}
${buttons}
${legal(o.site ?? 'https://labs.atmt.dev')}`);
}

/** The desktop hand-off. Browsers may ask before opening the app, so there
 *  is always a visible button besides the automatic redirect. */
export function returnToAppPage(url: string): string {
  return page('Return to ATMT Labs', `
<h1>You're signed in</h1>
<p>Returning you to ATMT Labs… If nothing happens, press the button. You can close this tab afterwards.</p>
<a class="btn primary" href="${esc(url)}">Open ATMT Labs</a>`,
  `<meta http-equiv="refresh" content="0;url=${esc(url)}">`);
}

export function messagePage(title: string, text: string, link?: { href: string; label: string }): string {
  return page(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>${link ? `<a class="btn" href="${esc(link.href)}">${esc(link.label)}</a>` : ''}`);
}

function fmtDate(d: Date | null): string {
  return d ? d.toISOString().slice(0, 10) : '';
}

export function accountPage(o: {
  account: AccountRow;
  license: LicenseRow;
  devices: DeviceRow[];
  maxDevices: number;
  price: string;
  trialDays: number;
  canTrial: boolean;
  notice?: string;
  /** The notice is a success message. */
  ok?: boolean;
  /** Pre-filled unlock code (from a /redeem?code= link). */
  code?: string;
}): string {
  const l = o.license;
  let status = '';
  let actions = '';
  switch (l.status) {
    case 'active':
      status = l.source === 'unlock_code'
        ? `<span class="tag">Lifetime license</span><p>Unlocked with a code on ${esc(fmtDate(l.paid_at))}. No renewals, no subscription.</p>`
        : `<span class="tag">Lifetime license</span><p>Paid ${esc(fmtDate(l.paid_at))}. No renewals, no subscription.</p>`;
      actions = l.source === 'unlock_code' ? '' : `<form method="post" action="/account/billing"><button class="btn">Receipts &amp; payment details</button></form>`;
      break;
    case 'trialing':
      status = `<span class="tag">Free trial</span><p>Ends ${esc(fmtDate(l.trial_end))}. On that day your card is charged <strong>${esc(o.price)}</strong> once and the license becomes yours for good.</p>`;
      actions = `<form method="post" action="/account/buy"><button class="btn primary">Buy now and end the trial</button></form>
<form method="post" action="/account/billing"><button class="btn">Update card</button></form>
<form method="post" action="/account/trial/cancel"><button class="btn danger">Cancel trial — don't charge me</button></form>`;
      break;
    case 'payment_required':
      status = `<span class="tag">Payment needed</span><p>${l.failure_reason === 'trial_already_used'
        ? 'This card has already been used for a free trial.'
        : "We couldn't charge your card at the end of the trial."} Complete the purchase to keep using ATMT Labs.</p>`;
      actions = `<form method="post" action="/account/buy"><button class="btn primary">Pay ${esc(o.price)}</button></form>`;
      break;
    default:
      status = `<p>${l.status === 'refunded' ? 'This license was refunded.' : l.status === 'canceled' ? 'Your trial was canceled.' : 'No license on this account yet.'}</p>`;
      actions = (o.canTrial ? `<form method="post" action="/account/trial"><button class="btn primary">Start ${o.trialDays}-day free trial</button></form>` : '')
        + `<form method="post" action="/account/buy"><button class="btn${o.canTrial ? '' : ' primary'}">Buy lifetime license — ${esc(o.price)}</button></form>`;
  }
  const devices = o.devices.length
    ? o.devices.map((d) => `<div class="row"><div>${esc(d.name || 'Computer')}<br><small>${esc(d.platform || '')} · last seen ${esc(fmtDate(d.last_seen))}</small></div>
<form method="post" action="/account/devices/${encodeURIComponent(d.device_id)}/remove"><button class="btn">Remove</button></form></div>`).join('')
    : '<p><small>No computers yet. Sign in from the ATMT Labs app.</small></p>';
  // Anyone not yet licensed can redeem a voucher instead of paying. Open by
  // default when the code came in on a /redeem link.
  const redeem = l.status === 'active' ? '' : `
<details${o.code ? ' open' : ''}><summary>Have an unlock code?</summary>
<form method="post" action="/account/redeem">
<input name="code" value="${esc(o.code ?? '')}" placeholder="ATMT-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" maxlength="64" required>
<button class="btn primary">Redeem code</button>
</form>
<p><small>An unlock code gives this account a free lifetime license. Each code works once.${l.status === 'trialing' ? ' Your trial ends and your card is not charged.' : ''}</small></p>
</details>`;
  return page('Your account', `
<h1>${esc(o.account.email)}</h1>
${o.notice ? `<div class="${o.ok ? 'ok' : 'err'}">${esc(o.notice)}</div>` : ''}
${status}
${actions}
${redeem}
<h2>Computers (${o.devices.length}/${o.maxDevices})</h2>
${devices}
<form method="post" action="/logout"><button class="btn">Sign out</button></form>`);
}

/** Installable on the owner's phone (Add to Home Screen). The manifest sits
 *  behind the same owner gate as the page, so it is fetched with the session
 *  cookie (use-credentials) and 404s for everyone else. No service worker:
 *  nothing from the admin page is cached on the device, and pages stay
 *  script-free. */
const ADMIN_HEAD = `<meta name="robots" content="noindex,nofollow">
<link rel="manifest" href="/admin/manifest.webmanifest" crossorigin="use-credentials">
<meta name="application-name" content="ATMT Admin">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="ATMT Admin">
<meta name="apple-mobile-web-app-status-bar-style" content="default">`;

/** The web app manifest for /admin. */
export const ADMIN_MANIFEST = {
  id: '/admin',
  name: 'ATMT Labs Admin',
  short_name: 'ATMT Admin',
  description: 'Create, track and revoke ATMT Labs unlock codes.',
  start_url: '/admin',
  scope: '/admin',
  display: 'standalone',
  theme_color: '#faf8f2',
  background_color: '#faf8f2',
  icons: [
    { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' }
  ]
};

/**
 * Owner-only: mint, list and revoke unlock codes. Freshly minted codes are
 * shown in this response only (the database keeps a hash), so the page is
 * rendered straight from the POST, never from a redirect or a URL.
 */
export function adminPage(o: {
  email: string;
  authOrigin: string;
  codes: UnlockCodeRow[];
  now: Date;
  created?: { codes: string[]; label: string | null; expires: string | null };
  notice?: string;
  ok?: boolean;
}): string {
  const states = o.codes.map((r) => ({ r, s: unlockCodeState(r, o.now) }));
  const count = (k: string) => states.filter((x) => x.s.state === k).length;
  const created = o.created ? `
<div class="ok"><strong>${o.created.codes.length} code(s) created${o.created.label ? ` for “${esc(o.created.label)}”` : ''}${o.created.expires ? `, valid until ${esc(o.created.expires)}` : ''}.</strong>
Copy them now. They are not shown again; only a hash is stored.</div>
<label>Codes and ready-to-send links
<textarea readonly spellcheck="false">${esc(o.created.codes.map((c) => `${c}    ${o.authOrigin}/redeem?code=${c}`).join('\n'))}</textarea></label>` : '';
  const rows = states.map(({ r, s }) => `<tr>
<td>${esc(r.created_at ? new Date(r.created_at).toISOString().slice(0, 10) : '')}</td>
<td>${esc(r.label ?? '')}</td>
<td><code>${esc(r.code_hash.slice(0, 10))}…</code></td>
<td>${esc(s.text)}</td>
<td>${s.state === 'unused' ? `<form method="post" action="/admin/codes/revoke"><input type="hidden" name="hash" value="${esc(r.code_hash)}"><button class="btn danger">Revoke</button></form>` : ''}</td>
</tr>`).join('');
  return page('Admin', `
<h1>Unlock codes</h1>
<p>Signed in as ${esc(o.email)}. Each code gives one account a free lifetime license.</p>
${o.notice ? `<div class="${o.ok ? 'ok' : 'err'}">${esc(o.notice)}</div>` : ''}
${created}
<h2>Create codes</h2>
<form method="post" action="/admin/codes">
<div class="grid">
<label>How many<input name="count" type="number" min="1" max="500" value="1" required></label>
<label>Who it's for (optional)<input name="label" maxlength="120" placeholder="Beta tester: Ana"></label>
<label>Expires (optional)<input name="expires" type="date"></label>
</div>
<button class="btn primary">Create codes</button>
</form>
<details><summary>Revoke a code you still have</summary>
<form method="post" action="/admin/codes/revoke">
<input name="code" placeholder="ATMT-XXXXX-XXXXX-XXXXX-XXXXX" autocomplete="off" spellcheck="false" maxlength="64" required>
<button class="btn danger">Revoke code</button>
</form>
</details>
<h2>All codes</h2>
<div class="stats"><span><b>${count('unused')}</b>unused</span><span><b>${count('used')}</b>used</span><span><b>${count('revoked')}</b>revoked</span><span><b>${count('expired')}</b>expired</span></div>
${rows ? `<div class="scroll"><table><thead><tr><th>Created</th><th>For</th><th>Code</th><th>State</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p><small>No codes yet.</small></p>'}
<form method="post" action="/logout"><button class="btn">Sign out</button></form>`, ADMIN_HEAD, true);
}
