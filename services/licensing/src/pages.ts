/**
 * Server-rendered pages for auth.labs.atmt.dev. No client JS at all (the CSP
 * says `script-src 'none'`); every value is HTML-escaped.
 */
import type { AccountRow, DeviceRow } from './store.js';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export const PAGE_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self'; manifest-src 'self'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
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
<title>${esc(title)} · Jepoy Floor AI</title>${HEAD}${extraHead}<style>${CSS}</style></head>
<body><main${wide ? ' class="wide"' : ''}><div class="brand">${LOGO}<span class="product">Jepoy Floor AI</span></div>${body}</main>
<footer>Jepoy Floor AI by automatika™</footer></body></html>`;
}

/** Legal pages live on the marketing site (labs.atmt.dev). */
function legal(site: string): string {
  return `<p><small>By continuing you agree to the <a href="${esc(site)}/terms" style="color:inherit">Jepoy Floor AI Terms of Service</a> and <a href="${esc(site)}/privacy" style="color:inherit">Privacy Policy</a>.</small></p>`;
}

export function loginPage(o: { providers: { id: string; label: string }[]; next: string; signup: boolean; error?: string; site?: string }): string {
  const buttons = o.providers
    .map((p, i) => `<a class="btn${i === 0 ? ' primary' : ''}" href="/login/${esc(p.id)}?next=${encodeURIComponent(o.next)}">Continue with ${esc(p.label)}</a>`)
    .join('');
  return page(o.signup ? 'Create your free account' : 'Sign in', `
<h1>${o.signup ? 'Create your free account' : 'Sign in'}</h1>
<p>${o.signup
      ? 'Sign in to create your free account.'
      : 'Sign in to your free Jepoy Floor AI account.'}</p>
${o.error ? `<div class="err">${esc(o.error)}</div>` : ''}
${buttons}
${legal(o.site ?? 'https://labs.atmt.dev')}`);
}

/** The desktop hand-off. Browsers may ask before opening the app, so there
 *  is always a visible button besides the automatic redirect. */
export function returnToAppPage(url: string): string {
  return page('Return to Jepoy Floor AI', `
<h1>You're signed in</h1>
<p>Returning you to Jepoy Floor AI… If nothing happens, press the button. You can close this tab afterwards.</p>
<a class="btn primary" href="${esc(url)}">Open Jepoy Floor AI</a>`,
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
  devices: DeviceRow[];
  notice?: string;
}): string {
  const devices = o.devices.length
    ? o.devices.map((d) => `<div class="row"><div>${esc(d.name || 'Computer')}<br><small>${esc(d.platform || '')} · last seen ${esc(fmtDate(d.last_seen))}</small></div>
<form method="post" action="/account/devices/${encodeURIComponent(d.device_id)}/remove"><button class="btn">Remove</button></form></div>`).join('')
    : '<p><small>No computers yet. Sign in from the Jepoy Floor AI app.</small></p>';
  return page('Your account', `
<h1>${esc(o.account.email)}</h1>
${o.notice ? `<div class="ok">${esc(o.notice)}</div>` : ''}
<span class="tag">Free account</span>
<p>Jepoy Floor AI is free to use after sign-in. Your AI providers may bill separately.</p>
<h2>Computers</h2>
${devices}
<form method="post" action="/logout"><button class="btn">Sign out</button></form>`);
}
