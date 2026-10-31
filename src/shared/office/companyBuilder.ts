/**
 * Company builder (ported from Claw3D's company-builder): the user describes a
 * company, an LLM plans the team, and the plan becomes a FLOOR manifest that goes
 * through the normal floor review ("Hire all" / one by one). Pure; no I/O.
 *
 * SECURITY: the LLM reply is untrusted input, same as a shared floor file. We copy
 * only a fixed set of text fields out of it (name, title, mission, duties,
 * personality, tags) and build the floor ourselves — the reply can never pick a
 * provider, model, command, flag, skill or MCP server. The result then goes
 * through `validateFloorManifest`, so it can't carry anything a hand-written
 * floor couldn't.
 */
import { validateFloorManifest, FLOOR_SPEC_V1, type FloorManifest } from '../floor';
import { HIRE_SPEC_V1 } from '../hire';

export const COMPANY_MAX_DESCRIPTION = 4000;
export const COMPANY_MAX_ROLES = 8;
const MAX_REPLY_CHARS = 64 * 1024;
const ACCENTS = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

export interface CompanyPrompt { system: string; user: string }

/** The chat prompt for the planning LLM. The description is the user's text. */
export function buildCompanyPlanPrompt(description: string): CompanyPrompt {
  return {
    system: [
      'You design small teams of AI coding/work agents for a desktop app.',
      'Reply with ONE JSON object and nothing else (no markdown fence, no commentary).',
      'Schema:',
      '{ "companyName": string, "summary": string, "roles": [ {',
      '  "name": string (one short first name or word, unique),',
      '  "title": string (job title, under 8 words),',
      '  "mission": string (one or two sentences),',
      '  "responsibilities": string[] (3-5 short items),',
      '  "personality": string (tone and working style, one sentence),',
      '  "tags": string[] (1-4 one-word skills)',
      '} ] }',
      `Plan between 2 and ${COMPANY_MAX_ROLES} roles. Keep it practical.`,
      'Do not include commands, flags, file paths, URLs or tool settings.'
    ].join('\n'),
    user: `Company description:\n${description.trim().slice(0, COMPANY_MAX_DESCRIPTION)}`
  };
}

export type CompanyPlanResult =
  | { ok: true; floor: FloorManifest; consentRequired?: string[] }
  | { ok: false; error: string };

/** LLM reply text → a validated floor manifest, or a plain-language error. */
export function parseCompanyPlan(reply: unknown): CompanyPlanResult {
  if (typeof reply !== 'string' || !reply.trim()) return { ok: false, error: 'The planner returned nothing. Try again.' };
  if (reply.length > MAX_REPLY_CHARS) return { ok: false, error: 'The planner reply was too long. Try a shorter description.' };
  const raw = extractJson(reply);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'The planner did not return a team plan. Try again or reword the description.' };
  }
  const o = raw as Record<string, unknown>;
  const roles = Array.isArray(o.roles) ? o.roles : [];

  const hires: Record<string, unknown>[] = [];
  const used = new Set<string>();
  for (const r of roles) {
    if (hires.length >= COMPANY_MAX_ROLES) break;
    if (!r || typeof r !== 'object' || Array.isArray(r)) continue;
    const role = r as Record<string, unknown>;
    const title = text(role.title, 120);
    const name = uniqueName(cleanName(text(role.name, 60) || title), used);
    if (!name) continue;
    const mission = text(role.mission, 600);
    const duties = list(role.responsibilities, 6, 160);
    const personality = text(role.personality, 400);
    const goal = [
      mission,
      duties.length ? `Responsibilities:\n${duties.map((d) => `- ${d}`).join('\n')}` : '',
      personality ? `Personality: ${personality}` : ''
    ].filter(Boolean).join('\n\n').slice(0, 4000);
    const tags = list(role.tags, 4, 40);
    hires.push({
      spec: HIRE_SPEC_V1,
      name,
      description: title.slice(0, 200) || undefined,
      goal: goal || undefined,
      accent: ACCENTS[hires.length % ACCENTS.length],
      capabilities: tags.length ? tags : undefined
    });
  }
  if (hires.length === 0) return { ok: false, error: 'The plan had no usable roles. Try describing the work the team should do.' };

  const v = validateFloorManifest({
    spec: FLOOR_SPEC_V1,
    name: text(o.companyName, 80) || 'New company',
    description: text(o.summary, 500) || undefined,
    hires
  });
  if (!v.ok || !v.floor) return { ok: false, error: `The plan could not be used: ${v.errors.join('; ')}` };
  return { ok: true, floor: v.floor, consentRequired: v.consentRequired };
}

/** First balanced-looking `{…}` in the reply, tolerating a ```json fence or chatter. */
function extractJson(reply: string): unknown {
  const s = reply.replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{');
  const b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}

/** Single-line, control-char-free, capped. Non-strings become ''. */
function text(v: unknown, max: number): string {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return v.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function list(v: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(v)) return [];
  return v.map((x) => text(x, maxLen)).filter(Boolean).slice(0, maxItems);
}

/** Agent names seed hive ids and show on the floor: letters, digits, space, . _ - only. */
function cleanName(v: string): string {
  return v.replace(/[^\p{L}\p{N} ._-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 32);
}

function uniqueName(base: string, used: Set<string>): string {
  if (!base) return '';
  let name = base;
  for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 36)} ${n}`;
  used.add(name.toLowerCase());
  return name;
}
