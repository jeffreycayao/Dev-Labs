/**
 * Owner-side feature switches (Settings → General → Features).
 *
 * One boolean per optional feature, stored as `config.features`. A missing key
 * means "the default", so adding a switch here never changes an existing
 * install until its owner flips it. Pure and dependency-free: main and renderer
 * both read it, tests load it with loadTs.
 */
export interface FeatureFlags {
  /** Inject the user's personal ATTITUDE.md into every agent's instructions.
   *  Inert until the file has text, so "on" with an empty file changes nothing. */
  attitudeFile: boolean;
  /** Bundle the DevLabs-written skills (3D game dev, Three.js, Anime.js, UI/UX
   *  review, DevOps runbooks, security research) into each agent's skills folder. */
  extraSkills: boolean;
  /** Show the UI/UX Designer and Security Researcher role templates in Add Agent. */
  extraRoleTemplates: boolean;
  /** Office chatter (cafeteria lines, gossip) follows the app language. Off =
   *  always the English/Taglish pool. */
  chatterFollowsLanguage: boolean;
  /** The office theme export/import panel (floor bar → Theme). */
  officeThemes: boolean;
  /** Vercel's agent-browser: a real (headless) Chrome the agent drives from the
   *  shell or through MCP. On by default (owner's call); agents can visit sites
   *  and fill forms, so switching it off removes connector and skill alike. */
  agentBrowser: boolean;
}

export const FEATURE_DEFAULTS: Readonly<FeatureFlags> = {
  attitudeFile: true,
  extraSkills: true,
  extraRoleTemplates: true,
  chatterFollowsLanguage: true,
  officeThemes: true,
  agentBrowser: true
};

export const FEATURE_KEYS = Object.keys(FEATURE_DEFAULTS) as (keyof FeatureFlags)[];

/** The effective value of one switch: the stored boolean, else its default. */
export function featureOn(features: Partial<FeatureFlags> | undefined | null, key: keyof FeatureFlags): boolean {
  const v = features?.[key];
  return typeof v === 'boolean' ? v : FEATURE_DEFAULTS[key];
}

/** Skill folder ids under resources/skills that `extraSkills` controls. */
export const EXTRA_SKILL_IDS: readonly string[] = [
  'game-dev-3d', 'threejs', 'animejs', 'ui-ux-review', 'devops-runbooks', 'security-research'
];

/** Bundled skill folders each switch controls; off → not copied to the agent. */
export const FEATURE_SKILLS: Readonly<Partial<Record<keyof FeatureFlags, readonly string[]>>> = {
  extraSkills: EXTRA_SKILL_IDS,
  agentBrowser: ['agent-browser']
};

/** Skill folder ids under resources/skills whose switch is off. */
export function excludedSkillIds(features: Partial<FeatureFlags> | undefined | null): string[] {
  return (Object.keys(FEATURE_SKILLS) as (keyof FeatureFlags)[])
    .filter((k) => !featureOn(features, k))
    .flatMap((k) => FEATURE_SKILLS[k] ?? []);
}

/** Role template ids that `extraRoleTemplates` controls. */
export const EXTRA_TEMPLATE_IDS: readonly string[] = ['ux-designer', 'security-researcher'];
