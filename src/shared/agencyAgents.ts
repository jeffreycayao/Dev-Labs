/**
 * The agency-agents roster (github.com/msitarzewski/agency-agents, MIT): ~270
 * persona files vendored verbatim under resources/agency-agents by
 * tools/sync-agency-agents.cjs. Main lists index.json and reads one persona on
 * request (src/main/agencyAgents.ts); this module turns a persona into the same
 * HireManifest a role template produces, so picking one only pre-fills the Add
 * Agent modal — the human reviews every field and clicks spawn.
 */
import { HIRE_SPEC_V1, HIRE_GOAL_MAX, type HireManifest } from './hire';

export const AGENCY_HOMEPAGE = 'https://github.com/msitarzewski/agency-agents';

/** One row of resources/agency-agents/index.json (written by the sync script). */
export interface AgencyAgentEntry {
  /** File name without `.md`, unique across divisions. */
  id: string;
  /** Upstream top-level directory, a key of divisions.json. */
  division: string;
  name: string;
  description: string;
  emoji: string;
  vibe: string;
  /** `<division>/<file>.md`, relative to the resource dir. */
  file: string;
}

export interface AgencyDivision { label: string; icon: string; color: string }

export type AgencyListResult =
  | { ok: true; agents: AgencyAgentEntry[]; divisions: Record<string, AgencyDivision>; source: { repo: string; commit: string } }
  | { ok: false; error: string };

export type AgencyReadResult = { ok: true; markdown: string } | { ok: false; error: string };

/** Office cast + accent per division, so a picked persona lands with a face.
 *  Unknown divisions fall back to the modal defaults. */
const DIVISION_LOOK: Record<string, { character: string; accent: string }> = {
  engineering: { character: 'dwight', accent: 'sky' },
  design: { character: 'pam', accent: 'peach' },
  marketing: { character: 'kelly', accent: 'peach' },
  'paid-media': { character: 'meredith', accent: 'coral' },
  sales: { character: 'andy', accent: 'lemon' },
  finance: { character: 'kevin', accent: 'lilac' },
  security: { character: 'creed', accent: 'coral' },
  testing: { character: 'ryan', accent: 'mint' },
  product: { character: 'jim', accent: 'sky' },
  'project-management': { character: 'angela', accent: 'lemon' },
  support: { character: 'phyllis', accent: 'mint' },
  research: { character: 'oscar', accent: 'lemon' },
  academic: { character: 'oscar', accent: 'lilac' },
  gis: { character: 'stanley', accent: 'sky' },
  healthcare: { character: 'phyllis', accent: 'coral' },
  'game-development': { character: 'jim', accent: 'lilac' },
  'spatial-computing': { character: 'dwight', accent: 'mint' },
  specialized: { character: 'toby', accent: 'lilac' }
};

/** Persona markdown → standing goal. Drops the frontmatter and the fenced code
 *  blocks: those are the deliverable templates, the bulk of a persona, and for
 *  engines without hooks the goal rides along with every message. The verbatim
 *  file stays in resources for anyone who wants the templates. */
export function agencyGoal(markdown: string): string {
  const body = markdown
    .replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/```[\s\S]*?```/g, '_(template omitted — produce this deliverable in a clear, sensible format)_')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return body.length > HIRE_GOAL_MAX ? `${body.slice(0, HIRE_GOAL_MAX - 1).trimEnd()}…` : body;
}

/** Agent names seed hive ids and show on the floor: letters, digits, space, . _ - only. */
function cleanName(v: string): string {
  return v.replace(/[^\p{L}\p{N} ._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
}

export function agencyHireManifest(entry: AgencyAgentEntry, markdown: string): HireManifest {
  const look = DIVISION_LOOK[entry.division];
  const desc = `${entry.name} — ${entry.description}`.replace(/\s+/g, ' ').trim();
  return {
    spec: HIRE_SPEC_V1,
    name: cleanName(entry.name) || entry.id.slice(0, 40),
    description: desc.length > 200 ? `${desc.slice(0, 199).trimEnd()}…` : desc,
    goal: agencyGoal(markdown),
    character: look?.character,
    accent: look?.accent,
    capabilities: [entry.division],
    author: 'agency-agents (MIT)',
    homepage: AGENCY_HOMEPAGE
  };
}
