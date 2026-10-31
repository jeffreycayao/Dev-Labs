/**
 * Discord trigger — a Discord @-mention of the bot becomes work in Ramon's queue,
 * the way src/main/slack.ts does it for Slack.
 *
 * shortcut: polls the listed channels every few seconds over REST instead of
 * holding a Gateway websocket (no new dependency, no public tunnel, nothing
 * listening). Upgrade to a Gateway client if users need DMs or many channels.
 *
 * The bot token is the Discord connector's key in the encrypted secret store;
 * it is passed in lazily (`getToken`), used only for requests to discord.com
 * from this process, and never logged or sent to the renderer.
 *
 * Electron-free so it can be tested under plain node with a fake fetch.
 */
import { discordTrigger, snowflakeAfter, chunkDiscordText, type DiscordMessage } from '../shared/discord';

const API = 'https://discord.com/api/v10';
const DEFAULT_INTERVAL_MS = 5000;

export interface DiscordInbound {
  text: string;
  channelId: string;
  messageId: string;
  author: string;
}

export interface DiscordPollerOptions {
  getToken: () => string | undefined;
  channelIds: string[];
  /** Who may start work. Empty → the bot application's owner / team members. */
  allowedUserIds: string[];
  onMessage: (m: DiscordInbound) => void;
  intervalMs?: number;
  fetchImpl?: typeof fetch;
}

type Api = (method: string, route: string, body?: unknown) => Promise<unknown>;

function discordApi(token: string, fetchImpl: typeof fetch): Api {
  return async (method, route, body) => {
    const res = await fetchImpl(`${API}${route}`, {
      method,
      headers: {
        authorization: `Bot ${token}`,
        'user-agent': 'DevLabs (https://devlabs.atmt.dev, 1)',
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined
    });
    const json = await res.json().catch(() => null) as { message?: string } | null;
    if (!res.ok) {
      const err = new Error(json?.message || `HTTP ${res.status}`) as Error & { status?: number };
      err.status = res.status;
      throw err;
    }
    return json;
  };
}

/** Post a message as the bot (split to Discord's 2000-char cap). Pings nobody. */
export async function postDiscordMessage(opts: {
  token: string; channelId: string; content: string; replyTo?: string; fetchImpl?: typeof fetch;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const api = discordApi(opts.token, opts.fetchImpl ?? fetch);
    for (const [i, content] of chunkDiscordText(opts.content).entries()) {
      await api('POST', `/channels/${opts.channelId}/messages`, {
        content,
        allowed_mentions: { parse: [] },
        ...(i === 0 && opts.replyTo ? { message_reference: { message_id: opts.replyTo, fail_if_not_exists: false } } : {})
      });
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export class DiscordPoller {
  private readonly opts: DiscordPollerOptions;
  private timer: ReturnType<typeof setInterval> | null = null;
  private polling = false;
  private botId = '';
  /** channel id → newest message id already seen. */
  private readonly last = new Map<string, string>();
  /** Last error per channel, for the status line. */
  readonly errors = new Map<string, string>();
  botName = '';
  /** The allowlist in force (the configured one, or the resolved owner). */
  allowed: string[] = [];

  constructor(opts: DiscordPollerOptions) {
    this.opts = opts;
  }

  private api(): Api {
    const token = this.opts.getToken();
    if (!token) throw new Error('No Discord bot token. Save it in Settings → Connections → Discord.');
    return discordApi(token, this.opts.fetchImpl ?? fetch);
  }

  /** Check the token, baseline every channel at its newest message (so history
   *  is never replayed as new work), then start polling. */
  async start(): Promise<{ ok: boolean; error?: string; botName?: string }> {
    if (this.timer) return { ok: true, botName: this.botName };
    if (!this.opts.channelIds.length) return { ok: false, error: 'Add at least one channel id.' };
    try {
      const api = this.api();
      const me = await api('GET', '/users/@me') as { id: string; username?: string };
      this.botId = me.id;
      this.botName = me.username ?? '';
      this.allowed = [...this.opts.allowedUserIds];
      if (!this.allowed.length) {
        const app = await api('GET', '/oauth2/applications/@me') as { owner?: { id?: string }; team?: { members?: { user?: { id?: string } }[] } | null };
        const team = (app.team?.members ?? []).map((m) => m.user?.id);
        this.allowed = [...team, app.owner?.id].filter((id): id is string => !!id && id !== this.botId);
      }
      if (!this.allowed.length) return { ok: false, error: 'Add the Discord user ids allowed to start work.' };
      for (const ch of this.opts.channelIds) {
        try {
          const [newest] = await api('GET', `/channels/${ch}/messages?limit=1`) as DiscordMessage[];
          this.last.set(ch, newest?.id ?? '0');
          this.errors.delete(ch);
        } catch (e) {
          this.errors.set(ch, e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    this.timer = setInterval(() => { void this.tick(); }, this.opts.intervalMs ?? DEFAULT_INTERVAL_MS);
    return { ok: true, botName: this.botName };
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  running(): boolean {
    return this.timer != null;
  }

  /** One pass over every channel. Public for tests. */
  async tick(): Promise<void> {
    if (this.polling) return;
    this.polling = true;
    try {
      const api = this.api();
      for (const ch of this.opts.channelIds) {
        try {
          const after = this.last.get(ch);
          // A channel that failed its baseline gets baselined now, not replayed.
          const route = after ? `/channels/${ch}/messages?after=${after}&limit=50` : `/channels/${ch}/messages?limit=1`;
          const msgs = await api('GET', route) as DiscordMessage[];
          this.errors.delete(ch);
          const fresh = [...msgs].sort((a, b) => (snowflakeAfter(a.id, b.id) ? 1 : -1));
          for (const m of fresh) {
            if (after && !snowflakeAfter(m.id, this.last.get(ch) ?? '0')) continue;
            this.last.set(ch, m.id);
            if (!after) continue;
            const { trigger, text } = discordTrigger(m, this.botId, this.allowed);
            if (trigger) {
              try { this.opts.onMessage({ text, channelId: ch, messageId: m.id, author: m.author?.username ?? '' }); }
              catch { /* delivery is best-effort */ }
            }
          }
          if (!after && !fresh.length) this.last.set(ch, '0');
        } catch (e) {
          // 429s and transient errors: keep the cursor, retry next tick.
          this.errors.set(ch, e instanceof Error ? e.message : String(e));
        }
      }
    } catch (e) {
      for (const ch of this.opts.channelIds) this.errors.set(ch, e instanceof Error ? e.message : String(e));
    } finally {
      this.polling = false;
    }
  }
}
