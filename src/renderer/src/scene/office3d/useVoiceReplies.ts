// Spoken agent replies for the 3D office (ported from Claw3D useVoiceReplyPlayback).
// Audio is made in main (window.cth.officeVoiceSpeak) and played here from a blob: URL.
// One module-level player so the office, the settings panel and the phone booth share
// one queue and never talk over each other.
import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useStore } from '@/store/store';
import { DEFAULT_VOICE_PREFS, type VoicePrefs } from '@shared/office/voiceCatalog';
import { pickNewReplies, speakableText, type ReplySource } from '@shared/office/voiceText';

const MAX_QUEUE = 4; // drop new lines instead of falling minutes behind a busy office

let prefs: VoicePrefs | null = null; // null until loaded from main
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

const queue: string[] = [];
let draining = false;
let generation = 0;
let stopCurrent: (() => void) | null = null;

/** Called by the settings panel after it saves, so the office picks the change up at once. */
export function setVoicePrefsCache(next: VoicePrefs): void {
  prefs = next;
  if (!next.enabled) stopVoice();
  listeners.forEach((l) => l());
}

function loadPrefs(): Promise<void> {
  loading ??= window.cth
    .officeVoiceStatus()
    .then(({ enabled, voiceId, speed }) => setVoicePrefsCache({ enabled, voiceId, speed }))
    .catch(() => setVoicePrefsCache({ ...DEFAULT_VOICE_PREFS }));
  return loading;
}

function play(audio: Uint8Array, mime: string, gen: number): Promise<void> {
  if (gen !== generation) return Promise.resolve();
  const url = URL.createObjectURL(new Blob([audio as BlobPart], { type: mime }));
  const el = new Audio(url);
  return new Promise<void>((resolve) => {
    const done = () => {
      el.onended = el.onerror = null;
      el.pause();
      URL.revokeObjectURL(url);
      if (stopCurrent === done) stopCurrent = null;
      resolve();
    };
    stopCurrent = done;
    el.onended = done;
    el.onerror = done;
    el.play().catch(done);
  });
}

/** Synthesize and play one line. Resolves with an error message, or null on success. */
async function sayNow(text: string, voiceId?: string, speed?: number): Promise<string | null> {
  const gen = generation;
  const res = await window.cth.officeVoiceSpeak({ text, voiceId: voiceId ?? prefs?.voiceId, speed: speed ?? prefs?.speed });
  if (!res.ok) return res.error;
  await play(res.audio, res.mime, gen);
  return null;
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    for (let text = queue.shift(); text; text = queue.shift()) {
      const error = await sayNow(text).catch(() => 'Voice playback failed.');
      if (error) console.warn('[office voice]', error);
    }
  } finally {
    draining = false;
  }
}

/** Queue a line to be spoken (trimmed to its first two sentences). Does nothing while
 *  voice replies are off, so no text leaves the machine unless the user turned it on.
 *  Usable by the phone booth: `onPhoneCallSpeak={({ scenario }) => speak(scenario.spokenText)}`. */
export function speak(text: string | null | undefined): void {
  if (!prefs?.enabled) return;
  const line = speakableText(text);
  if (!line || queue.length >= MAX_QUEUE) return;
  queue.push(line);
  void drain();
}

/** Stop what's playing and forget anything queued. */
export function stopVoice(): void {
  generation += 1;
  queue.length = 0;
  stopCurrent?.();
}

/** Settings-panel preview: interrupts the queue and plays right away, even while replies are off. */
export async function previewVoice(text: string, voiceId: string, speed: number): Promise<string | null> {
  stopVoice();
  try {
    return await sayNow(speakableText(text), voiceId, speed);
  } catch {
    return 'Voice playback failed.';
  }
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => void listeners.delete(l);
};
const snapshot = () => prefs;

/** Speaks each agent's new latest reply while voice replies are on. Returns the saved
 *  prefs (for RetroOffice3D's voiceReplies* props) and `speak` for the phone booth. */
export function useVoiceReplies() {
  const current = useSyncExternalStore(subscribe, snapshot);
  const seenRef = useRef<ReturnType<typeof pickNewReplies>['seen'] | null>(null);
  const enabled = !!current?.enabled;

  useEffect(() => {
    void loadPrefs();
    return () => stopVoice();
  }, []);

  // A store subscription, not a selector: re-rendering the office on every
  // agent update just to look for new replies was the main cost.
  useEffect(() => {
    const check = (agents: readonly ReplySource[]) => {
      const { seen, fresh } = pickNewReplies(seenRef.current, agents);
      seenRef.current = seen; // tracked even while off, so turning voice on never replays old text
      if (enabled) fresh.forEach(speak);
    };
    check(useStore.getState().agents);
    return useStore.subscribe((s, prev) => { if (s.agents !== prev.agents) check(s.agents); });
  }, [enabled]);

  return {
    voiceRepliesLoaded: current !== null,
    voiceRepliesEnabled: enabled,
    voiceRepliesVoiceId: current?.voiceId ?? DEFAULT_VOICE_PREFS.voiceId,
    voiceRepliesSpeed: current?.speed ?? DEFAULT_VOICE_PREFS.speed,
    speak
  };
}
