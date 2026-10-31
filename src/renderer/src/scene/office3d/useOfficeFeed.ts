import { useEffect, useRef, useState } from 'react';
import type { Agent } from '@/store/store';
import type { OfficeCleaningCue } from '@/lib/office/janitorReset';

// Feeds the ported Claw3D office from DevLabs agent state:
//  - feed events → reply speech bubbles (5.5–12 s, sized to the text) and the
//    roster's emoji reactions (💬 reply, 💻 started working, ☕ went idle);
//  - cleaning cues → janitors sweep the floor when an agent restarts its
//    terminal or clears its context.

export type OfficeFeedEvent = {
  id: string;
  name: string;
  text: string;
  ts: number;
  kind?: 'status' | 'reply';
};

const MAX_EVENTS = 6;
const CUE_TTL_MS = 5 * 60_000;
const BUSY = new Set(['working', 'thinking', 'compacting', 'looping']);

interface Seen {
  busy: boolean;
  replyTs?: number;
  generation: number;
  context?: number;
}

export function useOfficeFeed(agents: readonly Agent[]): {
  feedEvents: OfficeFeedEvent[];
  cleaningCues: OfficeCleaningCue[];
} {
  const [feedEvents, setFeedEvents] = useState<OfficeFeedEvent[]>([]);
  const [cleaningCues, setCleaningCues] = useState<OfficeCleaningCue[]>([]);
  const seenRef = useRef<Map<string, Seen>>(new Map());

  useEffect(() => {
    const now = Date.now();
    const events: OfficeFeedEvent[] = [];
    const cues: OfficeCleaningCue[] = [];
    for (const a of agents) {
      const busy = BUSY.has(a.status);
      const generation = a.terminalGeneration ?? 0;
      const prev = seenRef.current.get(a.id);
      seenRef.current.set(a.id, { busy, replyTs: a.recentTextTs, generation, context: a.contextTokens });
      // First sighting only records a baseline, so mounting the office never
      // replays old replies or sends a janitor.
      if (!prev) continue;
      if (busy !== prev.busy) {
        events.push({ id: a.id, name: a.name, text: busy ? 'started working' : 'went idle', ts: now, kind: 'status' });
      }
      const reply = a.recentAssistantText?.trim();
      if (reply && a.recentTextTs && a.recentTextTs !== prev.replyTs) {
        events.push({ id: a.id, name: a.name, text: reply, ts: a.recentTextTs, kind: 'reply' });
      }
      const cleared = (prev.context ?? 0) > 0 && a.contextTokens === 0;
      if (generation > prev.generation || cleared) {
        cues.push({ id: `${a.id}:${now}`, agentId: a.id, agentName: a.name, ts: now });
      }
    }
    if (events.length) {
      // Newest first: the office reacts to feedEvents[0].
      setFeedEvents((cur) => [...events.sort((x, y) => y.ts - x.ts), ...cur].slice(0, MAX_EVENTS));
    }
    if (cues.length) {
      setCleaningCues((cur) => [...cur.filter((c) => now - c.ts < CUE_TTL_MS), ...cues]);
    }
  }, [agents]);

  // Hive messages are the real "talking" signal for terminal agents: whoever
  // sends one gets a bubble with its subject.
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  useEffect(() => {
    const off = window.cth?.onHiveMessage?.((e) => {
      const sender = agentsRef.current.find((a) => a.id === e.from);
      const text = e.subject?.trim();
      if (!sender || !text) return;
      const event: OfficeFeedEvent = { id: sender.id, name: sender.name, text, ts: Date.now(), kind: 'reply' };
      setFeedEvents((cur) => [event, ...cur].slice(0, MAX_EVENTS));
    });
    return () => off?.();
  }, []);

  return { feedEvents, cleaningCues };
}
