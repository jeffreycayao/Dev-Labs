// Brand identity — single source of truth for the app name, slugs and the
// Public GitHub distribution repo for updates; remote catalogs are separate.

export const APP_NAME = 'ATMT Labs';
/** Lowercase slug for pipes, user-agents, scan dirs and spec tags. */
export const APP_SLUG = 'atmt-labs';
/** Prefix of packaged installer file names (must match electron-builder.yml). */
export const ARTIFACT_PREFIX = 'ATMT-Labs';
/** Deep-link scheme for shareable hires (must match electron-builder.yml). */
export const PROTOCOL = 'atmtlabs';

/**
 * Public, releases-only repository. Never point an installed client at the
 * private source repository or put a GitHub credential in the app bundle.
 * Keep this in sync with electron-builder.yml's publish block.
 */
export const GITHUB_REPO = 'jeffreycayao/ATMT_LABS_FLOOR-releases';
export const GITHUB_REPO_URL = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : '';

/** Optional repository for public docs/hero.json and docs/model-catalog.json.
 * The distribution repository contains only releases, so bundled catalogs
 * remain active until a separate public catalog source is configured. */
export const CATALOG_REPO = '';

export function rawRepoUrl(path: string): string {
  return CATALOG_REPO ? `https://raw.githubusercontent.com/${CATALOG_REPO}/main/${path}` : '';
}

/**
 * Account sign-in and access (see docs/licensing/DESIGN.md).
 *
 *   labs.atmt.dev       marketing, downloads, release notes
 *   auth.labs.atmt.dev  OAuth 2.0 authorization server: Google/Yahoo sign-in,
 *                       /oauth/authorize, /oauth/token, /oauth/revoke
 *   api.labs.atmt.dev   account API: signed free access tokens and devices
 *
 * `enabled` turns on the sign-in gate in packaged builds. A build with the
 * gate on and no Ed25519 public key refuses to start agents; the test enforces
 * that the keys remain configured.
 */
export const LICENSING = {
  enabled: true,
  siteOrigin: 'https://labs.atmt.dev',
  authOrigin: 'https://auth.labs.atmt.dev',
  apiOrigin: 'https://api.labs.atmt.dev',
  /** Public OAuth client (PKCE, no secret) registered on the auth server. */
  clientId: 'atmt-labs-desktop',
  /** Must be registered as an allowed redirect URI for `clientId`. */
  redirectUri: `${PROTOCOL}://auth/callback`,
  /** `iss` / `aud` every license token must carry. */
  issuer: 'https://api.labs.atmt.dev',
  audience: 'atmt-labs-desktop',
  /**
   * `kid` → Ed25519 public key (SPKI PEM). Several at once so the server can
   * rotate its signing key without stranding installed builds: ship the new
   * key here one release BEFORE the server starts signing with it.
   */
  publicKeys: {
    k20260927: `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAWe0WtYpoCG5kHxb7xxECITj0BAcx2qChmUmcolYXJfY=
-----END PUBLIC KEY-----`
  } as Record<string, string>
} as const;
