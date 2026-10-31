/**
 * Discord trigger — pure rules (no electron, no network), shared by the main
 * process poller (src/main/discord.ts) and its tests.
 *
 * The trigger mirrors Slack's: only a message that @-mentions the bot starts
 * work, the bot's own messages never do, and the mention is stripped so
 * "@DevLabs fix the build" queues "fix the build" for Ramon.
 */

/** Discord ids are snowflakes: unsigned 64-bit integers written in decimal. */
export const SNOWFLAKE_RE = /^\d{15,21}$/;

/** Discord's per-message character cap. */
export const DISCORD_MAX_CHARS = 2000;

/** The subset of a Discord message object the trigger reads. */
export interface DiscordMessage {
  id: string;
  channel_id?: string;
  content?: string;
  author?: { id?: string; bot?: boolean; username?: string };
  mentions?: { id?: string }[];
}

/** Config the user saves in the Triggers tab. The bot token is NOT here; it is
 *  the Discord connector's key in the encrypted secret store. */
export interface DiscordTriggerConfig {
  enabled: boolean;
  /** Channels watched for @-mentions. */
  channelIds: string[];
  /** Discord users allowed to start work. Empty = the bot application's owner
   *  (or its team members), looked up at start. Anyone else is ignored: a
   *  server can be public, and a request drives agents autonomously. */
  allowedUserIds: string[];
}

export const DEFAULT_DISCORD_TRIGGER: DiscordTriggerConfig = { enabled: false, channelIds: [], allowedUserIds: [] };

/** Pull channel ids out of whatever the user pasted: commas, spaces, newlines,
 *  or whole channel links (…/channels/<guild>/<channel>). Unique, in order. */
export function parseChannelIds(input: string): string[] {
  const out: string[] = [];
  for (const raw of input.split(/[\s,]+/)) {
    if (!raw) continue;
    const id = raw.includes('/') ? raw.replace(/\/+$/, '').split('/').pop() ?? '' : raw;
    if (SNOWFLAKE_RE.test(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Sanitize a stored trigger config (untrusted: renderer IPC / hand-edited JSON). */
export function normalizeDiscordTrigger(v: unknown): DiscordTriggerConfig {
  const p = (v ?? {}) as { enabled?: unknown; channelIds?: unknown; allowedUserIds?: unknown };
  const ids = (x: unknown) => (Array.isArray(x) ? parseChannelIds(x.filter((s) => typeof s === 'string').join(' ')) : []);
  return { enabled: p.enabled === true, channelIds: ids(p.channelIds).slice(0, 20), allowedUserIds: ids(p.allowedUserIds).slice(0, 50) };
}

/** Remove `<@id>` / `<@!id>` mentions of the bot, then trim. */
export function stripBotMention(text: string, botId: string): string {
  return text.replace(new RegExp(`<@!?${botId}>`, 'g'), ' ').replace(/\s+/g, ' ').trim();
}

/** Should this message start work? Only an allowed human's message that mentions
 *  the bot. An empty allowlist lets nobody in. */
export function discordTrigger(msg: DiscordMessage, botId: string, allowedUserIds: readonly string[]): { trigger: boolean; text: string } {
  if (!botId || !msg.author?.id || msg.author.id === botId || msg.author.bot) return { trigger: false, text: '' };
  if (!allowedUserIds.includes(msg.author.id)) return { trigger: false, text: '' };
  const content = msg.content ?? '';
  const mentioned = (msg.mentions ?? []).some((m) => m.id === botId) || new RegExp(`<@!?${botId}>`).test(content);
  if (!mentioned) return { trigger: false, text: '' };
  const text = stripBotMention(content, botId);
  return { trigger: text.length > 0, text };
}

/** Snowflake order (ids are too big for Number). */
export function snowflakeAfter(a: string, b: string): boolean {
  return BigInt(a) > BigInt(b);
}

/** Split text into Discord-sized chunks, preferring line breaks. */
export function chunkDiscordText(text: string, max = DISCORD_MAX_CHARS): string[] {
  const out: string[] = [];
  let rest = text.trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}
