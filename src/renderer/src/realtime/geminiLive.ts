/**
 * Gemini Live voice driver — Ramon over Google's Live API (bidirectional WebSocket).
 *
 * session.ts owns the voice-loop state, persona, tools, mic gate and the floor /
 * completion injection; this module only speaks the Gemini wire protocol:
 *   • connect with a single-use EPHEMERAL token main minted (the AI Studio key
 *     never reaches the renderer), send `setup`, wait for `setupComplete`;
 *   • mic → 16 kHz 16-bit PCM → `realtimeInput.audio`;
 *   • `serverContent.modelTurn` 24 kHz PCM → gapless playback on our own
 *     AudioContext (routed to the picked speaker);
 *   • `serverContent.interrupted` (barge-in) → drop everything queued;
 *   • `toolCall` → run the SAME realtime FunctionTools the OpenAI path uses (so the
 *     main-process safety spine is unchanged) → `toolResponse`.
 */
import type { tool } from '@openai/agents-realtime';
import {
  GEMINI_INPUT_RATE,
  GEMINI_LIVE_WS_URL,
  GEMINI_OUTPUT_RATE,
  floatToPcm16,
  geminiErrorMessage,
  pcm16ToFloat,
  resampleLinear,
  toGeminiDeclarations
} from '@shared/geminiLive';

type RealtimeTool = ReturnType<typeof tool>;

export interface GeminiLiveHandle {
  close(): void;
  /** Add context the model absorbs without answering. */
  injectSilent(text: string): void;
  /** Add a turn the model answers out loud. */
  speak(text: string): void;
}

export interface GeminiLiveOptions {
  token: string;
  model: string;
  voice: string;
  instructions: string;
  tools: RealtimeTool[];
  stream: MediaStream;
  outputDeviceId: string | null;
  onSpeaking(): void;
  onIdle(): void;
  onToolStart(): void;
  onToolEnd(): void;
  onActivity(): void;
  /** One turn's `usageMetadata` (promptTokenCount / responseTokenCount / …). */
  onUsage(usage: Record<string, unknown>): void;
  onError(msg: string): void;
  /** The socket closed after setup (not via close()). */
  onClosed(reason: string): void;
}

function toBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
function fromBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Close codes/reasons Google uses for auth and quota failures → friendly text. */
function closeMessage(ev: CloseEvent): string {
  const reason = ev.reason || '';
  if (/quota|RESOURCE_EXHAUSTED/i.test(reason)) return geminiErrorMessage(429, reason);
  if (/API key|token|auth|PERMISSION_DENIED|UNAUTHENTICATED/i.test(reason) || ev.code === 1008)
    return geminiErrorMessage(403, reason);
  return reason ? `Gemini Live closed: ${reason}` : `Gemini Live connection closed (code ${ev.code})`;
}

export function openGeminiLive(o: GeminiLiveOptions): Promise<GeminiLiveHandle> {
  const toolsByName = new Map(o.tools.map((t) => [t.name, t]));
  const ws = new WebSocket(`${GEMINI_LIVE_WS_URL}?access_token=${encodeURIComponent(o.token)}`);
  let closedByUs = false;
  let ready = false;
  let turnUsage: Record<string, unknown> | null = null;
  let turnDone = false;
  let muted = false;
  // Gemini treats any clientContent as a cut-in: sent mid-answer it interrupts
  // Ramon and he starts over. Silent context waits here until his turn ends.
  let modelTurnOpen = false;
  let heldSilent: string[] = [];
  const sendSilent = (texts: string[]): void => {
    if (!texts.length) return;
    send({ clientContent: { turns: [{ role: 'user', parts: texts.map((text) => ({ text })) }], turnComplete: false } });
  };
  const flushSilent = (): void => {
    if (modelTurnOpen || muted) return;
    const texts = heldSilent;
    heldSilent = [];
    sendSilent(texts);
  };

  // ── playback (24 kHz) ─────────────────────────────────────────────────────
  const outCtx = new AudioContext({ sampleRate: GEMINI_OUTPUT_RATE });
  const sink = outCtx as AudioContext & { setSinkId?: (id: string) => Promise<void> };
  if (o.outputDeviceId && typeof sink.setSinkId === 'function') void sink.setSinkId(o.outputDeviceId).catch(() => {});
  let playHead = 0;
  const playing = new Set<AudioBufferSourceNode>();
  const play = (pcm: Uint8Array): void => {
    const samples = pcm16ToFloat(pcm);
    if (!samples.length) return;
    const buf = outCtx.createBuffer(1, samples.length, GEMINI_OUTPUT_RATE);
    buf.getChannelData(0).set(samples);
    const src = outCtx.createBufferSource();
    src.buffer = buf;
    src.connect(outCtx.destination);
    playHead = Math.max(playHead, outCtx.currentTime);
    src.start(playHead);
    playHead += buf.duration;
    playing.add(src);
    src.onended = () => {
      playing.delete(src);
      if (!playing.size) o.onIdle();
    };
    o.onSpeaking();
  };
  const flushPlayback = (): void => {
    for (const s of playing) {
      try { s.stop(); } catch { /* already stopped */ }
    }
    playing.clear();
    playHead = 0;
  };

  // ── mic capture (16 kHz) ──────────────────────────────────────────────────
  // shortcut: ScriptProcessorNode (deprecated) because the renderer CSP has no
  // worker-src for an AudioWorklet blob; move to a bundled worklet if it's removed.
  const inCtx = new AudioContext({ sampleRate: GEMINI_INPUT_RATE });
  const micSrc = inCtx.createMediaStreamSource(o.stream);
  const proc = inCtx.createScriptProcessor(2048, 1, 1);
  const silent = inCtx.createGain();
  silent.gain.value = 0;
  micSrc.connect(proc);
  proc.connect(silent);
  silent.connect(inCtx.destination);
  proc.onaudioprocess = (e) => {
    if (!ready || muted || ws.readyState !== WebSocket.OPEN) return;
    const frame = resampleLinear(e.inputBuffer.getChannelData(0), inCtx.sampleRate, GEMINI_INPUT_RATE);
    send({ realtimeInput: { audio: { data: toBase64(floatToPcm16(frame)), mimeType: `audio/pcm;rate=${GEMINI_INPUT_RATE}` } } });
  };

  function send(msg: unknown): void {
    if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }

  const teardown = (): void => {
    proc.onaudioprocess = null;
    try { micSrc.disconnect(); proc.disconnect(); silent.disconnect(); } catch { /* ignore */ }
    flushPlayback();
    void inCtx.close().catch(() => {});
    void outCtx.close().catch(() => {});
  };

  const runTools = async (calls: { id?: string; name?: string; args?: unknown }[]): Promise<void> => {
    // Same lifecycle as the OpenAI path: mic muted while a side effect runs.
    muted = true;
    o.onToolStart();
    const functionResponses = [];
    for (const c of calls) {
      const t = c.name ? toolsByName.get(c.name) : undefined;
      let result: string;
      try {
        result = t && 'invoke' in t
          ? String(await (t as { invoke: (ctx: never, input: string) => Promise<unknown> }).invoke({} as never, JSON.stringify(c.args ?? {})))
          : `Unknown tool ${c.name ?? ''}`;
      } catch (e) {
        result = `Tool failed: ${e instanceof Error ? e.message : String(e)}`;
      }
      functionResponses.push({ id: c.id, name: c.name, response: { result } });
    }
    send({ toolResponse: { functionResponses } });
    muted = false;
    o.onToolEnd();
    flushSilent();
  };

  const handle: GeminiLiveHandle = {
    close() {
      closedByUs = true;
      try { ws.close(1000, 'user'); } catch { /* ignore */ }
      teardown();
    },
    injectSilent(text) {
      heldSilent.push(text);
      flushSilent();
    },
    speak(text) {
      // Anything held rides along ahead of the spoken turn, in one message.
      const texts = [...heldSilent, text];
      heldSilent = [];
      modelTurnOpen = true;
      send({ clientContent: { turns: [{ role: 'user', parts: texts.map((t) => ({ text: t })) }], turnComplete: true } });
    }
  };

  return new Promise<GeminiLiveHandle>((resolve, reject) => {
    ws.onopen = () => {
      send({
        setup: {
          model: `models/${o.model}`,
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: o.voice } } }
          },
          systemInstruction: { parts: [{ text: o.instructions }] },
          tools: [{ functionDeclarations: toGeminiDeclarations(o.tools) }]
        }
      });
    };
    ws.onmessage = async (ev) => {
      let msg: Record<string, unknown>;
      try {
        const raw = typeof ev.data === 'string' ? ev.data : await (ev.data as Blob).text();
        msg = JSON.parse(raw) as Record<string, unknown>;
      } catch {
        return;
      }
      if (msg.setupComplete) {
        ready = true;
        resolve(handle);
        return;
      }
      const sc = msg.serverContent as
        | { modelTurn?: { parts?: { inlineData?: { data?: string } }[] }; interrupted?: boolean; turnComplete?: boolean }
        | undefined;
      if (sc) {
        // Barge-in: the user talked over Ramon — stop his audio right away.
        if (sc.interrupted) { flushPlayback(); o.onIdle(); }
        if (sc.modelTurn) modelTurnOpen = true;
        // A new turn's audio means the last turn's usage isn't coming: don't
        // let its stale turnDone bill this turn's first partial total.
        if (sc.modelTurn && !sc.turnComplete) turnDone = false;
        for (const p of sc.modelTurn?.parts ?? []) if (p.inlineData?.data) play(fromBase64(p.inlineData.data));
        if (sc.turnComplete || sc.interrupted) { modelTurnOpen = false; flushSilent(); }
        if (sc.turnComplete) { o.onActivity(); turnDone = true; }
      }
      // usageMetadata may ride several messages of one turn as a running total,
      // so keep only the latest and bill it once per turn (when the turn has
      // completed and usage has been seen, in either order).
      if (msg.usageMetadata && typeof msg.usageMetadata === 'object') turnUsage = msg.usageMetadata as Record<string, unknown>;
      if (turnDone && turnUsage) { o.onUsage(turnUsage); turnUsage = null; turnDone = false; }
      const tc = msg.toolCall as { functionCalls?: { id?: string; name?: string; args?: unknown }[] } | undefined;
      if (tc?.functionCalls?.length) void runTools(tc.functionCalls);
      if (msg.goAway) o.onError('Gemini Live session is ending soon (server goAway) — reconnect if it drops.');
    };
    ws.onerror = () => { /* the close event carries the reason */ };
    ws.onclose = (ev) => {
      teardown();
      if (!ready) { reject(new Error(closeMessage(ev))); return; }
      if (!closedByUs) o.onClosed(closeMessage(ev));
    };
  });
}
