// Office feature bridge (ported from Claw3D). Spread into window.cth in ../index.ts.
// Spoken agent replies: the ElevenLabs key goes in, never comes back out.
import { ipcRenderer } from 'electron';
import type { VoicePrefs, VoicePrefsResult, VoiceSpeakResult, VoiceStatus } from '../../shared/office/voiceCatalog';

export const voiceReplyApi = {
  /** Saved voice prefs plus whether a key is stored (the key itself is never returned). */
  officeVoiceStatus: (): Promise<VoiceStatus> => ipcRenderer.invoke('office:voice:status'),
  /** Store the ElevenLabs key encrypted in main. */
  officeVoiceSetKey: (key: string): Promise<{ ok: boolean; error?: string }> => ipcRenderer.invoke('office:voice:setKey', key),
  officeVoiceClearKey: (): Promise<{ ok: boolean }> => ipcRenderer.invoke('office:voice:clearKey'),
  officeVoiceSetPrefs: (patch: Partial<VoicePrefs>): Promise<VoicePrefsResult> => ipcRenderer.invoke('office:voice:setPrefs', patch),
  /** Synthesize speech in main; returns MP3 bytes to play from a blob: URL. */
  officeVoiceSpeak: (req: { text: string; voiceId?: string; speed?: number }): Promise<VoiceSpeakResult> =>
    ipcRenderer.invoke('office:voice:speak', req)
};
