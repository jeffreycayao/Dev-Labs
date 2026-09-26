// Brand identity — single source of truth for the app name, slugs and the
// GitHub repo that serves updates and remote catalogs.

export const APP_NAME = 'ATMT LAB';
/** Lowercase slug for pipes, user-agents, scan dirs and spec tags. */
export const APP_SLUG = 'atmt-lab';
/** Prefix of packaged installer file names (must match electron-builder.yml). */
export const ARTIFACT_PREFIX = 'ATMT-LAB';
/** Deep-link scheme for shareable hires (must match electron-builder.yml). */
export const PROTOCOL = 'atmtlab';

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
