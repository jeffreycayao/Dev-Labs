/**
 * Agent personality ("Brain") builder, ported from Claw3D's personalityBuilder.
 *
 * Claw3D keeps a personality in seven workspace files (SOUL, IDENTITY, USER, …).
 * DevLabs agents already read one instruction file in their folder, so the
 * structured fields become ONE marked section in that file. Everything outside
 * the markers is the user's and is never touched. Pure; no I/O.
 */

export interface PersonalityDraft {
  /** Who the agent is, in a sentence or two. */
  identity: string;
  /** Tone: how it comes across. */
  vibe: string;
  /** Beliefs and principles it works by. */
  coreTruths: string;
  /** What it must not do / when to stop and ask. */
  boundaries: string;
  /** How it talks to the user and teammates. */
  communication: string;
  /** About the human it works for. */
  userContext: string;
}

export const PERSONALITY_FIELDS: readonly (keyof PersonalityDraft)[] = [
  'identity', 'vibe', 'coreTruths', 'boundaries', 'communication', 'userContext'
];

/** Section headings in the file (English on disk: the agent reads them, not the UI). */
const HEADINGS: Record<keyof PersonalityDraft, string> = {
  identity: 'Who you are',
  vibe: 'Vibe',
  coreTruths: 'Core truths',
  boundaries: 'Boundaries',
  communication: 'How you communicate',
  userContext: 'About your human'
};

export const PERSONALITY_FIELD_MAX = 2000;

export function emptyPersonality(): PersonalityDraft {
  return { identity: '', vibe: '', coreTruths: '', boundaries: '', communication: '', userContext: '' };
}

/** The instruction file each CLI reads from its working folder. */
export function instructionFileFor(provider: string | undefined): 'CLAUDE.md' | 'GEMINI.md' | 'AGENTS.md' {
  if (!provider || provider === 'claude') return 'CLAUDE.md';
  if (provider === 'gemini' || provider === 'antigravity') return 'GEMINI.md';
  return 'AGENTS.md';
}

function safeId(agentId: string): string {
  return agentId.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64) || 'agent';
}
const startMarker = (id: string) => `<!-- devlabs:personality id="${safeId(id)}" -->`;
const END_MARKER = '<!-- /devlabs:personality -->';

/** Field text can't open a heading or a comment, or it would break the section on re-read. */
function escapeField(v: string): string {
  return v.replace(/\r\n/g, '\n').trim().slice(0, PERSONALITY_FIELD_MAX)
    .replace(/<!--/g, '&lt;!--')
    .split('\n').map((l) => (l.startsWith('#') ? `\\${l}` : l)).join('\n');
}
function unescapeField(v: string): string {
  return v.split('\n').map((l) => (l.startsWith('\\#') ? l.slice(1) : l)).join('\n').replace(/&lt;!--/g, '<!--').trim();
}

export function isEmptyPersonality(d: PersonalityDraft): boolean {
  return PERSONALITY_FIELDS.every((k) => !d[k].trim());
}

/** The marked markdown section for one agent. */
export function buildPersonalitySection(agentId: string, agentName: string, d: PersonalityDraft): string {
  const name = agentName.replace(/[\r\n#<>]/g, ' ').trim().slice(0, 60) || 'this agent';
  const parts = [
    startMarker(agentId),
    `## Personality: ${name}`,
    '',
    `_This section is for the agent named ${name}. Edit it in DevLabs (Edit agent, Personality)._`
  ];
  for (const k of PERSONALITY_FIELDS) {
    const body = escapeField(d[k]);
    if (body) parts.push('', `### ${HEADINGS[k]}`, '', body);
  }
  parts.push(END_MARKER);
  return parts.join('\n');
}

function findSection(content: string, agentId: string): { start: number; end: number } | null {
  const start = content.indexOf(startMarker(agentId));
  if (start < 0) return null;
  const endAt = content.indexOf(END_MARKER, start);
  if (endAt < 0) return null;
  return { start, end: endAt + END_MARKER.length };
}

/** Read this agent's section back into fields; null when the file has none. */
export function readPersonalitySection(content: string, agentId: string): PersonalityDraft | null {
  const at = findSection(content, agentId);
  if (!at) return null;
  const draft = emptyPersonality();
  const byHeading = new Map(PERSONALITY_FIELDS.map((k) => [HEADINGS[k].toLowerCase(), k] as const));
  let field: keyof PersonalityDraft | null = null;
  const buf: string[] = [];
  const flush = () => { if (field) draft[field] = unescapeField(buf.join('\n')); buf.length = 0; };
  for (const line of content.slice(at.start, at.end).replace(/\r\n/g, '\n').split('\n')) {
    const h = /^###\s+(.+?)\s*$/.exec(line);
    if (h) { flush(); field = byHeading.get(h[1].toLowerCase()) ?? null; continue; }
    if (line.startsWith(END_MARKER)) break;
    if (field) buf.push(line);
  }
  flush();
  return draft;
}

/** Replace (or append) this agent's section; an empty draft removes it. Other text is kept as-is. */
export function mergePersonalitySection(content: string, agentId: string, agentName: string, d: PersonalityDraft): string {
  const at = findSection(content, agentId);
  const section = isEmptyPersonality(d) ? '' : buildPersonalitySection(agentId, agentName, d);
  if (at) {
    const before = content.slice(0, at.start);
    const after = content.slice(at.end);
    if (section) return before + section + after;
    // Removing: drop the blank line we added in front of it on append.
    return (before.replace(/\n{2,}$/, '\n') + after.replace(/^\n/, '')).replace(/^\n+/, '');
  }
  if (!section) return content;
  if (!content.trim()) return `${section}\n`;
  return `${content.replace(/\s+$/, '')}\n\n${section}\n`;
}
