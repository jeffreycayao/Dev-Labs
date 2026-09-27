/**
 * Test harness: the real app + real SQL (PGlite, in-process Postgres), a fake
 * Google/Yahoo (real signed ID tokens), a fake Stripe that records calls, a
 * cookie jar, and a controllable clock.
 */
import { readFileSync } from 'node:fs';
import { generateKeyPairSync } from 'node:crypto';
import { PGlite } from '@electric-sql/pglite';
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, jwtVerify, type JWK } from 'jose';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';
import { Oidc } from '../src/oidc.js';
import { Store } from '../src/store.js';

export const AUTH = 'https://auth.labs.atmt.dev';
export const API = 'https://api.labs.atmt.dev';
export const REDIRECT = 'atmtlabs://auth/callback';

const schema = readFileSync(new URL('../db/schema.sql', import.meta.url), 'utf8');

export class CardError extends Error {
  type = 'StripeCardError';
  constructor(public code: string) { super(code); }
}

export async function harness(env: Record<string, string> = {}) {
  const clock = { now: Date.UTC(2026, 8, 27, 3, 0, 0) };
  const db = new PGlite();
  await db.exec(schema);
  const store = new Store(async (t, p) => (await db.query(t, (p ?? []) as any[])).rows as any);

  const lic = generateKeyPairSync('ed25519');
  const licensePublic = lic.publicKey;
  const cfg = loadConfig({
    DATABASE_URL: 'postgres://unused',
    SESSION_SECRET: 's'.repeat(40),
    ACCESS_TOKEN_SECRET: 'a'.repeat(40),
    LICENSE_SIGNING_KEY: lic.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    LICENSE_SIGNING_KID: 'k1',
    GOOGLE_CLIENT_ID: 'gcid', GOOGLE_CLIENT_SECRET: 'gsec',
    YAHOO_CLIENT_ID: 'ycid', YAHOO_CLIENT_SECRET: 'ysec',
    STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: 'whsec_x', STRIPE_PRICE_ID: 'price_lifetime',
    CRON_SECRET: 'c'.repeat(24),
    ...env
  });

  // ── fake IdPs ────────────────────────────────────────────────────────────
  const idpKey = await generateKeyPair('RS256');
  const jwk: JWK = { ...(await exportJWK(idpKey.publicKey)), kid: 'idp1', alg: 'RS256' };
  const idp = {
    /** code → identity the next token call returns */
    codes: new Map<string, { iss: string; aud: string; nonce: string; sub: string; email: string; email_verified?: unknown; name?: string }>(),
    tokenCalls: [] as { url: string; auth?: string; body: string }[]
  };
  const discovery = (iss: string, base: string, pkce: boolean) => ({
    issuer: iss,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    jwks_uri: `${base}/jwks`,
    token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post'],
    ...(pkce ? { code_challenge_methods_supported: ['S256'] } : {})
  });
  const fakeFetch = (async (input: any, init: any = {}) => {
    const url = String(input);
    const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json' } });
    if (url === 'https://accounts.google.com/.well-known/openid-configuration') return json(discovery('https://accounts.google.com', 'https://google.test', true));
    if (url === 'https://api.login.yahoo.com/.well-known/openid-configuration') return json(discovery('https://api.login.yahoo.com', 'https://yahoo.test', false));
    if (url.endsWith('/token')) {
      idp.tokenCalls.push({ url, auth: init.headers?.authorization, body: String(init.body) });
      const code = new URLSearchParams(String(init.body)).get('code')!;
      const who = idp.codes.get(code);
      if (!who) return json({ error: 'invalid_grant' }, 400);
      const { iss, aud, ...claims } = who;
      const id_token = await new SignJWT(claims as any)
        .setProtectedHeader({ alg: 'RS256', kid: 'idp1' })
        .setIssuer(iss).setAudience(aud).setIssuedAt(Math.floor(clock.now / 1000)).setExpirationTime(Math.floor(clock.now / 1000) + 600)
        .sign(idpKey.privateKey);
      return json({ id_token, access_token: 'x', token_type: 'Bearer' });
    }
    return json({ error: 'not_found' }, 404);
  }) as typeof fetch;
  const oidc = new Oidc({ fetch: fakeFetch, jwks: () => createLocalJWKSet({ keys: [jwk] }) });

  // ── fake Stripe ──────────────────────────────────────────────────────────
  let n = 0;
  const stripeLog = {
    sessions: [] as any[],
    paymentIntents: [] as { params: any; opts: any }[],
    customers: [] as any[],
    customerUpdates: [] as any[],
    cancelled: [] as string[]
  };
  const stripeState = {
    setupIntents: new Map<string, { pm: string; fingerprint: string }>(),
    charges: new Map<string, { customer: string }>(),
    /** What the next off-session charge does. */
    nextCharge: 'succeed' as 'succeed' | 'authentication_required' | 'card_declined' | 'network'
  };
  const stripe: any = {
    customers: {
      create: async (p: any) => { const c = { id: `cus_${++n}` }; stripeLog.customers.push(p); return c; },
      update: async (id: string, p: any) => { stripeLog.customerUpdates.push({ id, p }); return {}; }
    },
    checkout: { sessions: { create: async (p: any) => { stripeLog.sessions.push(p); return { id: `cs_${++n}`, url: `https://checkout.stripe.com/c/pay/cs_${n}` }; } } },
    setupIntents: {
      retrieve: async (id: string) => {
        const si = stripeState.setupIntents.get(id)!;
        return { id, payment_method: { id: si.pm, card: { fingerprint: si.fingerprint } } };
      }
    },
    paymentIntents: {
      cancel: async (id: string) => { stripeLog.cancelled.push(id); return { id, status: 'canceled' }; },
      create: async (params: any, opts: any) => {
        stripeLog.paymentIntents.push({ params, opts });
        if (stripeState.nextCharge === 'network') throw new Error('ECONNRESET');
        if (stripeState.nextCharge !== 'succeed') throw new CardError(stripeState.nextCharge);
        return { id: `pi_${++n}`, status: 'succeeded', amount: params.amount, currency: params.currency };
      }
    },
    prices: { retrieve: async () => ({ id: 'price_lifetime', type: 'one_time', unit_amount: 4900, currency: 'usd' }) },
    charges: { retrieve: async (id: string) => ({ id, customer: stripeState.charges.get(id)?.customer ?? null }) },
    billingPortal: { sessions: { create: async () => ({ url: 'https://billing.stripe.com/p/session/x' }) } },
    webhooks: {
      constructEvent: (raw: string, sig: string) => {
        if (sig !== 'good-signature') throw new Error('No signatures found matching the expected signature');
        return JSON.parse(raw);
      }
    }
  };

  const app = createApp({ cfg, store, stripe, oidc, now: () => clock.now });

  // ── cookie-jar browser ───────────────────────────────────────────────────
  function browser() {
    const jar = new Map<string, string>();
    const req = async (url: string, init: RequestInit = {}) => {
      const headers = new Headers(init.headers);
      if (jar.size) headers.set('cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
      const res = await app.request(url, { ...init, headers });
      for (const sc of res.headers.getSetCookie()) {
        const [pair, ...attrs] = sc.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i).trim();
        const value = pair.slice(i + 1);
        if (attrs.some((a) => /max-age=0/i.test(a)) || value === '') jar.delete(name);
        else jar.set(name, value);
      }
      return res;
    };
    return { req, jar };
  }

  /** Walk the full browser + IdP flow and return a signed-in browser. */
  async function webSignIn(email: string, opts: { provider?: 'google' | 'yahoo'; sub?: string; next?: string; emailVerified?: unknown } = {}) {
    const b = browser();
    const provider = opts.provider ?? 'google';
    const start = await b.req(`${AUTH}/login/${provider}?next=${encodeURIComponent(opts.next ?? '/account')}`);
    const loc = new URL(start.headers.get('location')!);
    const code = `idpcode_${++n}`;
    idp.codes.set(code, {
      iss: provider === 'google' ? 'https://accounts.google.com' : 'https://api.login.yahoo.com',
      aud: provider === 'google' ? 'gcid' : 'ycid',
      nonce: loc.searchParams.get('nonce')!,
      sub: opts.sub ?? `${provider}-${email}`,
      email,
      ...(opts.emailVerified !== undefined ? { email_verified: opts.emailVerified } : provider === 'google' ? { email_verified: true } : {}),
      name: 'Test User'
    });
    const cb = await b.req(`${AUTH}/login/${provider}/callback?code=${code}&state=${loc.searchParams.get('state')}`);
    return { ...b, idpAuthorizeUrl: loc, callback: cb };
  }

  /** Desktop app sign-in: authorize → web sign-in → code → tokens. */
  async function desktopSignIn(email: string, provider: 'google' | 'yahoo' = 'google', exchangeVerifier?: string, redirect = REDIRECT) {
    const { createHash, randomBytes } = await import('node:crypto');
    const verifier = randomBytes(32).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const b = browser();
    const authz = `${AUTH}/oauth/authorize?response_type=code&client_id=atmt-labs-desktop&redirect_uri=${encodeURIComponent(redirect)}&code_challenge=${challenge}&code_challenge_method=S256&state=st1`;
    const page = await b.req(authz);
    // Sign in within the same browser, then continue.
    const start = await b.req(`${AUTH}/login/${provider}?next=/oauth/continue`);
    const loc = new URL(start.headers.get('location')!);
    const code = `idpcode_${++n}`;
    idp.codes.set(code, {
      iss: provider === 'google' ? 'https://accounts.google.com' : 'https://api.login.yahoo.com',
      aud: provider === 'google' ? 'gcid' : 'ycid',
      nonce: loc.searchParams.get('nonce')!, sub: `${provider}-${email}`, email,
      ...(provider === 'google' ? { email_verified: true } : {})
    });
    await b.req(`${AUTH}/login/${provider}/callback?code=${code}&state=${loc.searchParams.get('state')}`);
    const cont = await b.req(`${AUTH}/oauth/continue`);
    // Loopback redirects are a plain 302; the custom scheme gets a hand-off page.
    const m = redirect.startsWith('http://127.0.0.1:')
      ? /\?code=([^&]+)&state=([^&]+)$/.exec(cont.headers.get('location') ?? '')
      : /atmtlabs:\/\/auth\/callback\?code=([^&"]+)&amp;state=([^"&]+)/.exec(await cont.text());
    if (!m) throw new Error(`no callback in continue response: ${cont.status}`);
    const tok = await app.request(`${AUTH}/oauth/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: decodeURIComponent(m[1]), code_verifier: exchangeVerifier ?? verifier, redirect_uri: redirect, client_id: 'atmt-labs-desktop' }).toString()
    });
    const tokenStatus = tok.status;
    const tokens = (await tok.json()) as { access_token: string; refresh_token: string };
    return { ...tokens, tokenStatus, browser: b, loginPage: page, verifier, code: decodeURIComponent(m[1]), continueResponse: cont };
  }

  async function license(access: string, deviceId = 'machine-aaaaaaaa') {
    const res = await app.request(`${API}/v1/licenses`, {
      method: 'POST',
      headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json' },
      body: JSON.stringify({ device_id: deviceId, device_name: 'box', platform: 'darwin', app_version: '1.0.0' })
    });
    const body = (await res.json()) as { license?: string; error?: string };
    const claims: Record<string, any> | null = body.license
      ? (await jwtVerify(body.license, licensePublic, { issuer: API, audience: 'atmt-labs-desktop', currentDate: new Date(clock.now) })).payload
      : null;
    return { status: res.status, body, claims };
  }

  /** What the app does before calling the API after time passes: rotate the
   *  refresh token for a fresh 15-minute access token. Mutates `s`. */
  async function renew(s: { access_token: string; refresh_token: string }) {
    const r = await app.request(`${AUTH}/oauth/token`, {
      method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh_token, client_id: 'atmt-labs-desktop' }).toString()
    });
    if (r.status !== 200) throw new Error(`renew failed: ${r.status}`);
    const t = (await r.json()) as { access_token: string; refresh_token: string };
    s.access_token = t.access_token;
    s.refresh_token = t.refresh_token;
    return s;
  }

  async function webhook(event: object, sig = 'good-signature') {
    return app.request(`${API}/v1/stripe/webhook`, {
      method: 'POST', headers: { 'stripe-signature': sig, 'content-type': 'application/json' }, body: JSON.stringify(event)
    });
  }

  let ev = 0;
  /** Simulate the user finishing trial Checkout with a card. */
  async function completeTrialCheckout(accountId: string, customer: string, fingerprint: string) {
    const si = `seti_${++n}`;
    stripeState.setupIntents.set(si, { pm: `pm_${n}`, fingerprint });
    return webhook({
      id: `evt_${++ev}`, type: 'checkout.session.completed',
      data: { object: { mode: 'setup', setup_intent: si, customer, metadata: { account_id: accountId, purpose: 'trial' } } }
    });
  }

  async function accountIdFor(email: string) {
    return (await db.query<{ id: string }>(`SELECT id FROM accounts WHERE email = $1`, [email])).rows[0]?.id;
  }

  async function licenseRow(accountId: string) {
    return store.license(accountId);
  }

  return {
    app, cfg, store, db, clock, idp, stripe, stripeLog, stripeState, licensePublic,
    browser, webSignIn, desktopSignIn, license, renew, webhook, completeTrialCheckout, accountIdFor, licenseRow,
    nextEventId: () => `evt_${++ev}`
  };
}
