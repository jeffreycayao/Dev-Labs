/**
 * Environment → typed config. Every secret comes from env (Vercel project
 * settings in production, `.env.local` for local runs; see .env.example).
 * Missing required values fail loudly at the first request instead of
 * half-working.
 */

export type ProviderId = 'google' | 'yahoo';

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  /** OIDC discovery document. */
  issuerDiscovery: string;
  clientId: string;
  clientSecret: string;
  scope: string;
  /** Some IdPs (Yahoo) do not always send email_verified; see oidc.ts. */
  requireEmailVerifiedClaim: boolean;
}

export interface Config {
  siteOrigin: string;
  authOrigin: string;
  apiOrigin: string;
  databaseUrl: string;
  sessionSecret: string;
  accessTokenSecret: string;
  license: {
    privateKeyPem: string;
    kid: string;
    issuer: string;
    audience: string;
  };
  desktop: {
    clientId: string;
    redirectUri: string;
  };
  providers: ProviderConfig[];
}

type Env = Record<string, string | undefined>;

function req(env: Env, name: string, minLen = 1): string {
  const v = env[name]?.trim();
  if (!v || v.length < minLen) {
    throw new Error(`Missing or too-short env var ${name}${minLen > 1 ? ` (min ${minLen} chars)` : ''}`);
  }
  return v;
}

function origin(env: Env, name: string, fallback: string): string {
  const v = (env[name]?.trim() || fallback).replace(/\/+$/, '');
  const u = new URL(v);
  if (u.origin !== v) throw new Error(`${name} must be a bare origin like https://example.com`);
  return v;
}

/** PEMs pasted into Vercel/`.env` often arrive with literal `\n`. */
function pem(v: string): string {
  return v.includes('\\n') ? v.replace(/\\n/g, '\n') : v;
}

export function loadConfig(env: Env = process.env): Config {
  const apiOrigin = origin(env, 'API_ORIGIN', 'https://api.labs.atmt.dev');
  const providers: ProviderConfig[] = [];
  if (env.GOOGLE_CLIENT_ID?.trim()) {
    providers.push({
      id: 'google',
      label: 'Google',
      issuerDiscovery: 'https://accounts.google.com/.well-known/openid-configuration',
      clientId: req(env, 'GOOGLE_CLIENT_ID'),
      clientSecret: req(env, 'GOOGLE_CLIENT_SECRET'),
      scope: 'openid email profile',
      requireEmailVerifiedClaim: true
    });
  }
  if (env.YAHOO_CLIENT_ID?.trim()) {
    providers.push({
      id: 'yahoo',
      label: 'Yahoo',
      issuerDiscovery: 'https://api.login.yahoo.com/.well-known/openid-configuration',
      clientId: req(env, 'YAHOO_CLIENT_ID'),
      clientSecret: req(env, 'YAHOO_CLIENT_SECRET'),
      scope: 'openid email profile',
      requireEmailVerifiedClaim: false
    });
  }
  if (providers.length === 0) throw new Error('Configure at least one sign-in provider (GOOGLE_CLIENT_ID or YAHOO_CLIENT_ID)');

  return {
    siteOrigin: origin(env, 'SITE_ORIGIN', 'https://labs.atmt.dev'),
    authOrigin: origin(env, 'AUTH_ORIGIN', 'https://auth.labs.atmt.dev'),
    apiOrigin,
    databaseUrl: env.DATABASE_URL?.trim() || req(env, 'POSTGRES_URL'),
    sessionSecret: req(env, 'SESSION_SECRET', 32),
    accessTokenSecret: req(env, 'ACCESS_TOKEN_SECRET', 32),
    license: {
      privateKeyPem: pem(req(env, 'LICENSE_SIGNING_KEY')),
      kid: req(env, 'LICENSE_SIGNING_KID'),
      issuer: apiOrigin,
      audience: 'atmt-labs-desktop'
    },
    desktop: {
      clientId: env.DESKTOP_CLIENT_ID?.trim() || 'atmt-labs-desktop',
      redirectUri: env.DESKTOP_REDIRECT_URI?.trim() || 'atmtlabs://auth/callback'
    },
    providers
  };
}
