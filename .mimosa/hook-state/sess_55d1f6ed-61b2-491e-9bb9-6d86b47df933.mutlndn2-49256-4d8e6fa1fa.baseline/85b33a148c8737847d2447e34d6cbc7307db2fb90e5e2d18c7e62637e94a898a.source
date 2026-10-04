/**
 * The account service: one Hono app, two hostnames.
 *
 *   auth.labs.atmt.dev  /oauth/*, /login*, /account*, /logout
 *   api.labs.atmt.dev   /v1/*
 *
 * On those two production hosts each only serves its own routes; any other
 * host (vercel preview URLs, localhost) serves everything. Contract:
 * docs/licensing/API.md.
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { Config, ProviderId } from './config.js';
import { Oidc } from './oidc.js';
import { PAGE_HEADERS, accountPage, loginPage, messagePage, returnToAppPage } from './pages.js';
import { BRAND_ASSETS } from './brandAssets.js';
import type { AccountRow, Store } from './store.js';
import {
  CODE_TTL_MS, REFRESH_TTL_MS, SESSION_TTL_MS, ACCESS_TTL_S,
  mintAccessToken, mintLicense, pkceS256, randomToken, sha256, verifyAccessToken
} from './tokens.js';

export interface AppDeps {
  cfg: Config;
  store: Store;
  oidc: Oidc;
  now?: () => number;
}

const SESSION_COOKIE = 'jepoy_session';
const AUTHZ_COOKIE = 'jepoy_authz';
const IDP_COOKIE = 'jepoy_idp';
const FLOW_TTL_MS = 10 * 60 * 1000;
const API_PATHS = /^\/(v1\/|api\/cron\/|health$)/;

/** Favicons, logos and fonts (src/brandAssets.ts), decoded once per instance. */
const ASSETS = new Map(Object.entries(BRAND_ASSETS).map(([path, a]) => [path, { type: a.type, bytes: Buffer.from(a.b64, 'base64') }]));

function html(c: Context, body: string, status = 200) {
  return c.body(body, status as 200, PAGE_HEADERS);
}

function oauthJson(c: Context, body: object, status = 200) {
  return c.json(body, status as 200, { 'cache-control': 'no-store', pragma: 'no-cache' });
}

/** Only same-site relative paths we actually serve after login. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/account';
  return /^\/(oauth\/continue|account)(\?|$|\/)/.test(next) ? next : '/account';
}

export function createApp(deps: AppDeps): Hono {
  const { cfg, store, oidc } = deps;
  const now = deps.now ?? Date.now;
  const app = new Hono();
  const authHost = new URL(cfg.authOrigin).host;
  const apiHost = new URL(cfg.apiOrigin).host;
  const cookieOpts = { path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const, prefix: 'host' as const };

  // ─── host split + baseline headers ──────────────────────────────────────
  app.use('*', async (c, next) => {
    const host = new URL(c.req.url).host;
    const path = new URL(c.req.url).pathname;
    if (host === apiHost && host !== authHost && !API_PATHS.test(path)) return c.json({ error: 'not_found' }, 404);
    if (host === authHost && host !== apiHost && /^\/v1\//.test(path)) return c.json({ error: 'not_found' }, 404);
    await next();
    c.header('strict-transport-security', 'max-age=31536000; includeSubDomains');
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.get('*', async (c, next) => {
    const a = ASSETS.get(new URL(c.req.url).pathname);
    if (!a) return next();
    return c.body(new Uint8Array(a.bytes), 200, {
      'content-type': a.type,
      'cache-control': 'public, max-age=86400',
      'x-content-type-options': 'nosniff'
    });
  });

  // ─── browser session helpers ────────────────────────────────────────────
  async function webSession(c: Context) {
    const token = getCookie(c, SESSION_COOKIE, 'host');
    if (!token) return null;
    const s = await store.session(sha256(token), new Date(now()));
    const acct = s ? await store.account(s.accountId) : null;
    return s && acct ? { ...s, acct } : null;
  }

  async function sessionAccount(c: Context): Promise<AccountRow | null> {
    return (await webSession(c))?.acct ?? null;
  }

  async function readFlow<T>(c: Context, name: string): Promise<T | null> {
    const raw = await getSignedCookie(c, cfg.sessionSecret, name, 'host');
    if (!raw) return null;
    try {
      const v = JSON.parse(raw) as T & { exp: number };
      return v.exp > now() ? v : null;
    } catch {
      return null;
    }
  }

  async function writeFlow(c: Context, name: string, value: object): Promise<void> {
    await setSignedCookie(c, name, JSON.stringify({ ...value, exp: now() + FLOW_TTL_MS }), cfg.sessionSecret, {
      ...cookieOpts, maxAge: FLOW_TTL_MS / 1000
    });
  }

  /** CSRF for account forms: SameSite=Lax already blocks cross-site POST
   *  cookies; also require our own Origin. */
  function sameOrigin(c: Context): boolean {
    const o = c.req.header('origin');
    return !!o && (o === cfg.authOrigin || o === new URL(c.req.url).origin);
  }

  // ─── desktop OAuth: authorize ───────────────────────────────────────────
  interface AuthzFlow { state: string; challenge: string; redirectUri?: string }

  /** The registered custom scheme, or a loopback redirect on any port
   *  (RFC 8252 §7.3). The loopback one is what the app uses: a plain http
   *  navigation needs no OS scheme registration, which browsers are
   *  unreliable about. Only the literal 127.0.0.1 — never "localhost", which
   *  DNS or a hosts file could point elsewhere. */
  function allowedRedirect(uri: string | undefined): uri is string {
    if (!uri) return false;
    if (uri === cfg.desktop.redirectUri) return true;
    const m = /^http:\/\/127\.0\.0\.1:(\d{4,5})\/callback$/.exec(uri);
    return !!m && Number(m[1]) >= 1024 && Number(m[1]) <= 65535;
  }

  const isLoopback = (uri: string) => uri.startsWith('http://127.0.0.1:');

  async function issueCodeAndReturn(c: Context, accountId: string, flow: AuthzFlow) {
    const redirectUri = flow.redirectUri ?? cfg.desktop.redirectUri;
    const code = randomToken();
    await store.createAuthCode({
      codeHash: sha256(code),
      accountId,
      clientId: cfg.desktop.clientId,
      redirectUri,
      codeChallenge: flow.challenge,
      expiresAt: new Date(now() + CODE_TTL_MS)
    });
    deleteCookie(c, AUTHZ_COOKIE, cookieOpts);
    const url = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(flow.state)}`;
    // Loopback: a plain redirect; the app's one-shot listener shows the
    // "you're signed in" page. Custom scheme: a page with a button, because
    // browsers may ask before handing a scheme to an app.
    return isLoopback(redirectUri) ? c.redirect(url, 302) : html(c, returnToAppPage(url));
  }

  app.get('/oauth/authorize', async (c) => {
    const q = c.req.query();
    if (q.client_id !== cfg.desktop.clientId || !allowedRedirect(q.redirect_uri)) {
      // Never redirect to an unregistered URI.
      return html(c, messagePage('Invalid sign-in request', 'Open Jepoy Floor AI and press Sign in again.'), 400);
    }
    const redirectUri = q.redirect_uri;
    const back = (error: string) => c.redirect(`${redirectUri}?error=${error}&state=${encodeURIComponent(q.state ?? '')}`, 302);
    if (q.response_type !== 'code') return back('unsupported_response_type');
    if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? '')) return back('invalid_request');
    if (!q.state || q.state.length > 512) return back('invalid_request');
    const flow: AuthzFlow = { state: q.state, challenge: q.code_challenge, redirectUri };
    const acct = await sessionAccount(c);
    if (acct) return issueCodeAndReturn(c, acct.id, flow);
    await writeFlow(c, AUTHZ_COOKIE, flow);
    return html(c, loginPage({ site: cfg.siteOrigin, providers: cfg.providers, next: '/oauth/continue', signup: q.screen_hint === 'signup' }));
  });

  app.get('/oauth/continue', async (c) => {
    const flow = await readFlow<AuthzFlow>(c, AUTHZ_COOKIE);
    if (!flow) return html(c, messagePage('Sign-in expired', 'Go back to Jepoy Floor AI and press Sign in again.'), 400);
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/oauth/continue', 302);
    return issueCodeAndReturn(c, acct.id, flow);
  });

  // ─── desktop OAuth: token + revoke ──────────────────────────────────────
  async function issueTokens(accountId: string, familyId: string) {
    const refresh = randomToken();
    await store.createRefreshToken(sha256(refresh), familyId, accountId, new Date(now() + REFRESH_TTL_MS));
    return {
      access_token: await mintAccessToken(cfg, accountId, now()),
      refresh_token: refresh,
      token_type: 'Bearer',
      expires_in: ACCESS_TTL_S
    };
  }

  app.post('/oauth/token', async (c) => {
    const f = (await c.req.parseBody()) as Record<string, string>;
    if (f.client_id !== cfg.desktop.clientId) return oauthJson(c, { error: 'invalid_client' }, 401);
    if (f.grant_type === 'authorization_code') {
      // The code row pins the exact redirect_uri it was issued for (below).
      if (!f.code || !f.code_verifier || !allowedRedirect(f.redirect_uri)) return oauthJson(c, { error: 'invalid_request' }, 400);
      const row = await store.consumeAuthCode(sha256(f.code), new Date(now()));
      if (!row || row.client_id !== f.client_id || row.redirect_uri !== f.redirect_uri || pkceS256(f.code_verifier) !== row.code_challenge) {
        return oauthJson(c, { error: 'invalid_grant' }, 400);
      }
      return oauthJson(c, await issueTokens(row.account_id, randomToken(12)));
    }
    if (f.grant_type === 'refresh_token') {
      if (!f.refresh_token) return oauthJson(c, { error: 'invalid_request' }, 400);
      const spent = await store.spendRefreshToken(sha256(f.refresh_token), new Date(now()));
      if (!spent.ok) return oauthJson(c, { error: 'invalid_grant' }, 400);
      return oauthJson(c, await issueTokens(spent.accountId, spent.familyId));
    }
    return oauthJson(c, { error: 'unsupported_grant_type' }, 400);
  });

  app.post('/oauth/revoke', async (c) => {
    const f = (await c.req.parseBody()) as Record<string, string>;
    if (f.token) await store.revokeRefreshToken(sha256(f.token));
    return oauthJson(c, {});
  });

  // ─── upstream sign-in (Google / Yahoo) ──────────────────────────────────
  app.get('/login', (c) => html(c, loginPage({
    site: cfg.siteOrigin,
    providers: cfg.providers,
    next: safeNext(c.req.query('next')),
    signup: c.req.query('signup') === '1'
  })));

  interface IdpFlow { provider: ProviderId; state: string; nonce: string; verifier?: string; next: string }

  app.get('/login/:provider', async (c) => {
    const p = cfg.providers.find((x) => x.id === c.req.param('provider'));
    if (!p) return html(c, messagePage('Unknown sign-in method', 'Choose Google or Yahoo.'), 404);
    const d = await oidc.discover(p);
    const flow: IdpFlow = { provider: p.id, state: randomToken(), nonce: randomToken(), next: safeNext(c.req.query('next')) };
    if (oidc.supportsPkce(d)) flow.verifier = randomToken();
    await writeFlow(c, IDP_COOKIE, flow);
    return c.redirect(oidc.authorizeUrl(p, d, {
      redirectUri: `${cfg.authOrigin}/login/${p.id}/callback`,
      state: flow.state,
      nonce: flow.nonce,
      challenge: flow.verifier ? pkceS256(flow.verifier) : undefined
    }), 302);
  });

  app.get('/login/:provider/callback', async (c) => {
    const flow = await readFlow<IdpFlow>(c, IDP_COOKIE);
    const p = cfg.providers.find((x) => x.id === c.req.param('provider'));
    const q = c.req.query();
    deleteCookie(c, IDP_COOKIE, cookieOpts);
    if (!flow || !p || flow.provider !== p.id || !q.state || q.state !== flow.state) {
      return html(c, loginPage({ site: cfg.siteOrigin, providers: cfg.providers, next: flow?.next ?? '/account', signup: false, error: 'That sign-in expired. Please try again.' }), 400);
    }
    if (q.error || !q.code) {
      return html(c, loginPage({ site: cfg.siteOrigin, providers: cfg.providers, next: flow.next, signup: false, error: 'Sign-in was cancelled.' }), 400);
    }
    let who;
    try {
      const d = await oidc.discover(p);
      who = await oidc.complete(p, d, { code: q.code, redirectUri: `${cfg.authOrigin}/login/${p.id}/callback`, verifier: flow.verifier, nonce: flow.nonce, now: now() });
    } catch (e) {
      const msg = /email/.test((e as Error).message)
        ? `${p.label} did not share a verified email address, which your account requires.`
        : 'Sign-in failed. Please try again.';
      return html(c, loginPage({ site: cfg.siteOrigin, providers: cfg.providers, next: flow.next, signup: false, error: msg }), 400);
    }
    const acct = await store.signIn(p.id, who.subject, who.email, who.name);
    const token = randomToken();
    await store.createSession(sha256(token), acct.id, new Date(now() + SESSION_TTL_MS), p.id, new Date(now()));
    setCookie(c, SESSION_COOKIE, token, { ...cookieOpts, maxAge: SESSION_TTL_MS / 1000 });
    return c.redirect(flow.next, 302);
  });

  app.post('/logout', async (c) => {
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const token = getCookie(c, SESSION_COOKIE, 'host');
    if (token) await store.deleteSession(sha256(token));
    deleteCookie(c, SESSION_COOKIE, cookieOpts);
    // Same-origin on purpose: browsers apply the page's CSP form-action to the
    // redirect after a form POST, so a cross-origin hop (to the marketing site)
    // is blocked and the user appears never to sign out.
    return c.redirect('/login?signedout=1', 303);
  });

  // ─── account (web) ──────────────────────────────────────────────────────
  app.get('/', (c) => c.redirect('/account', 302));

  async function renderAccount(c: Context, acct: AccountRow) {
    return html(c, accountPage({
      account: acct,
      devices: await store.devices(acct.id),
      notice: c.req.query('notice')?.slice(0, 200)
    }));
  }

  app.get('/account', async (c) => {
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/account', 302);
    return renderAccount(c, acct);
  });

  // Old marketing links lead to the free account. They never open Checkout.
  app.get('/start', async (c) => c.redirect('/account', 302));
  app.get('/redeem', async (c) => c.redirect('/account', 302));

  const retired = (c: Context) => c.json({ error: 'purchases_retired' }, 410);
  app.post('/account/trial', retired);
  app.post('/account/buy', retired);
  app.post('/account/billing', retired);
  app.post('/account/redeem', retired);
  app.post('/account/trial/cancel', retired);

  const accountPost = (fn: (c: Context, acct: AccountRow) => Promise<Response>) => async (c: Context) => {
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/account', 303);
    return fn(c, acct);
  };
  app.post('/account/devices/:id/remove', accountPost(async (c, a) => {
    await store.releaseDevice(a.id, c.req.param('id') ?? '');
    return c.redirect('/account', 303);
  }));

  // ─── account API (bearer) ───────────────────────────────────────────────
  async function bearerAccount(c: Context): Promise<AccountRow | null> {
    const h = c.req.header('authorization') ?? '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return null;
    const id = await verifyAccessToken(cfg, m[1], now());
    return id ? store.account(id) : null;
  }

  app.post('/v1/licenses', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const deviceId = typeof body.device_id === 'string' ? body.device_id : '';
    if (!/^[A-Za-z0-9_-]{8,128}$/.test(deviceId)) return c.json({ error: 'invalid_request' }, 400);
    const str = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : undefined);

    // Every signed-in account receives free access. Keep a device inventory for
    // the account page, without the old paid-plan seat limit.
    await store.activateDevice(acct.id, {
      deviceId,
      name: str(body.device_name, 64),
      platform: str(body.platform, 16),
      appVersion: str(body.app_version, 32)
    });
    const token = await mintLicense(cfg, { accountId: acct.id, email: acct.email, name: acct.name, deviceId }, now());
    return c.json({ license: token }, 200, { 'cache-control': 'no-store' });
  });

  app.post('/v1/redeem', retired);

  app.delete('/v1/devices/:id', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    await store.releaseDevice(acct.id, c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/v1/billing/checkout', retired);
  app.post('/v1/billing/portal', retired);
  // Acknowledge delayed Stripe retries from old sessions without creating any
  // charge or entitlement. The scheduled trial-charge endpoint is retired.
  app.post('/v1/stripe/webhook', (c) => c.json({ received: true, retired: true }));
  app.get('/api/cron/charge-trials', retired);

  app.onError((err, c) => {
    console.error('[accounts]', err);
    return c.json({ error: 'server_error' }, 500);
  });

  return app;
}
