// Text helpers for spoken agent replies. Pure, so the renderer hook stays thin and testable.

/** Turn an agent reply into something worth saying aloud: drop code and markdown,
 *  keep the first `maxSentences` sentences, and never exceed `maxChars`. */
export function speakableText(raw: unknown, maxSentences = 2, maxChars = 280): string {
  if (typeof raw !== 'string') return '';
  const plain = raw
    .replace(/```[\s\S]*?(```|$)/g, ' ') // fenced code (closed or still streaming)
    .replace(/`([^`]*)`/g, '$1')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown links/images -> their text
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]|\d+\.)\s+/gm, '')
    .replace(/[*_~|#]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return '';
  const sentences = plain.match(/[^.!?]+(?:[.!?]+|$)/g) ?? [plain];
  let out = sentences.slice(0, maxSentences).join(' ').replace(/\s+/g, ' ').trim();
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const space = cut.lastIndexOf(' ');
    out = `${(space > maxChars / 2 ? cut.slice(0, space) : cut).trim()}…`;
  }
  return out;
}

export type ReplySource = { id: string; recentAssistantText?: string; recentTextTs?: number };

type Seen = Map<string, { ts: number; text: string }>;

/** Compare agents against the last-seen replies. The first call (seen = null) only
 *  records what's there, so mounting never replays old replies. A reply counts as new
 *  only when its timestamp moved AND its text changed: the store bumps the timestamp
 *  on reconnect while the old text is still there. */
export function pickNewReplies(seen: Seen | null, agents: readonly ReplySource[]): { seen: Seen; fresh: string[] } {
  const next: Seen = new Map();
  const fresh: string[] = [];
  for (const a of agents) {
    const ts = a.recentTextTs ?? 0;
    const text = a.recentAssistantText?.trim() ?? '';
    next.set(a.id, { ts, text });
    const prev = seen?.get(a.id);
    if (seen && text && ts > (prev?.ts ?? 0) && text !== prev?.text) fresh.push(text);
  }
  return { seen: next, fresh };
}
