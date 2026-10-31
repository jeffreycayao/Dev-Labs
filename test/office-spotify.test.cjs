'use strict';

// Office jukebox: PKCE sign-in helpers and Spotify Web API parsing.

const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');

const sp = loadTs('src/shared/office/spotify.ts');

test('PKCE challenge is unpadded base64url(sha256(verifier))', () => {
  const v = 'verifier-~._0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJ';
  const expected = require('node:crypto').createHash('sha256').update(v).digest('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  assert.equal(sp.pkceChallenge(v), expected);
  assert.match(sp.pkceChallenge(v), /^[A-Za-z0-9_-]{43}$/);
});

test('authorize URL uses the loopback redirect, S256 and only playback scopes', () => {
  const url = new URL(sp.buildAuthorizeUrl('a'.repeat(32), 'st', 'ch'));
  assert.equal(url.origin + url.pathname, 'https://accounts.spotify.com/authorize');
  assert.equal(url.searchParams.get('redirect_uri'), 'http://127.0.0.1:43821/callback');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('code_challenge'), 'ch');
  assert.equal(url.searchParams.get('state'), 'st');
  assert.equal(url.searchParams.get('response_type'), 'code');
  assert.doesNotMatch(url.searchParams.get('scope'), /playlist|streaming|email/);
});

test('client id and uri validation', () => {
  assert.equal(sp.isValidClientId('0123456789abcdef0123456789ABCDEF'), true);
  assert.equal(sp.isValidClientId('short'), false);
  assert.equal(sp.isValidClientId(42), false);
  assert.equal(sp.spotifyUriKind('spotify:track:4uLU6hMCjMI75M1A2tKUQC'), 'track');
  assert.equal(sp.spotifyUriKind('spotify:playlist:37i9dQZF1DXcBWIGoYBM5M'), 'playlist');
  assert.equal(sp.spotifyUriKind('https://evil.example/x'), null);
  assert.equal(sp.spotifyUriKind('spotify:track:abc'), null);
});

test('callback: state must match, errors are plain, other paths ignored', () => {
  assert.equal(sp.parseCallback('/favicon.ico', 's'), null);
  assert.deepEqual(sp.parseCallback('/callback?code=abc&state=s', 's'), { code: 'abc' });
  assert.ok('error' in sp.parseCallback('/callback?code=abc&state=x', 's'));
  assert.ok('error' in sp.parseCallback('/callback?code=abc', ''));
  assert.match(sp.parseCallback('/callback?error=access_denied&state=s', 's').error, /declined/);
});

test('token response: expiry computed, refresh token kept when omitted, incomplete rejected', () => {
  const t = sp.parseTokenResponse({ access_token: 'a', refresh_token: 'r', expires_in: 3600 }, 1000);
  assert.deepEqual(t, { accessToken: 'a', refreshToken: 'r', expiresAt: 1000 + 3600_000 });
  assert.equal(sp.parseTokenResponse({ access_token: 'b', expires_in: 10 }, 0, 'old').refreshToken, 'old');
  assert.throws(() => sp.parseTokenResponse({ access_token: 'b' }, 0));
  assert.throws(() => sp.parseTokenResponse(null, 0, 'old'));
});

test('search and playback parsing', () => {
  const raw = {
    id: 'id1', name: 'Song', uri: 'spotify:track:4uLU6hMCjMI75M1A2tKUQC', duration_ms: 1000,
    artists: [{ name: 'A' }, { name: 'B' }], album: { name: 'Al', images: [] }
  };
  assert.deepEqual(sp.parseSearch({ tracks: { items: [raw, null, { bad: 1 }] } }), [
    { id: 'id1', name: 'Song', uri: raw.uri, durationMs: 1000, artists: ['A', 'B'], album: 'Al' }
  ]);
  assert.deepEqual(sp.parseSearch({}), []);
  assert.equal(sp.parsePlayback(null), null);
  const p = sp.parsePlayback({ is_playing: true, progress_ms: 5, device: { name: 'Laptop' }, item: raw });
  assert.equal(p.isPlaying, true);
  assert.equal(p.deviceName, 'Laptop');
  assert.equal(p.track.name, 'Song');
  assert.equal(sp.parsePlayback({ is_playing: false, item: null }).track, null);
});

test('errors: Premium and no-device are explained in plain words', () => {
  assert.match(sp.spotifyErrorMessage(403, { error: { reason: 'PREMIUM_REQUIRED' } }), /Premium/);
  assert.match(sp.spotifyErrorMessage(403, null), /Premium/);
  assert.match(sp.spotifyErrorMessage(404, { error: { reason: 'NO_ACTIVE_DEVICE' } }), /No active Spotify device/);
  assert.match(sp.spotifyErrorMessage(404, { error: { message: 'Player command failed: No active device found' } }), /No active/);
  assert.match(sp.spotifyErrorMessage(401, null), /Connect again/);
  assert.match(sp.spotifyErrorMessage(429, null), /Wait/);
});
