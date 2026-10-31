import { useCallback, useEffect, useRef, useState } from 'react';
import type { StandupMeeting } from '@/lib/office/standup/types';

// Port of Claw3D's useOfficeStandupController, kept in the renderer: no schedule,
// no server store. Click the meeting table → agents walk to the seats → each
// speaks for SPEAKER_MS → done. The board stays readable until the next standup.
const SPEAKER_MS = 8000;
/** Start talking anyway if someone can't reach a seat. */
const GATHER_TIMEOUT_MS = 60_000;

export type StandupAgent = { id: string; name: string; cwd?: string };

const startSpeaker = (m: StandupMeeting, speakerId: string | null): StandupMeeting => {
  const now = new Date().toISOString();
  return {
    ...m,
    phase: speakerId ? 'in_progress' : 'complete',
    currentSpeakerAgentId: speakerId,
    speakerStartedAt: speakerId ? now : null,
    updatedAt: now,
    completedAt: speakerId ? null : now
  };
};

const isActive = (m: StandupMeeting | null) => m?.phase === 'gathering' || m?.phase === 'in_progress';

/** Standup props for <RetroOffice3D>, for the agents on the current floor. */
export function useOfficeStandup(agents: StandupAgent[]) {
  const [meeting, setMeeting] = useState<StandupMeeting | null>(null);
  const agentsRef = useRef(agents);
  agentsRef.current = agents;
  const meetingRef = useRef(meeting);
  meetingRef.current = meeting;
  const startingRef = useRef(false);

  const onStandupStartRequested = useCallback(() => {
    if (startingRef.current || isActive(meetingRef.current)) return;
    const list = agentsRef.current.map(({ id, name, cwd }) => ({ id, name, cwd }));
    if (list.length === 0) return;
    startingRef.current = true;
    void (async () => {
      try {
        const cards = await window.cth.standupCards(list, await window.cth.hiveTasks());
        if (cards.length === 0) return;
        const now = new Date().toISOString();
        setMeeting({
          id: `standup-${Date.now()}`,
          trigger: 'manual',
          phase: 'gathering',
          scheduledFor: null,
          startedAt: now,
          updatedAt: now,
          completedAt: null,
          currentSpeakerAgentId: null,
          speakerStartedAt: null,
          speakerDurationMs: SPEAKER_MS,
          participantOrder: cards.map((c) => c.agentId),
          arrivedAgentIds: [],
          cards
        });
      } catch (err) {
        console.error('[standup] could not start:', err);
      } finally {
        startingRef.current = false;
      }
    })();
  }, []);

  const onStandupArrivalsChange = useCallback((arrived: string[]) => {
    setMeeting((m) => {
      if (!m || m.phase !== 'gathering') return m;
      const next = { ...m, arrivedAgentIds: arrived, updatedAt: new Date().toISOString() };
      return m.participantOrder.every((id) => arrived.includes(id))
        ? startSpeaker(next, m.participantOrder[0] ?? null)
        : next;
    });
  }, []);

  const meetingId = meeting?.id;
  const phase = meeting?.phase;
  const speaker = meeting?.currentSpeakerAgentId ?? null;

  useEffect(() => {
    if (phase !== 'gathering') return;
    const timer = window.setTimeout(() => {
      setMeeting((m) =>
        m && m.id === meetingId && m.phase === 'gathering'
          ? startSpeaker({ ...m, arrivedAgentIds: m.participantOrder }, m.participantOrder[0] ?? null)
          : m
      );
    }, GATHER_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [meetingId, phase]);

  useEffect(() => {
    if (phase !== 'in_progress' || !speaker) return;
    const timer = window.setTimeout(() => {
      setMeeting((m) => {
        if (!m || m.id !== meetingId || m.currentSpeakerAgentId !== speaker) return m;
        return startSpeaker(m, m.participantOrder[m.participantOrder.indexOf(speaker) + 1] ?? null);
      });
    }, SPEAKER_MS);
    return () => window.clearTimeout(timer);
  }, [meetingId, phase, speaker]);

  return {
    standupMeeting: meeting,
    standupAutoOpenBoard: true,
    onStandupStartRequested,
    onStandupArrivalsChange
  };
}
