/**
 * Upstream sign-in (Google, Yahoo) as a standard OIDC relying party.
 *
 * Endpoints come from each provider's discovery document, so nothing but the
 * issuer is hard-coded. PKCE is used when the provider advertises S256; the
 * ID token is verified against the provider's JWKS (issuer, audience, nonce).
 */
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';
import type { ProviderConfig } from './config.js';

export interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri: string;
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export interface OidcDeps {
  fetch: typeof fetch;
  /** Key resolver for a JWKS URI. Tests inject a local key set. */
  jwks?: (uri: string) => JWTVerifyGetKey;
}

export interface VerifiedIdentity {
  subject: string;
  email: string;
  name: string | null;
}

export class OidcError extends Error {}

const DISCOVERY_TTL_MS = 6 * 3600 * 1000;

export class Oidc {
  private readonly discoveryCache = new Map<string, { at: number; doc: Discovery }>();
  private readonly jwksCache = new Map<string, JWTVerifyGetKey>();

  constructor(private readonly deps: OidcDeps) {}

  async discover(p: ProviderConfig, now = Date.now()): Promise<Discovery> {
    const hit = this.discoveryCache.get(p.issuerDiscovery);
    if (hit && now - hit.at < DISCOVERY_TTL_MS) return hit.doc;
    const res = await this.deps.fetch(p.issuerDiscovery, { headers: { accept: 'application/json' } });
    if (!res.ok) throw new OidcError(`discovery failed for ${p.id}: ${res.status}`);
    const doc = (await res.json()) as Discovery;
    for (const k of ['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as const) {
      if (typeof doc[k] !== 'string' || !doc[k].startsWith('https://')) throw new OidcError(`discovery for ${p.id} lacks ${k}`);
    }
    this.discoveryCache.set(p.issuerDiscovery, { at: now, doc });
    return doc;
  }

  supportsPkce(d: Discovery): boolean {
    return d.code_challenge_methods_supported?.includes('S256') ?? false;
  }

  authorizeUrl(p: ProviderConfig, d: Discovery, a: { redirectUri: string; state: string; nonce: string; challenge?: string; loginHint?: string }): string {
    const u = new URL(d.authorization_endpoint);
    u.searchParams.set('response_type', 'code');
    u.searchParams.set('client_id', p.clientId);
    u.searchParams.set('redirect_uri', a.redirectUri);
    u.searchParams.set('scope', p.scope);
    u.searchParams.set('state', a.state);
    u.searchParams.set('nonce', a.nonce);
    if (a.challenge) {
      u.searchParams.set('code_challenge', a.challenge);
      u.searchParams.set('code_challenge_method', 'S256');
    }
    if (p.id === 'google') u.searchParams.set('prompt', 'select_account');
    return u.toString();
  }

  /** Code → verified identity. */
  async complete(
    p: ProviderConfig,
    d: Discovery,
    a: { code: string; redirectUri: string; verifier?: string; nonce: string; now?: number }
  ): Promise<VerifiedIdentity> {
    const body = new URLSearchParams({ grant_type: 'authorization_code', code: a.code, redirect_uri: a.redirectUri });
    if (a.verifier) body.set('code_verifier', a.verifier);
    const headers: Record<string, string> = { 'content-type': 'application/x-www-form-urlencoded', accept: 'application/json' };
    // RFC 6749 default is client_secret_basic; fall back to _post if that is all the IdP lists.
    const methods = d.token_endpoint_auth_methods_supported ?? ['client_secret_basic'];
    if (methods.includes('client_secret_basic')) {
      const enc = (s: string) => encodeURIComponent(s);
      headers.authorization = `Basic ${Buffer.from(`${enc(p.clientId)}:${enc(p.clientSecret)}`).toString('base64')}`;
    } else {
      body.set('client_id', p.clientId);
      body.set('client_secret', p.clientSecret);
    }
    const res = await this.deps.fetch(d.token_endpoint, { method: 'POST', headers, body: body.toString() });
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok || typeof json.id_token !== 'string') throw new OidcError(`token exchange failed for ${p.id}: ${res.status}`);
    return this.verifyIdToken(p, d, json.id_token, a.nonce, a.now);
  }

  async verifyIdToken(p: ProviderConfig, d: Discovery, idToken: string, nonce: string, now = Date.now()): Promise<VerifiedIdentity> {
    const keys = this.keys(d.jwks_uri);
    let claims: Record<string, unknown>;
    try {
      ({ payload: claims } = await jwtVerify(idToken, keys, {
        issuer: d.issuer,
        audience: p.clientId,
        currentDate: new Date(now),
        clockTolerance: 60
      }));
    } catch (e) {
      throw new OidcError(`id_token rejected for ${p.id}: ${(e as Error).message}`);
    }
    if (claims.nonce !== nonce) throw new OidcError('nonce mismatch');
    const email = typeof claims.email === 'string' ? claims.email.trim().toLowerCase() : '';
    if (!email || !email.includes('@')) throw new OidcError(`${p.label} did not share an email address`);
    // The license is bound to the email, so only accept one the IdP vouches for.
    const verified = claims.email_verified;
    if (verified === false || verified === 'false') throw new OidcError('email not verified');
    if (p.requireEmailVerifiedClaim && verified !== true && verified !== 'true') throw new OidcError('email not verified');
    if (typeof claims.sub !== 'string' || !claims.sub) throw new OidcError('id_token has no sub');
    const name = typeof claims.name === 'string' ? claims.name.slice(0, 120) : null;
    return { subject: claims.sub, email, name };
  }

  private keys(uri: string): JWTVerifyGetKey {
    let k = this.jwksCache.get(uri);
    if (!k) {
      k = this.deps.jwks ? this.deps.jwks(uri) : createRemoteJWKSet(new URL(uri));
      this.jwksCache.set(uri, k);
    }
    return k;
  }
}
