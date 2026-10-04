/**
 * One-shot RFC 8252 §7.3 loopback listener for the browser sign-in.
 *
 * Why not only atmtlabs://: handing a custom scheme from the browser to the
 * app depends on OS registration AND on each browser's own lookup, which fails
 * in the field (Chrome: "the scheme does not have a registered handler"). A
 * redirect to http://127.0.0.1:<port>/callback is an ordinary navigation —
 * nothing to register, no "Open app?" prompt.
 *
 * Safety: bound to the literal 127.0.0.1 on an OS-assigned port; answers only
 * GET /callback; the first callback wins and the listener shuts down. The code
 * it receives is useless without this process's PKCE verifier, and the state
 * must match (licenseManager).
 */
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LicenseStatus } from '../shared/license';
import { loopbackRedirectUri } from './licenseCore';
import type { LoopbackListener } from './licenseManager';

const PAGE_CSP = "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export interface LoopbackOptions {
  /** Brought to the front once the callback arrives. */
  onDone?: () => void;
}

export function startLoopbackListener(
  onCallback: (url: string) => Promise<LicenseStatus>,
  opts: LoopbackOptions = {}
): Promise<LoopbackListener> {
  return new Promise((resolve, reject) => {
    let handled = false;
    const server = createServer((req, res) => { void serve(req, res); });
    // Stop accepting; a callback still being answered finishes its reply
    // (the manager closes us from inside onCallback).
    const close = () => { if (server.listening) server.close(); server.closeIdleConnections?.(); };

    async function serve(req: IncomingMessage, res: ServerResponse): Promise<void> {
      const remote = req.socket.remoteAddress ?? '';
      const path = (req.url ?? '').split('?')[0];
      if (!/^(::ffff:)?127\.0\.0\.1$/.test(remote) || req.method !== 'GET' || path !== '/callback') {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' }).end('Not found');
        return;
      }
      if (handled) {
        send(res, 'Already signed in', 'You can close this tab and return to Jepoy Floor AI.');
        return;
      }
      handled = true;
      let status: LicenseStatus | null = null;
      try {
        status = await onCallback(`http://127.0.0.1:${port()}${req.url ?? ''}`);
      } catch {
        status = null;
      }
      if (status?.state === 'signing_in') {
        // Dropped (stale tab / wrong state): the real sign-in is still coming.
        handled = false;
        send(res, 'Sign-in did not finish', 'Go back to Jepoy Floor AI and press Sign in again.');
        return;
      }
      const ok = !!status && (status.state === 'licensed' || status.state === 'inactive');
      res.on('finish', () => server.closeAllConnections?.());
      send(res,
        ok ? "You're signed in" : 'Sign-in did not finish',
        ok ? 'Return to Jepoy Floor AI — you can close this tab.' : 'Go back to Jepoy Floor AI and press Sign in again.');
      close();
      opts.onDone?.();
    }

    function port(): number {
      return (server.address() as AddressInfo | null)?.port ?? 0;
    }

    server.on('error', (e) => { if (!server.listening) reject(e); });
    server.listen(0, '127.0.0.1', () => {
      // Never keep the app alive just for this.
      server.unref();
      resolve({ redirectUri: loopbackRedirectUri(port()), close });
    });
  });
}

function send(res: ServerResponse, title: string, text: string): void {
  const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    'content-security-policy': PAGE_CSP,
    'referrer-policy': 'no-referrer',
    connection: 'close'
  });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} · Jepoy Floor AI</title><style>
:root{--bg:#0c0b09;--panel:#16140f;--ink:#f1eadb;--muted:#a79f8c;--line:#3b362b;--accent:#c8f31d}
@media (prefers-color-scheme: light){:root{--bg:#f6f1e6;--panel:#fffdf7;--ink:#1a1813;--muted:#6b6454;--line:#ddd3c0;--accent:#4d6b00}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font:16px/1.5 system-ui,-apple-system,Segoe UI,sans-serif;padding:16px;box-sizing:border-box}
main{max-width:420px;width:100%;background:var(--panel);border:1px solid var(--line);padding:28px}
.brand{color:var(--accent);font-weight:700;letter-spacing:.08em;font-size:12px}
h1{font-size:20px;margin:10px 0 6px}p{color:var(--muted);margin:0}
</style></head><body><main><div class="brand">JEPOY FLOOR AI</div><h1>${esc(title)}</h1><p>${esc(text)}</p></main></body></html>`);
}
