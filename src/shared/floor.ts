/**
 * Shareable floors — a whole team of hires in one file (manifest spec v1).
 *
 *   { "spec": "atmt-labs/floor@1", "name": "Online Seller Team",
 *     "hires": [ <hire@1>, <hire@1>, … ], "connectors": ["pancake-pos"] }
 *
 * A floor is nothing more than a named list of hire manifests plus the
 * connectors the team expects. It inherits the hire security model completely:
 *   - every entry in `hires` goes through `validateHireManifest` unchanged, so a
 *     floor can't carry anything a single hire couldn't (no raw commands, only
 *     allowlisted flags/skills/MCP ids, capped fields);
 *   - importing never spawns by itself — the human reviews the whole team and
 *     clicks "Hire all" (or reviews one by one in the Add-Agent modal);
 *   - `connectors` are MCP catalog ids only, surfaced for consent, never enabled.
 *
 * Pure and dependency-light so main (file/deep link) and renderer (review, export)
 * share one validator. Guide: .documentations/FLOORS.md.
 */
import { validateHireManifest, isAllowedManifestUrl, HIRE_SPEC_V1, type HireManifest } from './hire';
import { mcpCatalogEntry } from './mcpCatalog';

export const FLOOR_SPEC_V1 = 'atmt-labs/floor@1';
/** Hard caps. A floor is a team, not a directory. */
export const FLOOR_MAX_HIRES = 24;
export const FLOOR_MAX_BYTES = 256 * 1024;
const MAX_CONNECTORS = 12;

export interface FloorManifest {
  spec: typeof FLOOR_SPEC_V1;
  name: string;
  description?: string;
  author?: string;
  /** https only. */
  homepage?: string;
  /** The team, in the order it should be hired. */
  hires: HireManifest[];
  /** MCP catalog ids the team expects (e.g. 'pancake-pos'). Shown at import;
   *  keyed ones need the user's own key and consent in Settings. */
  connectors?: string[];
}

export interface FloorValidation {
  ok: boolean;
  floor?: FloorManifest;
  errors: string[];
  /** Catalog ids (from `connectors` and every hire's `mcpServers`) that are not
   *  safe-readonly — the review screen must ask the human about these. */
  consentRequired?: string[];
}

function str(v: unknown): v is string { return typeof v === 'string'; }

function capped(v: unknown, max: number, field: string, errors: string[], required = false): string | undefined {
  if (v === undefined || v === null) {
    if (required) errors.push(`"${field}" is required`);
    return undefined;
  }
  if (!str(v)) { errors.push(`"${field}" must be a string`); return undefined; }
  const t = v.trim();
  if (required && !t) { errors.push(`"${field}" must not be empty`); return undefined; }
  if (t.length > max) { errors.push(`"${field}" exceeds ${max} chars`); return undefined; }
  return t || undefined;
}

/** Validate an untrusted parsed JSON value into a FloorManifest. Pure; no I/O. */
export function validateFloorManifest(raw: unknown): FloorValidation {
  const errors: string[] = [];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, errors: ['a floor must be a JSON object'] };
  }
  const o = raw as Record<string, unknown>;
  if (o.spec !== FLOOR_SPEC_V1) {
    return { ok: false, errors: [`"spec" must be "${FLOOR_SPEC_V1}"`] };
  }
  const name = capped(o.name, 80, 'name', errors, true);
  const description = capped(o.description, 500, 'description', errors);
  const author = capped(o.author, 80, 'author', errors);
  const homepage = capped(o.homepage, 300, 'homepage', errors);
  if (homepage && !homepage.startsWith('https://')) errors.push('"homepage" must be https');

  const hires: HireManifest[] = [];
  const consent = new Set<string>();
  if (!Array.isArray(o.hires) || o.hires.length === 0) {
    errors.push('"hires" must be a non-empty array');
  } else if (o.hires.length > FLOOR_MAX_HIRES) {
    errors.push(`"hires" may list at most ${FLOOR_MAX_HIRES} agents`);
  } else {
    const seen = new Set<string>();
    o.hires.forEach((h, i) => {
      // Inside a floor the per-hire spec tag is optional (the floor already
      // declares its version); a WRONG tag is still an error.
      const withSpec = h && typeof h === 'object' && !Array.isArray(h) && (h as Record<string, unknown>).spec === undefined
        ? { ...(h as Record<string, unknown>), spec: HIRE_SPEC_V1 }
        : h;
      const v = validateHireManifest(withSpec);
      if (!v.ok || !v.manifest) {
        errors.push(`hires[${i}]: ${v.errors.join('; ')}`);
        return;
      }
      const key = v.manifest.name.toLowerCase();
      if (seen.has(key)) { errors.push(`hires[${i}]: duplicate agent name "${v.manifest.name}"`); return; }
      seen.add(key);
      hires.push(v.manifest);
      for (const id of v.consentRequired ?? []) consent.add(id);
    });
  }

  let connectors: string[] | undefined;
  if (o.connectors !== undefined) {
    if (!Array.isArray(o.connectors) || o.connectors.length > MAX_CONNECTORS) {
      errors.push(`"connectors" must be an array of at most ${MAX_CONNECTORS} ids`);
    } else {
      connectors = [];
      for (const c of o.connectors) {
        if (!str(c) || !c.trim()) { errors.push('"connectors" entries must be non-empty strings'); continue; }
        const id = c.trim();
        const entry = mcpCatalogEntry(id);
        if (!entry) { errors.push(`"connectors": ${JSON.stringify(id)} is not a known connector`); continue; }
        if (!connectors.includes(id)) connectors.push(id);
        if (entry.tier !== 'safe-readonly') consent.add(id);
      }
      if (connectors.length === 0) connectors = undefined;
    }
  }

  if (errors.length > 0 || !name) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    consentRequired: consent.size ? [...consent] : undefined,
    floor: { spec: FLOOR_SPEC_V1, name, description, author, homepage, hires, connectors }
  };
}

/** `atmtlabs://floor?src=<https-url>` → the manifest URL, or null. Same URL
 *  rules as hire links (https; http only for loopback dev). */
export function parseFloorDeepLink(link: string): string | null {
  let u: URL;
  try { u = new URL(link); } catch { return null; }
  if (u.protocol !== 'atmtlabs:') return null;
  const action = (u.host || u.pathname.replace(/^\/+/, '')).toLowerCase();
  if (action !== 'floor') return null;
  const src = u.searchParams.get('src');
  if (!src) return null;
  let s: URL;
  try { s = new URL(src); } catch { return null; }
  return isAllowedManifestUrl(s) ? s.toString() : null;
}

/** What export needs to know about one live agent. */
export interface ExportableAgent {
  id: string;
  name: string;
  description?: string;
  goal?: string;
  character?: string;
  accent?: string;
  provider?: string;
  model?: string;
  command?: string;
  worktreePath?: string;
  isGod?: boolean;
  isAssistant?: boolean;
  archived?: boolean;
}

/**
 * Build a floor file from the current team.
 *
 * Exports only what a floor may carry: the orchestrator and assistant are part
 * of every floor already and are skipped, as are archived agents. Nothing
 * machine-specific leaves (no folders, worktrees, session ids). Command flags
 * are reduced to the hire allowlist. The result is re-validated with the same
 * validator an importer runs; an agent that wouldn't survive import (e.g. an
 * unsupported engine) is reported in `skipped` instead of silently dropped.
 */
export function buildFloorExport(
  agents: readonly ExportableAgent[],
  meta: { name: string; description?: string; author?: string },
  opts: { tokenCaps?: Record<string, number>; connectors?: string[] } = {}
): { ok: true; floor: FloorManifest; skipped: { name: string; reason: string }[] } | { ok: false; errors: string[] } {
  const skipped: { name: string; reason: string }[] = [];
  const hires: Record<string, unknown>[] = [];
  const names = new Set<string>();
  for (const a of agents) {
    if (a.isGod || a.isAssistant || a.archived) continue;
    const raw: Record<string, unknown> = {
      spec: HIRE_SPEC_V1,
      name: a.name,
      description: a.description && a.description !== 'a fresh harness' ? a.description : undefined,
      goal: a.goal,
      character: a.character,
      accent: a.accent,
      provider: a.provider,
      model: a.model,
      isolate: a.worktreePath ? true : undefined,
      tokenCap: opts.tokenCaps?.[a.id],
      commandFlags: safeFlagsFrom(a.command)
    };
    const v = validateHireManifest(raw);
    if (!v.ok || !v.manifest) { skipped.push({ name: a.name, reason: v.errors.join('; ') }); continue; }
    if (names.has(v.manifest.name.toLowerCase())) { skipped.push({ name: a.name, reason: 'duplicate name' }); continue; }
    names.add(v.manifest.name.toLowerCase());
    const { spec: _spec, ...rest } = v.manifest;
    hires.push(stripUndefined(rest));
  }
  const doc = stripUndefined({
    spec: FLOOR_SPEC_V1,
    name: meta.name,
    description: meta.description,
    author: meta.author,
    hires: hires.slice(0, FLOOR_MAX_HIRES),
    connectors: opts.connectors?.length ? opts.connectors : undefined
  });
  if (hires.length > FLOOR_MAX_HIRES) {
    for (const h of hires.slice(FLOOR_MAX_HIRES)) skipped.push({ name: String(h.name), reason: `a floor holds at most ${FLOOR_MAX_HIRES} agents` });
  }
  const check = validateFloorManifest(doc);
  if (!check.ok || !check.floor) return { ok: false, errors: check.errors.length ? check.errors : ['no exportable agents'] };
  return { ok: true, floor: check.floor, skipped };
}

/** Keep only allowlisted `--flag value` / `--flag=value` pairs from a command
 *  line. `--model` is dropped here because the model travels in its own field. */
function safeFlagsFrom(command: string | undefined): string[] | undefined {
  if (!command) return undefined;
  const allowed = new Set(['--max-turns', '--output-format', '--verbose']);
  const toks = command.trim().split(/\s+/).slice(1);
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    const name = t.split('=', 1)[0].toLowerCase();
    if (!allowed.has(name)) continue;
    out.push(t);
    if (!t.includes('=') && name !== '--verbose' && toks[i + 1] && !toks[i + 1].startsWith('-')) out.push(toks[++i]);
  }
  return out.length ? out : undefined;
}

function stripUndefined<T extends Record<string, unknown>>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T;
}

/** Suggested file name for an exported floor. */
export function floorFileName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'floor';
  return `${slug}.floor.json`;
}
