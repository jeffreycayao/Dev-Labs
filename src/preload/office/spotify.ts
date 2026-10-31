// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
// Spotify jukebox: every call runs in main; tokens never reach the renderer.
import { ipcRenderer } from 'electron';
import type { SpotifyPlayback, SpotifyTrack } from '../../shared/office/spotify';
export type { SpotifyPlayback, SpotifyTrack } from '../../shared/office/spotify';

export type SpotifyResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };
export interface SpotifyStatus { hasClientId: boolean; connected: boolean; redirectUri: string }

export const spotifyApi = {
  spotifyStatus: (): Promise<SpotifyStatus> => ipcRenderer.invoke('spotify:status'),
  spotifySetClientId: (clientId: string): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:setClientId', clientId),
  /** Opens the system browser; resolves once the user signs in, declines or it times out (3 min). */
  spotifyConnect: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:connect'),
  spotifyDisconnect: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:disconnect'),
  spotifySearch: (query: string): Promise<SpotifyResult<{ tracks: SpotifyTrack[] }>> => ipcRenderer.invoke('spotify:search', query),
  /** No uri resumes. A track uri plays it; an album/playlist/artist uri plays it as a context. */
  spotifyPlay: (uri?: string): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:play', uri),
  spotifyPause: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:pause'),
  spotifyNext: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:next'),
  spotifyPrevious: (): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:previous'),
  spotifyQueue: (uri: string): Promise<SpotifyResult> => ipcRenderer.invoke('spotify:queue', uri),
  /** playback is null when nothing is playing on any device. */
  spotifyPlayback: (): Promise<SpotifyResult<{ playback: SpotifyPlayback | null }>> => ipcRenderer.invoke('spotify:playback')
};
