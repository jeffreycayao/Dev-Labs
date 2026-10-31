'use strict';
/**
 * DevLabs' Discord connector: an MCP server that posts and reads channel
 * messages as the user's bot. It never holds the bot token: every call goes to
 * the app's loopback broker (MD_UPSTREAM_URL) with a per-agent capability token
 * (MD_UPSTREAM_TOKEN), and the broker adds "Authorization: Bot <token>" on the
 * way to discord.com/api/v10.
 *
 * Posts never ping: allowed_mentions is empty, so an agent can't @everyone.
 */

const MAX_CHARS = 2000;
const SNOWFLAKE = /^\d{15,21}$/;

function snowflake(v, what) {
  const s = String(v ?? '').trim();
  if (!SNOWFLAKE.test(s)) throw new Error(`${what} must be a Discord id (a long number). Turn on Developer Mode in Discord, then right-click → Copy ID.`);
  return s;
}

/** Split text into Discord-sized chunks, preferring line breaks. Mirrors src/shared/discord.ts. */
function chunk(text, max = MAX_CHARS) {
  const out = [];
  let rest = String(text ?? '').trim();
  while (rest.length > max) {
    let cut = rest.lastIndexOf('\n', max);
    if (cut < max / 2) cut = max;
    out.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) out.push(rest);
  return out;
}

/** Compact, oldest-first view of Discord message objects. */
function formatMessages(msgs) {
  return [...msgs].reverse().map((m) => ({
    id: m.id,
    author: m.author ? (m.author.global_name || m.author.username) : 'unknown',
    bot: !!(m.author && m.author.bot),
    at: m.timestamp,
    content: m.content || (m.attachments && m.attachments.length ? `[${m.attachments.length} attachment(s)]` : ''),
    ...(m.message_reference && m.message_reference.message_id ? { reply_to: m.message_reference.message_id } : {})
  }));
}

function client(env, fetchImpl = fetch) {
  const base = env.MD_UPSTREAM_URL;
  const token = env.MD_UPSTREAM_TOKEN;
  return async function api(method, route, body) {
    if (!base || !token) throw new Error('The Discord connector is not connected. Restart this agent after saving the bot token in Settings → Connections.');
    const res = await fetchImpl(`${base}${route}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json;
    try { json = text ? JSON.parse(text) : null; } catch { json = null; }
    if (!res.ok) {
      const why = (json && (json.message || json.error)) || text || res.statusText;
      if (res.status === 403) throw new Error(`Discord refused (${why}). Check the bot was invited to that server and can see/post in the channel.`);
      if (res.status === 404) throw new Error(`Discord could not find that (${why}). Check the id.`);
      throw new Error(`Discord error ${res.status}: ${why}`);
    }
    return json;
  };
}

function tools(api) {
  const id = (description) => ({ type: 'string', description });
  return [
    {
      name: 'send_message',
      description: 'Post a message to a Discord channel as the DevLabs bot. Long text is split into several messages. Mentions never ping anyone.',
      inputSchema: {
        type: 'object',
        properties: {
          channel_id: id('Channel id.'),
          content: { type: 'string', description: 'Message text (Discord markdown).' },
          reply_to: id('Optional message id to reply to.')
        },
        required: ['channel_id', 'content']
      },
      run: async (a) => {
        const channel = snowflake(a.channel_id, 'channel_id');
        const parts = chunk(a.content);
        if (!parts.length) throw new Error('content is required');
        const ids = [];
        for (const [i, content] of parts.entries()) {
          const body = { content, allowed_mentions: { parse: [] } };
          if (i === 0 && a.reply_to) body.message_reference = { message_id: snowflake(a.reply_to, 'reply_to'), fail_if_not_exists: false };
          ids.push((await api('POST', `/channels/${channel}/messages`, body)).id);
        }
        return { sent: ids.length, message_ids: ids };
      }
    },
    {
      name: 'read_messages',
      description: 'Read the most recent messages in a Discord channel, oldest first.',
      inputSchema: {
        type: 'object',
        properties: { channel_id: id('Channel id.'), limit: { type: 'number', description: 'How many (1-100, default 20).' } },
        required: ['channel_id']
      },
      run: async (a) => {
        const limit = Math.min(Math.max(Number(a.limit) || 20, 1), 100);
        return formatMessages(await api('GET', `/channels/${snowflake(a.channel_id, 'channel_id')}/messages?limit=${limit}`));
      }
    },
    {
      name: 'list_channels',
      description: 'List the servers the bot is in and their text channels, with ids.',
      inputSchema: { type: 'object', properties: {} },
      run: async () => {
        const guilds = await api('GET', '/users/@me/guilds');
        const out = [];
        for (const g of guilds.slice(0, 25)) {
          const channels = await api('GET', `/guilds/${g.id}/channels`);
          // 0 = text, 5 = announcement
          out.push({ server: g.name, id: g.id, channels: channels.filter((c) => c.type === 0 || c.type === 5).map((c) => ({ name: c.name, id: c.id })) });
        }
        return out;
      }
    }
  ];
}

module.exports = { chunk, formatMessages, client, tools };

if (require.main === module) {
  require('./md-mcp-stdio.cjs').serve({ name: 'devlabs-discord', version: '1.0.0', tools: tools(client(process.env)) });
}
