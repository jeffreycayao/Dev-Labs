import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Agent } from '@/store/store';
import type { OfficeAnimationState } from '@/lib/office/eventTriggers';
import type { OfficeCleaningCue } from '@/lib/office/janitorReset';
import type { MockPhoneCallScenario } from '@/lib/office/call/types';
import type { MockTextMessageScenario } from '@/lib/office/text/types';
import { buildMockPhoneCallScenario } from '@/lib/office/call/mock';
import { buildMockTextMessageScenario } from '@/lib/office/text/mock';
import { resolveOfficeIntentSnapshot } from '@shared/office/deskDirectives';
import { isTestCommand } from '@shared/office/officeActivity';

// Where agents walk, from real DevLabs signals (Claw3D drove this from chat):
//  - the last prompt you sent an agent, read by Claw3D's directive parser:
//    "go to your desk" / "go to the gym" / "review the PRs" (server room) /
//    "write tests" (QA lab) / "call Maya and tell her …" (phone booth) /
//    "text Joseph saying …" (SMS booth) / "standup" (meeting table);
//  - an agent running a test command (hook events) → QA lab for a minute;
//  - Spotify playing on the jukebox → everyone on the floor dances.

const GYM_MS = 60_000;
const QA_FROM_TOOL_MS = 60_000;

type Holds = Record<string, boolean>;
type Untils = Record<string, number>;

export interface OfficeActivity {
  animationState: OfficeAnimationState | undefined;
  phoneBoothAgentId: string | null;
  phoneCallScenario: MockPhoneCallScenario | null;
  smsBoothAgentId: string | null;
  textMessageScenario: MockTextMessageScenario | null;
  onPhoneCallComplete: (agentId: string) => void;
  onTextMessageComplete: (agentId: string) => void;
}

export function useOfficeActivity(
  agents: readonly Agent[],
  opts: {
    cleaningCues: OfficeCleaningCue[];
    jukeboxPlaying: boolean;
    onStandupRequested?: () => void;
    voiceAvailable: boolean;
  }
): OfficeActivity {
  const [desk, setDesk] = useState<Holds>({});
  const [github, setGithub] = useState<Holds>({});
  const [qa, setQa] = useState<Holds>({});
  const [gymUntil, setGymUntil] = useState<Untils>({});
  const [qaUntil, setQaUntil] = useState<Untils>({});
  const [calls, setCalls] = useState<Record<string, MockPhoneCallScenario>>({});
  const [texts, setTexts] = useState<Record<string, MockTextMessageScenario>>({});
  const [clock, setClock] = useState(() => Date.now());
  const gymUntilRef = useRef(gymUntil);
  gymUntilRef.current = gymUntil;
  const qaUntilRef = useRef(qaUntil);
  qaUntilRef.current = qaUntil;
  const clockRef = useRef(clock);
  clockRef.current = clock;
  const jukeboxRef = useRef(opts.jukeboxPlaying);
  jukeboxRef.current = opts.jukeboxPlaying;
  const promptRef = useRef<Map<string, string | undefined>>(new Map());
  const optsRef = useRef(opts);
  optsRef.current = opts;

  // Prompt directives. First sighting is a baseline: mounting never replays.
  useEffect(() => {
    const now = Date.now();
    for (const a of agents) {
      const seen = promptRef.current.has(a.id);
      const prev = promptRef.current.get(a.id);
      promptRef.current.set(a.id, a.lastPrompt);
      if (!seen || !a.lastPrompt || a.lastPrompt === prev) continue;
      const intent = resolveOfficeIntentSnapshot(a.lastPrompt);
      const set = (fn: typeof setDesk, on: boolean) => fn((cur) => ({ ...cur, [a.id]: on }));
      if (intent.desk) set(setDesk, intent.desk === 'desk');
      if (intent.github) set(setGithub, intent.github === 'github');
      if (intent.qa) set(setQa, intent.qa === 'qa_lab');
      if (intent.gym) {
        setGymUntil((cur) => ({ ...cur, [a.id]: intent.gym?.directive === 'gym' ? now + GYM_MS : 0 }));
      }
      if (intent.standup && a.isGod) optsRef.current.onStandupRequested?.();
      if (intent.call?.phase === 'ready_to_call') {
        const scenario = buildMockPhoneCallScenario({
          callee: intent.call.callee,
          message: intent.call.message,
          voiceAvailable: optsRef.current.voiceAvailable
        });
        setCalls((cur) => ({ ...cur, [a.id]: scenario }));
      }
      if (intent.text?.phase === 'ready_to_send') {
        const scenario = buildMockTextMessageScenario({ recipient: intent.text.recipient, message: intent.text.message });
        setTexts((cur) => ({ ...cur, [a.id]: scenario }));
      }
    }
  }, [agents]);

  // An agent running tests walks to the QA lab for a minute.
  useEffect(() => {
    const off = window.cth?.onHiveHookEvent?.((e) => {
      if (!e.agentId || e.tool !== 'Bash' || !isTestCommand(e.detail)) return;
      const id = e.agentId;
      setQaUntil((cur) => ({ ...cur, [id]: Date.now() + QA_FROM_TOOL_MS }));
    });
    return () => off?.();
  }, []);

  // Timed holds expire on a slow tick.
  useEffect(() => {
    // Only tick while a timed hold is counting down; an idle office stays still.
    const timer = window.setInterval(() => {
      const now = Date.now();
      // Compare with the last tick, so one more tick runs after a hold expires.
      const counting = [...Object.values(gymUntilRef.current), ...Object.values(qaUntilRef.current)].some((t) => t > clockRef.current);
      if (counting || jukeboxRef.current) setClock(now);
    }, 5000);
    return () => window.clearInterval(timer);
  }, []);

  const ids = useMemo(() => new Set(agents.map((a) => a.id)), [agents]);
  const pick = <T,>(rec: Record<string, T>, keep: (v: T) => boolean): Record<string, boolean> =>
    Object.fromEntries(Object.entries(rec).filter(([id, v]) => ids.has(id) && keep(v)).map(([id]) => [id, true]));

  const phoneBoothAgentId = Object.keys(calls).find((id) => ids.has(id)) ?? null;
  const smsBoothAgentId = Object.keys(texts).find((id) => ids.has(id)) ?? null;

  const animationState = useMemo(() => {
    const qaHold = { ...pick(qa, Boolean), ...pick(qaUntil, (t) => t > clock) };
    const dance = opts.jukeboxPlaying
      ? Object.fromEntries(agents.map((a) => [a.id, clock + 10_000]))
      : {};
    // Only the fields DevLabs drives; RetroOffice3D falls back per field for the rest.
    return {
      cleaningCues: opts.cleaningCues,
      deskHoldByAgentId: pick(desk, Boolean),
      githubHoldByAgentId: pick(github, Boolean),
      gymHoldByAgentId: pick(gymUntil, (t) => t > clock),
      qaHoldByAgentId: qaHold,
      phoneBoothHoldByAgentId: phoneBoothAgentId ? { [phoneBoothAgentId]: true } : {},
      smsBoothHoldByAgentId: smsBoothAgentId ? { [smsBoothAgentId]: true } : {},
      danceUntilByAgentId: dance,
      jukeboxHoldByAgentId: opts.jukeboxPlaying ? { jukebox: true } : {}
    } as OfficeAnimationState;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agents, clock, desk, github, qa, qaUntil, gymUntil, opts.cleaningCues, opts.jukeboxPlaying, phoneBoothAgentId, smsBoothAgentId]);

  const drop = <T,>(fn: React.Dispatch<React.SetStateAction<Record<string, T>>>) => (agentId: string) =>
    fn((cur) => {
      const next = { ...cur };
      delete next[agentId];
      return next;
    });
  const onPhoneCallComplete = useCallback(drop(setCalls), []);
  const onTextMessageComplete = useCallback(drop(setTexts), []);

  return {
    animationState,
    phoneBoothAgentId,
    phoneCallScenario: phoneBoothAgentId ? calls[phoneBoothAgentId] : null,
    smsBoothAgentId,
    textMessageScenario: smsBoothAgentId ? texts[smsBoothAgentId] : null,
    onPhoneCallComplete,
    onTextMessageComplete
  };
}
