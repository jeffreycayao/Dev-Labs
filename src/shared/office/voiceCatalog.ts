// ElevenLabs voices + spoken-reply preferences for the 3D office (ported from Claw3D
// src/lib/voiceReply/catalog.ts). Pure: shared by main (validation) and renderer (UI).

export type VoiceOption = { id: string; label: string; description: string };

export const DEFAULT_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'; // Rachel

export const VOICE_CATALOG: VoiceOption[] = [
  { id: DEFAULT_VOICE_ID, label: 'Rachel', description: 'Balanced and conversational.' },
  { id: 'EXAVITQu4vr4xnSDxMaL', label: 'Bella', description: 'Warm and friendly.' },
  { id: 'MF3mGyEYCl7XYWbV9V6O', label: 'Elli', description: 'Clear and upbeat.' },
  { id: 'ErXwobaYiN019PkySvjV', label: 'Antoni', description: 'Calm and professional.' },
  { id: 'TxGEqnHWrfWFTfGW9XjX', label: 'Josh', description: 'Steady and confident.' },
  { id: 'pNInz6obpgDQGcFmaJgB', label: 'Adam', description: 'Deep and authoritative.' }
];

export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.2;
/** Longest text main will send to ElevenLabs in one request (cost + latency cap). */
export const MAX_SPEAK_CHARS = 1000;

export type VoicePrefs = { enabled: boolean; voiceId: string; speed: number };
export type VoiceStatus = VoicePrefs & { hasKey: boolean };
export type VoicePrefsResult = { ok: true; status: VoiceStatus } | { ok: false; error: string };
export type VoiceSpeakResult = { ok: true; audio: Uint8Array; mime: string } | { ok: false; error: string };
export const DEFAULT_VOICE_PREFS: VoicePrefs = { enabled: false, voiceId: DEFAULT_VOICE_ID, speed: 1 };

/** ElevenLabs voice ids are short alphanumeric strings; anything else is rejected
 *  because the id goes into the request URL. */
export function isVoiceId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9]{8,64}$/.test(value);
}

export function clampSpeed(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
  return Math.min(MAX_SPEED, Math.max(MIN_SPEED, value));
}

/** Coerce untrusted input (IPC payload or a hand-edited prefs file) into valid prefs. */
export function normalizeVoicePrefs(input: unknown, base: VoicePrefs = DEFAULT_VOICE_PREFS): VoicePrefs {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    enabled: typeof o.enabled === 'boolean' ? o.enabled : base.enabled,
    voiceId: isVoiceId(o.voiceId) ? o.voiceId : base.voiceId,
    speed: o.speed === undefined ? base.speed : clampSpeed(o.speed)
  };
}

/** Light shape check for a pasted ElevenLabs key. Returns the trimmed key or null. */
export function cleanApiKey(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const key = value.trim();
  return /^[A-Za-z0-9_\-]{20,200}$/.test(key) ? key : null;
}
