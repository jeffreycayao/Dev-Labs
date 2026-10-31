// Spotify jukebox (ported from Claw3D's soundclaw): pure helpers for the PKCE
// sign-in and the Web API responses. No Electron here so tests can load it.
import { createHash } from 'node:crypto';

/** Fixed so the user can register the exact redirect URI in their Spotify app. */
export const SPOTIFY_LOOPBACK_PORT = 43821;
export const SPOTIFY_REDIRECT_URI = `http://127.0.0.1:${SPOTIFY_LOOPBACK_PORT}/callback`;
export const SPOTIFY_SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing'
].join(' ');

export interface SpotifyTrack {
  id: string;
  name: string;
  uri: string;
  durationMs: number;
  artists: string[];
  album: string;
}

export interface SpotifyPlayback {
  isPlaying: boolean;
  progressMs: number;
  deviceName: string | null;
  track: SpotifyTrack | null;
}

export interface SpotifyTokens {
  accessToken: string;
  refreshToken: string;
  /** Epoch ms. */
  expiresAt: number;
}

/** Spotify client IDs are 32 hex characters. */
export function isValidClientId(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{32}$/i.test(v);
}

const URI_RE = /^spotify:(track|album|playlist|artist|episode|show):[A-Za-z0-9]{22}$/;
export function spotifyUriKind(v: unknown): string | null {
  const m = typeof v === 'string' ? URI_RE.exec(v) : null;
  return m ? m[1] : null;
}

/** RFC 7636 S256: base64url(sha256(verifier)). */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}

export function buildAuthorizeUrl(clientId: string, state: string, challenge: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: SPOTIFY_REDIRECT_URI,
    state,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SPOTIFY_SCOPES
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

/** Reads the loopback callback. Anything but a matching state is refused. */
export function parseCallback(
  reqUrl: string,
  expectedState: string
): { code: string } | { error: string } | null {
  const url = new URL(reqUrl, 'http://127.0.0.1');
  if (url.pathname !== '/callback') return null;
  if (!expectedState || url.searchParams.get('state') !== expectedState) {
    return { error: 'The Spotify sign-in did not match. Try connecting again.' };
  }
  const err = url.searchParams.get('error');
  if (err) return { error: err === 'access_denied' ? 'You declined the Spotify sign-in.' : `Spotify sign-in failed (${err}).` };
  const code = url.searchParams.get('code');
  return code ? { code } : { error: 'Spotify did not send a sign-in code. Try again.' };
}

/** Token endpoint JSON -> stored tokens. A refresh may omit refresh_token: keep the old one. */
export function parseTokenResponse(json: unknown, now: number, prevRefresh = ''): SpotifyTokens {
  const j = (json ?? {}) as Record<string, unknown>;
  const accessToken = typeof j.access_token === 'string' ? j.access_token : '';
  const refreshToken = typeof j.refresh_token === 'string' && j.refresh_token ? j.refresh_token : prevRefresh;
  const expiresIn = typeof j.expires_in === 'number' && j.expires_in > 0 ? j.expires_in : 3600;
  if (!accessToken || !refreshToken) throw new Error('Spotify returned an incomplete sign-in. Connect again.');
  return { accessToken, refreshToken, expiresAt: now + expiresIn * 1000 };
}

export function parseTrack(raw: unknown): SpotifyTrack | null {
  const r = raw as Record<string, any> | null;
  if (!r || typeof r.uri !== 'string' || typeof r.name !== 'string') return null;
  return {
    id: String(r.id ?? r.uri),
    name: r.name,
    uri: r.uri,
    durationMs: Number(r.duration_ms) || 0,
    artists: Array.isArray(r.artists) ? r.artists.map((a: any) => String(a?.name ?? '')).filter(Boolean) : [],
    album: typeof r.album?.name === 'string' ? r.album.name : ''
  };
}

export function parseSearch(json: unknown): SpotifyTrack[] {
  const items = (json as any)?.tracks?.items;
  return Array.isArray(items) ? items.map(parseTrack).filter((t): t is SpotifyTrack => !!t) : [];
}

/** GET /me/player body (null for 204 / nothing playing). */
export function parsePlayback(json: unknown): SpotifyPlayback | null {
  const j = json as Record<string, any> | null;
  if (!j || typeof j !== 'object') return null;
  return {
    isPlaying: j.is_playing === true,
    progressMs: Number(j.progress_ms) || 0,
    deviceName: typeof j.device?.name === 'string' ? j.device.name : null,
    track: parseTrack(j.item)
  };
}

/** Plain-language message for a failed Web API call. */
export function spotifyErrorMessage(status: number, body: unknown): string {
  const reason = String((body as any)?.error?.reason ?? '');
  if (status === 401) return 'Your Spotify sign-in expired. Connect again.';
  if (reason === 'NO_ACTIVE_DEVICE' || (status === 404 && /device/i.test(String((body as any)?.error?.message ?? '')))) {
    return 'No active Spotify device. Open Spotify on your computer or phone, play any song, then try again.';
  }
  if (reason === 'PREMIUM_REQUIRED') return 'Spotify Premium is needed to control playback from DevLabs.';
  if (status === 403) {
    return 'Spotify refused. Playback control needs Spotify Premium, and your account must be listed under Users in your Spotify app settings.';
  }
  if (status === 429) return 'Spotify is busy. Wait a few seconds and try again.';
  if (status === 404) return 'Spotify could not find that. Try another song.';
  return `Spotify returned an error (${status}). Try again in a moment.`;
}
