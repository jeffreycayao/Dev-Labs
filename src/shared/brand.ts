// Brand identity — single source of truth for the app name, slugs and the
// GitHub repo that serves updates and remote catalogs.

export const APP_NAME = 'ATMT Labs';
/** Lowercase slug for pipes, user-agents, scan dirs and spec tags. */
export const APP_SLUG = 'atmt-labs';
/** Prefix of packaged installer file names (must match electron-builder.yml). */
export const ARTIFACT_PREFIX = 'ATMT-Labs';
/** Deep-link scheme for shareable hires (must match electron-builder.yml). */
export const PROTOCOL = 'atmtlabs';

/**
 * `owner/repo` on GitHub that hosts releases + docs/hero.json + docs/model-catalog.json.
 * Empty = auto-update and remote catalogs are OFF (the app uses its bundled
 * defaults). Set this AND `publish:` in electron-builder.yml once the repo exists.
 */
export const GITHUB_REPO = '';
export const GITHUB_REPO_URL = GITHUB_REPO ? `https://github.com/${GITHUB_REPO}` : '';

export function rawRepoUrl(path: string): string {
  return GITHUB_REPO ? `https://raw.githubusercontent.com/${GITHUB_REPO}/main/${path}` : '';
}

/**
 * Accounts + licensing (see docs/licensing/DESIGN.md).
 *
 *   labs.atmt.dev       marketing, pricing, downloads, release notes
 *   auth.labs.atmt.dev  OAuth 2.0 authorization server: Google/Yahoo sign-in,
 *                       /oauth/authorize, /oauth/token, /oauth/revoke
 *   api.labs.atmt.dev   licensing API: signed license tokens, devices, Stripe
 *                       checkout/portal sessions, Stripe webhooks
 *
 * `enabled` is the ONE switch that turns the sign-in gate on in packaged builds.
 * Leave it false until api.labs.atmt.dev is live AND its Ed25519 public key is
 * pasted into `publicKeys` — a build with the gate on and no key refuses to
 * start agents for everyone. test/license-core.test.cjs fails the build if
 * `enabled` is true while `publicKeys` is empty.
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
