/**
 * The licensing service: one Hono app, two hostnames.
 *
 *   auth.labs.atmt.dev  /oauth/*, /login*, /account*, /start, /logout, /admin*
 *   api.labs.atmt.dev   /v1/*, /api/cron/*
 *
 * On those two production hosts each only serves its own routes; any other
 * host (vercel preview URLs, localhost) serves everything. Contract:
 * docs/licensing/API.md.
 */
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, getSignedCookie, setCookie, setSignedCookie } from 'hono/cookie';
import type { Config, ProviderId } from './config.js';
import { Billing, type StripeLike } from './billing.js';
import { Oidc } from './oidc.js';
import { ADMIN_MANIFEST, PAGE_HEADERS, accountPage, adminPage, loginPage, messagePage, returnToAppPage } from './pages.js';
import { BRAND_ASSETS } from './brandAssets.js';
import { REDEEM_MESSAGES, hashUnlockCode, mintUnlockCodes, normalizeUnlockCode } from './codes.js';
import type { AccountRow, Store } from './store.js';
import {
  CODE_TTL_MS, REFRESH_TTL_MS, SESSION_TTL_MS, ACCESS_TTL_S,
  mintAccessToken, mintLicense, pkceS256, randomToken, sha256, verifyAccessToken
} from './tokens.js';

export interface AppDeps {
  cfg: Config;
  store: Store;
  stripe: StripeLike;
  oidc: Oidc;
  now?: () => number;
}

const SESSION_COOKIE = 'atmt_session';
const AUTHZ_COOKIE = 'atmt_authz';
const IDP_COOKIE = 'atmt_idp';
const FLOW_TTL_MS = 10 * 60 * 1000;
const ENTITLED = new Set(['trialing', 'active']);
/** /admin wants a Google sign-in from the last 12 hours, not a 30-day-old session. */
const ADMIN_FRESH_MS = 12 * 3600 * 1000;

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
  return /^\/(oauth\/continue|account|start|redeem|admin)(\?|$|\/)/.test(next) ? next : '/account';
}

export function createApp(deps: AppDeps): Hono {
  const { cfg, store, stripe, oidc } = deps;
  const now = deps.now ?? Date.now;
  const billing = new Billing(cfg, store, stripe, now);
  const app = new Hono();
  const authHost = new URL(cfg.authOrigin).host;
  const apiHost = new URL(cfg.apiOrigin).host;
  const cookieOpts = { path: '/', httpOnly: true, secure: true, sameSite: 'Lax' as const, prefix: 'host' as const };

  // ─── host split + baseline headers ──────────────────────────────────────
  app.use('*', async (c, next) => {
    const host = new URL(c.req.url).host;
    const path = new URL(c.req.url).pathname;
    if (host === apiHost && host !== authHost && !API_PATHS.test(path)) return c.json({ error: 'not_found' }, 404);
    // /api/cron stays reachable on every host: Vercel may call it on either
    // domain, and it is guarded by CRON_SECRET anyway.
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
      return html(c, messagePage('Invalid sign-in request', 'Open ATMT Labs and press Sign in again.'), 400);
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
    if (!flow) return html(c, messagePage('Sign-in expired', 'Go back to ATMT Labs and press Sign in again.'), 400);
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
        ? `${p.label} did not share a verified email address, which your license is tied to.`
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
    return c.redirect(`${cfg.siteOrigin}/`, 303);
  });

  // ─── account (web) ──────────────────────────────────────────────────────
  app.get('/', (c) => c.redirect('/account', 302));

  async function renderAccount(c: Context, acct: AccountRow, extra: { code?: string } = {}) {
    const [license, devices, price] = await Promise.all([store.license(acct.id), store.devices(acct.id), billing.priceInfo()]);
    return html(c, accountPage({
      account: acct, license, devices, maxDevices: cfg.maxDevices, price: price.label,
      trialDays: cfg.trialDays, canTrial: billing.canTrial(license),
      notice: c.req.query('notice')?.slice(0, 200), ok: c.req.query('ok') === '1', code: extra.code
    }));
  }

  app.get('/account', async (c) => {
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/account', 302);
    return renderAccount(c, acct);
  });

  /** Shareable voucher link: /redeem?code=ATMT-… — sign in, then the account
   *  page with the code filled in. Never redeems on GET (link previews and
   *  prefetchers would spend it); the user presses the button. */
  app.get('/redeem', async (c) => {
    const code = (c.req.query('code') ?? '').slice(0, 64);
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect(`/login?signup=1&next=${encodeURIComponent(`/redeem?code=${code}`)}`, 302);
    return renderAccount(c, acct, { code });
  });

  /** Web funnel entry from labs.atmt.dev: /start?plan=trial|buy */
  app.get('/start', async (c) => {
    const plan = c.req.query('plan') === 'buy' ? 'buy' : 'trial';
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect(`/login?signup=1&next=${encodeURIComponent(`/start?plan=${plan}`)}`, 302);
    return c.redirect(await billing.checkoutUrl(acct, plan), 303);
  });

  const accountPost = (fn: (c: Context, acct: AccountRow) => Promise<Response>) => async (c: Context) => {
    if (!sameOrigin(c)) return c.text('Forbidden', 403);
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/account', 303);
    return fn(c, acct);
  };

  app.post('/account/trial', accountPost(async (c, a) => c.redirect(await billing.checkoutUrl(a, 'trial'), 303)));
  app.post('/account/buy', accountPost(async (c, a) => c.redirect(await billing.checkoutUrl(a, 'buy'), 303)));
  app.post('/account/billing', accountPost(async (c, a) => c.redirect(await billing.portalUrl(a), 303)));
  app.post('/account/trial/cancel', accountPost(async (c, a) => {
    await billing.cancelTrial(a.id);
    return c.redirect('/account', 303);
  }));
  app.post('/account/redeem', accountPost(async (c, a) => {
    const f = (await c.req.parseBody()) as Record<string, string>;
    const r = await billing.redeemUnlockCode(a.id, String(f.code ?? ''));
    const notice = r.ok ? 'Code accepted. Your lifetime license is active.' : REDEEM_MESSAGES[r.error];
    return c.redirect(`/account?${r.ok ? 'ok=1&' : ''}notice=${encodeURIComponent(notice)}`, 303);
  }));
  app.post('/account/devices/:id/remove', accountPost(async (c, a) => {
    await store.releaseDevice(a.id, c.req.param('id') ?? '');
    return c.redirect('/account', 303);
  }));

  // ─── owner admin: unlock codes ──────────────────────────────────────────
  // Only for ADMIN_EMAILS, and only through Google (which always verifies the
  // email; Yahoo may not say). An owner session that is older than 12 h or
  // came from Yahoo is sent through Google again. Everyone else gets a 404,
  // so the page doesn't advertise itself.
  type AdminGate = { ok: true; acct: AccountRow } | { ok: false; res: Response };
  async function adminGate(c: Context, method: 'GET' | 'POST'): Promise<AdminGate> {
    const notFound = () => html(c, messagePage('Not found', 'There is nothing here.'), 404);
    if (method === 'POST' && !sameOrigin(c)) return { ok: false, res: c.text('Forbidden', 403) };
    const s = await webSession(c);
    if (!s) return { ok: false, res: method === 'GET' ? c.redirect('/login?next=/admin', 302) : c.text('Forbidden', 403) };
    if (!cfg.adminEmails.includes(s.acct.email.toLowerCase())) return { ok: false, res: notFound() };
    if (s.provider !== 'google' || now() - s.createdAt.getTime() > ADMIN_FRESH_MS) {
      if (!cfg.providers.some((p) => p.id === 'google')) return { ok: false, res: notFound() };
      return { ok: false, res: method === 'GET' ? c.redirect('/login/google?next=/admin', 302) : c.text('Sign in again', 403) };
    }
    return { ok: true, acct: s.acct };
  }

  const ADMIN_HEADERS = { ...PAGE_HEADERS, 'x-robots-tag': 'noindex, nofollow' };
  async function renderAdmin(c: Context, acct: AccountRow, extra: { created?: { codes: string[]; label: string | null; expires: string | null }; notice?: string; ok?: boolean } = {}, status = 200) {
    return c.body(adminPage({
      email: acct.email, authOrigin: cfg.authOrigin, codes: await store.listUnlockCodes(), now: new Date(now()),
      notice: extra.notice ?? c.req.query('notice')?.slice(0, 200), ok: extra.ok ?? c.req.query('ok') === '1', created: extra.created
    }), status as 200, ADMIN_HEADERS);
  }

  app.get('/admin', async (c) => {
    const g = await adminGate(c, 'GET');
    return g.ok ? renderAdmin(c, g.acct) : g.res;
  });

  // Fetched by the browser with the session cookie (crossorigin=use-credentials).
  // Owner email only; a stale or Yahoo session still gets it, because the
  // page itself sends those through Google again.
  app.get('/admin/manifest.webmanifest', async (c) => {
    const s = await webSession(c);
    if (!s || !cfg.adminEmails.includes(s.acct.email.toLowerCase())) return c.json({ error: 'not_found' }, 404);
    return c.body(JSON.stringify(ADMIN_MANIFEST), 200, {
      'content-type': 'application/manifest+json',
      'cache-control': 'private, no-cache',
      'x-robots-tag': 'noindex, nofollow'
    });
  });

  app.post('/admin/codes', async (c) => {
    const g = await adminGate(c, 'POST');
    if (!g.ok) return g.res;
    const f = (await c.req.parseBody()) as Record<string, string>;
    const count = Number(f.count ?? '1');
    const label = String(f.label ?? '').trim().slice(0, 120) || null;
    const expires = String(f.expires ?? '').trim() || null;
    const expiresAt = expires ? new Date(`${expires}T23:59:59Z`) : null;
    if (!Number.isInteger(count) || count < 1 || count > 500) return renderAdmin(c, g.acct, { notice: 'Choose between 1 and 500 codes.' }, 400);
    if (expires && (!/^\d{4}-\d{2}-\d{2}$/.test(expires) || Number.isNaN(expiresAt!.getTime()) || expiresAt!.getTime() <= now())) {
      return renderAdmin(c, g.acct, { notice: 'The expiry date must be a date in the future.' }, 400);
    }
    const codes = await mintUnlockCodes(store, count, label, expiresAt);
    console.log('[admin] minted', count, 'unlock code(s) by', g.acct.email);
    // Rendered from the POST itself: the codes never go into a URL or a cookie.
    return renderAdmin(c, g.acct, { created: { codes, label, expires } });
  });

  app.post('/admin/codes/revoke', async (c) => {
    const g = await adminGate(c, 'POST');
    if (!g.ok) return g.res;
    const f = (await c.req.parseBody()) as Record<string, string>;
    const n = f.code ? normalizeUnlockCode(String(f.code)) : null;
    const hash = n ? hashUnlockCode(n) : /^[0-9a-f]{64}$/.test(String(f.hash ?? '')) ? String(f.hash) : null;
    const done = hash ? await store.revokeUnlockCode(hash) : false;
    if (done) console.log('[admin] revoked unlock code', hash!.slice(0, 10), 'by', g.acct.email);
    const notice = done ? 'Code revoked. It can no longer be redeemed.' : 'Not revoked: unknown code, or it was already used or revoked.';
    return c.redirect(`/admin?${done ? 'ok=1&' : ''}notice=${encodeURIComponent(notice)}`, 303);
  });

  // ─── licensing API (bearer) ─────────────────────────────────────────────
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

    let license = await store.license(acct.id);
    // Day 7 reached and the app is online: charge now instead of waiting for the cron.
    if (license.status === 'trialing' && license.trial_end && license.trial_end.getTime() <= now()) {
      try { license = await billing.convertTrial(license, acct); } catch { /* cron retries */ }
    }
    if (ENTITLED.has(license.status)) {
      const r = await store.activateDevice(acct.id, {
        deviceId,
        name: str(body.device_name, 64),
        platform: str(body.platform, 16),
        appVersion: str(body.app_version, 32)
      }, cfg.maxDevices);
      if (r === 'limit') return c.json({ error: 'device_limit' }, 403);
    }
    const token = await mintLicense(cfg, { accountId: acct.id, email: acct.email, name: acct.name, deviceId }, license, now());
    return c.json({ license: token }, 200, { 'cache-control': 'no-store' });
  });

  app.post('/v1/redeem', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = await billing.redeemUnlockCode(acct.id, typeof body.code === 'string' ? body.code : '');
    if (!r.ok) return c.json({ error: r.error }, r.error === 'code_invalid' ? 400 : 409);
    return c.json({ ok: true, status: r.license.status }, 200, { 'cache-control': 'no-store' });
  });

  app.delete('/v1/devices/:id', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    await store.releaseDevice(acct.id, c.req.param('id'));
    return c.body(null, 204);
  });

  app.post('/v1/billing/checkout', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    return c.json({ url: await billing.appCheckoutUrl(acct) });
  });

  app.post('/v1/billing/portal', async (c) => {
    const acct = await bearerAccount(c);
    if (!acct) return c.json({ error: 'invalid_token' }, 401);
    return c.json({ url: `${cfg.authOrigin}/account` });
  });

  app.post('/v1/stripe/webhook', async (c) => {
    const sig = c.req.header('stripe-signature');
    if (!sig) return c.json({ error: 'missing_signature' }, 400);
    const raw = await c.req.text();
    let event;
    try {
      event = billing.verifyWebhook(raw, sig);
    } catch {
      return c.json({ error: 'bad_signature' }, 400);
    }
    if (!(await store.firstSighting(event.id))) return c.json({ received: true, duplicate: true });
    try {
      await billing.handleEvent(event);
    } catch (e) {
      // Let Stripe retry: forget we saw it.
      await store.forgetEvent(event.id);
      console.error('[webhook] failed', event.type, (e as Error).message);
      return c.json({ error: 'handler_failed' }, 500);
    }
    return c.json({ received: true });
  });

  // Vercel Cron sends `Authorization: Bearer $CRON_SECRET`.
  app.get('/api/cron/charge-trials', async (c) => {
    if (c.req.header('authorization') !== `Bearer ${cfg.cronSecret}`) return c.json({ error: 'unauthorized' }, 401);
    return c.json(await billing.runDueTrials());
  });

  app.onError((err, c) => {
    console.error('[licensing]', err);
    return c.json({ error: 'server_error' }, 500);
  });

  return app;
}
