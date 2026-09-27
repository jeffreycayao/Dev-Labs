/**
 * The licensing service: one Hono app, two hostnames.
 *
 *   auth.labs.atmt.dev  /oauth/*, /login*, /account*, /start, /logout
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
import { PAGE_HEADERS, accountPage, loginPage, messagePage, returnToAppPage } from './pages.js';
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

const API_PATHS = /^\/(v1\/|api\/cron\/|health$)/;

function html(c: Context, body: string, status = 200) {
  return c.body(body, status as 200, PAGE_HEADERS);
}

function oauthJson(c: Context, body: object, status = 200) {
  return c.json(body, status as 200, { 'cache-control': 'no-store', pragma: 'no-cache' });
}

/** Only same-site relative paths we actually serve after login. */
function safeNext(next: string | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return '/account';
  return /^\/(oauth\/continue|account|start)(\?|$|\/)/.test(next) ? next : '/account';
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

  // ─── browser session helpers ────────────────────────────────────────────
  async function sessionAccount(c: Context): Promise<AccountRow | null> {
    const token = getCookie(c, SESSION_COOKIE, 'host');
    if (!token) return null;
    const id = await store.sessionAccount(sha256(token), new Date(now()));
    return id ? store.account(id) : null;
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
  interface AuthzFlow { state: string; challenge: string }

  async function issueCodeAndReturn(c: Context, accountId: string, flow: AuthzFlow) {
    const code = randomToken();
    await store.createAuthCode({
      codeHash: sha256(code),
      accountId,
      clientId: cfg.desktop.clientId,
      redirectUri: cfg.desktop.redirectUri,
      codeChallenge: flow.challenge,
      expiresAt: new Date(now() + CODE_TTL_MS)
    });
    deleteCookie(c, AUTHZ_COOKIE, cookieOpts);
    const url = `${cfg.desktop.redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(flow.state)}`;
    return html(c, returnToAppPage(url));
  }

  app.get('/oauth/authorize', async (c) => {
    const q = c.req.query();
    if (q.client_id !== cfg.desktop.clientId || q.redirect_uri !== cfg.desktop.redirectUri) {
      // Never redirect to an unregistered URI.
      return html(c, messagePage('Invalid sign-in request', 'Open ATMT Labs and press Sign in again.'), 400);
    }
    const back = (error: string) => c.redirect(`${cfg.desktop.redirectUri}?error=${error}&state=${encodeURIComponent(q.state ?? '')}`, 302);
    if (q.response_type !== 'code') return back('unsupported_response_type');
    if (q.code_challenge_method !== 'S256' || !/^[A-Za-z0-9_-]{43}$/.test(q.code_challenge ?? '')) return back('invalid_request');
    if (!q.state || q.state.length > 512) return back('invalid_request');
    const flow: AuthzFlow = { state: q.state, challenge: q.code_challenge };
    const acct = await sessionAccount(c);
    if (acct) return issueCodeAndReturn(c, acct.id, flow);
    await writeFlow(c, AUTHZ_COOKIE, flow);
    return html(c, loginPage({ providers: cfg.providers, next: '/oauth/continue', signup: q.screen_hint === 'signup' }));
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
      if (!f.code || !f.code_verifier || f.redirect_uri !== cfg.desktop.redirectUri) return oauthJson(c, { error: 'invalid_request' }, 400);
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
      return html(c, loginPage({ providers: cfg.providers, next: flow?.next ?? '/account', signup: false, error: 'That sign-in expired. Please try again.' }), 400);
    }
    if (q.error || !q.code) {
      return html(c, loginPage({ providers: cfg.providers, next: flow.next, signup: false, error: 'Sign-in was cancelled.' }), 400);
    }
    let who;
    try {
      const d = await oidc.discover(p);
      who = await oidc.complete(p, d, { code: q.code, redirectUri: `${cfg.authOrigin}/login/${p.id}/callback`, verifier: flow.verifier, nonce: flow.nonce, now: now() });
    } catch (e) {
      const msg = /email/.test((e as Error).message)
        ? `${p.label} did not share a verified email address, which your license is tied to.`
        : 'Sign-in failed. Please try again.';
      return html(c, loginPage({ providers: cfg.providers, next: flow.next, signup: false, error: msg }), 400);
    }
    const acct = await store.signIn(p.id, who.subject, who.email, who.name);
    const token = randomToken();
    await store.createSession(sha256(token), acct.id, new Date(now() + SESSION_TTL_MS));
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

  app.get('/account', async (c) => {
    const acct = await sessionAccount(c);
    if (!acct) return c.redirect('/login?next=/account', 302);
    const [license, devices, price] = await Promise.all([store.license(acct.id), store.devices(acct.id), billing.priceInfo()]);
    return html(c, accountPage({
      account: acct, license, devices, maxDevices: cfg.maxDevices, price: price.label,
      trialDays: cfg.trialDays, canTrial: billing.canTrial(license), notice: c.req.query('notice')?.slice(0, 200)
    }));
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
  app.post('/account/devices/:id/remove', accountPost(async (c, a) => {
    await store.releaseDevice(a.id, c.req.param('id') ?? '');
    return c.redirect('/account', 303);
  }));

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
