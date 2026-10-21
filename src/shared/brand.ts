// Brand identity — single source of truth for the app name, slugs and the
// Public GitHub distribution repo for updates; remote catalogs are separate.

export const APP_NAME = 'Jepoy Floor AI';
/** Lowercase slug for user-agents and dev overrides. */
export const APP_SLUG = 'jepoy-floor-ai';
/** Prefix of packaged installer file names (must match electron-builder.yml). */
export const ARTIFACT_PREFIX = 'Jepoy-Floor-AI';
/** Deep-link scheme for shareable hires (must match electron-builder.yml).
 * Kept as `atmtlabs` on purpose: links already shared by older builds use it. */
export const PROTOCOL = 'atmtlabs';

// ---------------------------------------------------------------------------
// Identifiers that still carry the pre-rebrand (ATMT Labs) name on purpose.
// Each one is coupled to state outside this repository; change them only
// together with the external side:
//   - GITHUB_REPO            the releases repo on GitHub
//   - manifest spec tags     `atmt-labs/hire@1` / `atmt-labs/floor@1` in
//                            src/shared/hire.ts and floor.ts (shared files)
//   - `.atmt-skill.json`     metadata name in src/main/skillsCatalog.ts
//   - `atmt-hive` / `atmt-`  hook and MCP ids already deployed on agent
//                            machines (src/main/hive.ts, mcpCatalog.ts)
// ---------------------------------------------------------------------------

/**
 * Public, releases-only repository that installed clients poll for updates.
 * Never put a GitHub credential in the app bundle.
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
