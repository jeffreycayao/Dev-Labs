'use strict';

// Discord: the trigger rules (src/shared/discord.ts), the poller that turns a
// bot @-mention into work for Ramon (src/main/discord.ts), and the bundled MCP
// server agents use to post/read (resources/md-discord-mcp.cjs), which only
// ever talks to the broker.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const d = loadTs('src/shared/discord.ts');
const { DiscordPoller, postDiscordMessage } = loadTs('src/main/discord.ts');
const mcp = require('../resources/md-discord-mcp.cjs');

const BOT = '111111111111111111';
const USER = '222222222222222222';
const CH = '333333333333333333';
const TOKEN = 'bot-token-DO-NOT-LEAK';

// ── rules ────────────────────────────────────────────────────────────────────

test('only an allowed human\'s @-mention of the bot triggers, with the mention stripped', () => {
  const msg = (over) => ({ id: '1', content: `<@${BOT}> fix the build`, author: { id: USER }, mentions: [{ id: BOT }], ...over });
  const discordTrigger = (m, bot) => d.discordTrigger(m, bot, [USER]);
  assert.equal(d.discordTrigger(msg({}), BOT, ['444444444444444444']).trigger, false, 'a stranger in the channel is ignored');
  assert.equal(d.discordTrigger(msg({}), BOT, []).trigger, false, 'an empty allowlist lets nobody in');
  assert.deepEqual(discordTrigger(msg({}), BOT), { trigger: true, text: 'fix the build' });
  assert.deepEqual(discordTrigger(msg({ content: `hey <@!${BOT}>  deploy   it`, mentions: [] }), BOT), { trigger: true, text: 'hey deploy it' });
  assert.equal(discordTrigger(msg({ content: 'no mention', mentions: [] }), BOT).trigger, false);
  assert.equal(discordTrigger(msg({ author: { id: BOT } }), BOT).trigger, false, 'never its own messages');
  assert.equal(discordTrigger(msg({ author: { id: USER, bot: true } }), BOT).trigger, false, 'never other bots');
  assert.equal(discordTrigger(msg({ content: `<@${BOT}>` }), BOT).trigger, false, 'a bare mention has nothing to do');
  assert.equal(discordTrigger(msg({}), '').trigger, false, 'no bot id yet → nothing triggers');
});

test('channel ids come from ids or links, deduped; config is sanitized', () => {
  assert.deepEqual(
    d.parseChannelIds(`${CH}, https://discord.com/channels/444444444444444444/555555555555555555/\n${CH} junk 12`),
    [CH, '555555555555555555']
  );
  assert.deepEqual(d.normalizeDiscordTrigger({ enabled: 'yes', channelIds: [CH, 5, 'x'], allowedUserIds: [USER, 'bob'] }), { enabled: false, channelIds: [CH], allowedUserIds: [USER] });
  assert.deepEqual(d.normalizeDiscordTrigger(null), { enabled: false, channelIds: [], allowedUserIds: [] });
});

test('long text is split under 2000 chars, at line breaks when it can', () => {
  const parts = d.chunkDiscordText(`${'a'.repeat(1500)}\n${'b'.repeat(1500)}`);
  assert.deepEqual(parts.map((p) => p.length), [1500, 1500]);
  assert.ok(d.chunkDiscordText('x'.repeat(4500)).every((p) => p.length <= 2000));
  assert.deepEqual(mcp.chunk('x'.repeat(4500)), d.chunkDiscordText('x'.repeat(4500)), 'MCP copy matches the shared one');
  assert.ok(d.snowflakeAfter('9007199254740993', '9007199254740992'), 'beyond Number precision');
});

// ── poller ───────────────────────────────────────────────────────────────────

function fakeDiscord(pages) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    const u = new URL(url);
    let body;
    if (u.pathname.endsWith('/users/@me')) body = { id: BOT, username: 'DevLabs' };
    else if (u.pathname.endsWith('/oauth2/applications/@me')) body = { owner: { id: USER }, team: null };
    else if (u.pathname.endsWith(`/channels/${CH}/messages`) && init.method === 'GET') body = pages.shift() ?? [];
    else body = { id: '999999999999999999' };
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { calls, fetchImpl };
}

test('poller baselines history, then hands only new @-mentions to Ramon, oldest first', async () => {
  const older = { id: '100000000000000000', content: `<@${BOT}> old request`, author: { id: USER }, mentions: [{ id: BOT }] };
  const fake = fakeDiscord([
    [older],
    // Discord returns newest first.
    [
      { id: '100000000000000004', content: `<@${BOT}> wipe the repo`, author: { id: '444444444444444444' }, mentions: [{ id: BOT }] },
      { id: '100000000000000003', content: `<@${BOT}> second`, author: { id: USER }, mentions: [{ id: BOT }] },
      { id: '100000000000000002', content: 'chatter', author: { id: USER } },
      { id: '100000000000000001', content: `<@${BOT}> first`, author: { id: USER }, mentions: [{ id: BOT }] }
    ],
    []
  ]);
  const got = [];
  // No allowlist saved → only the bot application's owner (USER) gets in.
  const p = new DiscordPoller({ getToken: () => TOKEN, channelIds: [CH], allowedUserIds: [], onMessage: (m) => got.push(m), intervalMs: 60_000, fetchImpl: fake.fetchImpl });
  const r = await p.start();
  p.stop();
  assert.deepEqual(r, { ok: true, botName: 'DevLabs' });
  assert.deepEqual(p.allowed, [USER]);
  await p.tick();
  await p.tick();
  assert.deepEqual(got.map((m) => [m.text, m.messageId]), [['first', '100000000000000001'], ['second', '100000000000000003']], 'the stranger was ignored');
  assert.match(fake.calls[3].url, /after=100000000000000000/, 'polls after the baseline');
  assert.match(fake.calls[4].url, /after=100000000000000004/, 'cursor advances past ignored messages too');
  assert.equal(fake.calls[0].init.headers.authorization, `Bot ${TOKEN}`);
});

test('poller refuses to start without channels, a token, or anyone allowed', async () => {
  const none = new DiscordPoller({ getToken: () => TOKEN, channelIds: [], allowedUserIds: [], onMessage: () => {} });
  assert.equal((await none.start()).ok, false);
  const noToken = new DiscordPoller({ getToken: () => undefined, channelIds: [CH], allowedUserIds: [], onMessage: () => {} });
  assert.match((await noToken.start()).error, /Settings → Connections → Discord/);
  const orphan = fakeDiscord([]);
  const inner = orphan.fetchImpl;
  orphan.fetchImpl = async (url, init) => (String(url).includes('/oauth2/') ? new Response('{"owner":{"id":"' + BOT + '"}}', { status: 200 }) : inner(url, init));
  const nobody = new DiscordPoller({ getToken: () => TOKEN, channelIds: [CH], allowedUserIds: [], onMessage: () => {}, fetchImpl: orphan.fetchImpl });
  assert.match((await nobody.start()).error, /user ids allowed/);
});

test('posts reply to the message and never ping anyone', async () => {
  const fake = fakeDiscord([]);
  const r = await postDiscordMessage({ token: TOKEN, channelId: CH, content: 'Received', replyTo: '100000000000000001', fetchImpl: fake.fetchImpl });
  assert.equal(r.ok, true);
  const body = JSON.parse(fake.calls[0].init.body);
  assert.deepEqual(body.allowed_mentions, { parse: [] });
  assert.equal(body.message_reference.message_id, '100000000000000001');
});

// ── MCP server (agent side) ──────────────────────────────────────────────────

test('MCP server calls only the broker, with the capability token, never a bot token', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const body = init.method === 'GET'
      ? [{ id: '2', content: 'newer', author: { username: 'bob' }, timestamp: 't2' }, { id: '1', content: 'older', author: { username: 'amy', bot: true }, timestamp: 't1' }]
      : { id: '777' };
    return new Response(JSON.stringify(body), { status: 200 });
  };
  const api = mcp.client({ MD_UPSTREAM_URL: 'http://127.0.0.1:5555/i/mcp-discord', MD_UPSTREAM_TOKEN: 'cap' }, fetchImpl);
  const tools = Object.fromEntries(mcp.tools(api).map((t) => [t.name, t]));

  const sent = await tools.send_message.run({ channel_id: CH, content: 'x'.repeat(2500), reply_to: '100000000000000001' });
  assert.deepEqual(sent, { sent: 2, message_ids: ['777', '777'] });
  assert.equal(calls[0].url, `http://127.0.0.1:5555/i/mcp-discord/channels/${CH}/messages`);
  assert.equal(calls[0].init.headers.authorization, 'Bearer cap');
  const first = JSON.parse(calls[0].init.body);
  assert.deepEqual(first.allowed_mentions, { parse: [] });
  assert.ok(first.message_reference, 'first part replies');
  assert.equal(JSON.parse(calls[1].init.body).message_reference, undefined, 'later parts do not');

  const read = await tools.read_messages.run({ channel_id: CH, limit: 500 });
  assert.match(calls[2].url, /limit=100$/, 'limit is capped');
  assert.deepEqual(read.map((m) => [m.author, m.content, m.bot]), [['amy', 'older', true], ['bob', 'newer', false]]);

  await assert.rejects(tools.send_message.run({ channel_id: '../x', content: 'hi' }), /Discord id/);
  await assert.rejects(mcp.tools(mcp.client({}, fetchImpl))[0].run({ channel_id: CH, content: 'hi' }), /not connected/);
});
