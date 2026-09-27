/**
 * Server-rendered pages for auth.labs.atmt.dev. No client JS at all (the CSP
 * says `script-src 'none'`); every value is HTML-escaped.
 */
import type { AccountRow, DeviceRow, LicenseRow } from './store.js';

export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

export const PAGE_HEADERS: Record<string, string> = {
  'content-type': 'text/html; charset=utf-8',
  'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; form-action 'self' https://checkout.stripe.com https://billing.stripe.com; frame-ancestors 'none'; base-uri 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'cache-control': 'no-store'
};

const CSS = `
:root{--bg:#0c0b09;--panel:#16140f;--ink:#f1eadb;--muted:#a79f8c;--line:#3b362b;--accent:#c8f31d;--btn:#e4d6bf;--danger:#ff7a6b}
@media (prefers-color-scheme: light){:root{--bg:#f6f1e6;--panel:#fffdf7;--ink:#1a1813;--muted:#6b6454;--line:#d9cfbb;--btn:#1a1813}}
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg);color:var(--ink);font:15px/1.5 system-ui,-apple-system,Segoe UI,Roboto,sans-serif;padding:16px}
main{width:100%;max-width:460px;background:var(--panel);border:1px solid var(--line);padding:28px}
h1{font-size:20px;margin:0 0 6px}p{margin:8px 0;color:var(--muted)}
.brand{font-weight:800;letter-spacing:.08em;font-size:12px;color:var(--accent);margin-bottom:14px}
.btn{display:block;width:100%;text-align:center;padding:12px 14px;margin:10px 0 0;border:1px solid var(--btn);background:transparent;color:var(--ink);font:inherit;cursor:pointer;text-decoration:none}
.btn.primary{background:var(--btn);color:var(--bg);font-weight:600}.btn.danger{border-color:var(--danger);color:var(--danger)}
.row{display:flex;justify-content:space-between;gap:12px;padding:10px 0;border-top:1px solid var(--line);align-items:center}
.row form{margin:0}.row .btn{width:auto;margin:0;padding:6px 10px;font-size:13px}
.tag{display:inline-block;padding:2px 8px;border:1px solid var(--accent);color:var(--accent);font-size:12px}
.err{border:1px solid var(--danger);color:var(--danger);padding:8px 10px;margin:10px 0}
.ok{border:1px solid var(--accent);color:var(--ink);padding:8px 10px;margin:10px 0}
input{width:100%;padding:11px 12px;margin:10px 0 0;border:1px solid var(--line);background:transparent;color:var(--ink);font:15px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.04em}
details{margin-top:14px}summary{cursor:pointer;color:var(--muted)}
small{color:var(--muted)}`;

function page(title: string, body: string, extraHead = ''): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · ATMT Labs</title>${extraHead}<style>${CSS}</style></head>
<body><main><div class="brand">ATMT LABS</div>${body}</main></body></html>`;
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
<h1 style="margin-top:22px;font-size:16px">Computers (${o.devices.length}/${o.maxDevices})</h1>
${devices}
<form method="post" action="/logout"><button class="btn">Sign out</button></form>`);
}
