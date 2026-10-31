// Spoken agent replies via ElevenLabs (ported from Claw3D src/lib/voiceReply/provider.ts and
// src/app/api/office/voice/reply). The API key lives only in the safeStorage secret store;
// the renderer gets back audio bytes, never the key. The renderer CSP blocks external
// fetches, so every ElevenLabs call happens here.
import { app, ipcMain } from 'electron';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { setSecret, getSecret, hasSecret, deleteSecret } from '../integrations';
import {
  DEFAULT_VOICE_PREFS,
  MAX_SPEAK_CHARS,
  type VoicePrefs,
  type VoicePrefsResult,
  type VoiceSpeakResult,
  type VoiceStatus,
  cleanApiKey,
  clampSpeed,
  isVoiceId,
  normalizeVoicePrefs
} from '../../shared/office/voiceCatalog';

const SECRET_REF = 'office-voice-elevenlabs';
const TTS_URL = 'https://api.elevenlabs.io/v1/text-to-speech';
const MODEL_ID = 'eleven_flash_v2_5';
const TIMEOUT_MS = 20_000;

// Prefs live in their own small file so config.ts stays untouched.
const prefsPath = (): string => join(app.getPath('userData'), 'office-voice.json');

function readPrefs(): VoicePrefs {
  try {
    return normalizeVoicePrefs(JSON.parse(readFileSync(prefsPath(), 'utf8')));
  } catch {
    return { ...DEFAULT_VOICE_PREFS };
  }
}

function writePrefs(prefs: VoicePrefs): void {
  mkdirSync(dirname(prefsPath()), { recursive: true });
  writeFileSync(prefsPath(), JSON.stringify(prefs, null, 2), 'utf8');
}

const status = (): VoiceStatus => ({ ...readPrefs(), hasKey: hasSecret(SECRET_REF) });

async function speak(input: unknown): Promise<VoiceSpeakResult> {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  const text = typeof o.text === 'string' ? o.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) return { ok: false, error: 'Nothing to say.' };
  if (text.length > MAX_SPEAK_CHARS) return { ok: false, error: `That text is too long to speak (limit ${MAX_SPEAK_CHARS} characters).` };
  const key = getSecret(SECRET_REF);
  if (!key) return { ok: false, error: 'Add your ElevenLabs key in office settings first.' };
  const prefs = readPrefs();
  const voiceId = isVoiceId(o.voiceId) ? o.voiceId : prefs.voiceId;
  const speed = o.speed === undefined ? prefs.speed : clampSpeed(o.speed);
  let res: Response;
  try {
    res = await fetch(`${TTS_URL}/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { Accept: 'audio/mpeg', 'Content-Type': 'application/json', 'xi-api-key': key },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        voice_settings: { stability: 0.42, similarity_boost: 0.88, style: 0.2, use_speaker_boost: true, speed }
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (e) {
    const timedOut = e instanceof Error && e.name === 'TimeoutError';
    return { ok: false, error: timedOut ? 'ElevenLabs took too long to answer. Try again.' : "Couldn't reach ElevenLabs. Check your internet connection." };
  }
  if (!res.ok) {
    // Vendor error bodies are not echoed: they can be long and aren't written for users.
    if (res.status === 401 || res.status === 403) return { ok: false, error: 'ElevenLabs rejected the key. Check it in office settings.' };
    if (res.status === 429) return { ok: false, error: 'ElevenLabs limit reached. Wait a moment or check your plan.' };
    return { ok: false, error: `ElevenLabs couldn't make the audio (error ${res.status}). Try again later.` };
  }
  try {
    const audio = new Uint8Array(await res.arrayBuffer());
    return { ok: true, audio, mime: res.headers.get('content-type') || 'audio/mpeg' };
  } catch {
    return { ok: false, error: 'The audio download was interrupted. Try again.' };
  }
}

export function registerVoiceReplyIpc(): void {
  ipcMain.handle('office:voice:status', () => status());
  ipcMain.handle('office:voice:setKey', (_e, key: unknown) => {
    const clean = cleanApiKey(key);
    if (!clean) return { ok: false, error: "That doesn't look like an ElevenLabs key. Copy it again from your ElevenLabs profile." };
    return setSecret(SECRET_REF, clean);
  });
  ipcMain.handle('office:voice:clearKey', () => {
    deleteSecret(SECRET_REF);
    return { ok: true };
  });
  ipcMain.handle('office:voice:setPrefs', (_e, patch: unknown): VoicePrefsResult => {
    try {
      writePrefs(normalizeVoicePrefs(patch, readPrefs()));
      return { ok: true, status: status() };
    } catch {
      return { ok: false, error: "Couldn't save voice settings. Check that the app can write to its data folder." };
    }
  });
  ipcMain.handle('office:voice:speak', (_e, req: unknown) => speak(req));
}
