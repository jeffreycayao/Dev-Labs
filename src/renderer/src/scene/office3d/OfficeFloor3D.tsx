import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Play, SkipBack, SkipForward, Square } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { useStore, type Agent } from '@/store/store';
import { accentByName } from '@/design/tokens';
import { RetroOffice3D } from '@/features/retro-office/RetroOffice3D';
import type { OfficeAgent } from '@/features/retro-office/core/types';
import { EditAgentModal } from '@/components/EditAgentModal';
import type { PickChatter } from '@/features/retro-office/systems/chatter';
import { pickExchange, pickSoloLine, type CafeteriaLines } from '@/scene/office/cafeteriaLines';
import { useFeatures } from '@/lib/useFeatures';
import { OfficeThemePanel } from './OfficeThemePanel';
import { featureOn } from '@shared/features';
import { useOfficeFeed, type OfficeFeedEvent } from './useOfficeFeed';
import { useOfficeStandup } from './useOfficeStandup';
import { useVoiceReplies } from './useVoiceReplies';
import { useOfficeActivity } from './useOfficeActivity';
import { useJukebox } from './useJukebox';
import { useOfficeMonitors } from './useOfficeMonitors';
import {
  AGENTS_PER_LEVEL, assignOfficeLevels, elevatorStops, levelDesksKey, levelKeyMoves, levelNamespace, moveAgentToLevel,
  parseOfficeLevels, removeOfficeLevel, type OfficeLevels
} from '@shared/officeLevels';
import { activityBubble } from '@shared/office/activityBubble';
import { BUSY_STATUSES } from '@shared/office/officeActivity';
import { agentStatusBadge } from '@/lib/avatars/statusBadge';
import { radio, useRadio } from '@/features/office/hooks/radioPlayer';
import '@/features/retro-office/retro-office.css';
import { configureTextBuilder } from 'troika-three-text';
import kenpixelFontUrl from 'three/examples/fonts/ttf/kenpixel.ttf?url';

// 3D labels (drei <Text>) use troika, which by default builds glyphs in a blob
// worker and fetches fallback fonts from a CDN. The app CSP blocks both, which
// left the furniture Suspense hanging, so build on the main thread from a
// bundled font instead.
configureTextBuilder({ useWorker: false, defaultFontURL: kenpixelFontUrl });

// Desk props from Claw3D, picked per agent id so an agent keeps its item.
const ITEMS = ['globe', 'books', 'coffee', 'palette', 'camera', 'waveform', 'shield', 'fire', 'plant', 'laptop'];

const itemFor = (id: string) => {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = id.charCodeAt(i) + ((hash << 5) - hash);
  return ITEMS[Math.abs(hash) % ITEMS.length];
};

const officeStatus = (a: Agent): OfficeAgent['status'] =>
  a.status === 'blocked' ? 'error' : BUSY_STATUSES.has(a.status) ? 'working' : 'idle';

const toOfficeAgent = (a: Agent): OfficeAgent => ({
  id: a.id,
  name: a.name,
  // Ramon's red plate already says "boss"; his long brief doesn't fit a tag.
  subtitle: a.isGod || a.id === 'god' ? null : a.description || null,
  status: officeStatus(a),
  color: `#${(accentByName[a.accent] ?? 0x888888).toString(16).padStart(6, '0')}`,
  item: itemFor(a.id),
  avatarProfile: a.avatarProfile ?? null,
  // What it is doing right now ("$ git push"), shown in its bubble while busy.
  activity: BUSY_STATUSES.has(a.status) ? activityBubble(a.action) || null : null
});

// The office only draws the ATM dashboard when this is non-null; no gatewayUrl,
// so it never tries Claw3D's layout-sync endpoint. Stable reference on purpose.
const ATM_ANALYTICS = {};

// Brand palette (design/tokens.css) for the inline-styled floor bar; the
// Tailwind-styled office screens get the same values from retro-office.css.
const BRAND = {
  lime: '#CDF252',
  key: '#E1642D',
  dark: '#181C17',
  panel: 'rgba(24, 28, 23, 0.94)',
  line: 'rgba(205, 242, 82, 0.28)',
  text: '#E6ECDD',
  muted: '#9AA38F'
} as const;

const isRamon = (a: Agent) => a.id === 'god' || !!a.isGod;

// Lines from the old 2D floor: office.gossip / office.suckUp / office.cheer.
// suckUp 0–1 need a task count we don't track here, so they're skipped.
const SUCKUP_LINES = [2, 3, 4, 5, 6];
const CHEER_COUNT = 7;

// Elevator ride between floors: the old office slides out, the new one is built
// off screen (the 3D scene remounts per floor), then it slides in.
const RIDE_LEAVE_MS = 220;
const RIDE_HOLD_MS = 240;
const RIDE_ARRIVE_MS = 320;
type Ride = { to: number; up: boolean; phase: 'leave' | 'hold' | 'arrive'; shown: number };

const rideStyle = (ride: Ride | null): CSSProperties => {
  if (!ride) return {};
  const dir = ride.up ? 'down' : 'up';
  if (ride.phase === 'leave') return { animation: `devlabs-floor-leave-${dir} ${RIDE_LEAVE_MS}ms ease-in forwards`, pointerEvents: 'none' };
  if (ride.phase === 'hold') return { transform: `translateY(${ride.up ? -100 : 100}%)`, pointerEvents: 'none' };
  return { animation: `devlabs-floor-arrive-${dir} ${RIDE_ARRIVE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)`, pointerEvents: 'none' };
};

const LS_LEVELS = 'devlabs.office3d.levels';
const lsDesks = levelDesksKey;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};

const writeJson = (key: string, value: unknown) => {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full or blocked: keep in memory */ }
};

/** The Claw3D retro office (React Three Fiber) driven by the DevLabs agent store.
 *  Agents are spread over building floors of up to 15 (Ramon always on floor 1).
 *  Each floor keeps its own furniture layout and desk assignments. */
export function OfficeFloor3D() {
  const { t, i18n } = useTranslation();
  const features = useFeatures();
  const selectedId = useStore((s) => s.selectedId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<OfficeLevels>(() => {
    try { return parseOfficeLevels(localStorage.getItem(LS_LEVELS)); } catch { return parseOfficeLevels(null); }
  });
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  // Office themes (floor bar → theme): the scene remounts (key bump) after an
  // import or undo, since it reads the saved layout only on mount.
  const [themeOpen, setThemeOpen] = useState(false);
  const [themeRev, setThemeRev] = useState(0);
  const themeAgents = useStore(useShallow((s) => s.agents.map((a) => ({ id: a.id, name: a.name }))));
  const [ride, setRide] = useState<Ride | null>(null);
  const rideTimers = useRef<number[]>([]);
  const stopRide = () => { rideTimers.current.forEach((id) => window.clearTimeout(id)); rideTimers.current = []; };
  useEffect(() => stopRide, []);
  const goToLevel = (to: number) => {
    stopRide();
    if (to === level) { setRide(null); return; }
    // The app zeroes animations under "reduce motion", so cut straight to the floor.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setRide(null); setLevel(to); return; }
    const at = (ms: number, fn: () => void) => { rideTimers.current.push(window.setTimeout(fn, ms)); };
    const stops = elevatorStops(level, to);
    setRide({ to, up: to > level, phase: 'leave', shown: level });
    stops.forEach((shown, i) => at(((i + 1) * (RIDE_LEAVE_MS + RIDE_HOLD_MS)) / stops.length, () => setRide((r) => r && { ...r, shown })));
    at(RIDE_LEAVE_MS, () => { setLevel(to); setRide((r) => r && { ...r, phase: 'hold' }); });
    at(RIDE_LEAVE_MS + RIDE_HOLD_MS, () => setRide((r) => r && { ...r, phase: 'arrive' }));
    at(RIDE_LEAVE_MS + RIDE_HOLD_MS + RIDE_ARRIVE_MS, () => setRide(null));
  };

  // Subscriptions are narrow on purpose: an update to an agent on another floor
  // (every tool call changes its action) must not re-render this office.
  // Ramon first so he takes the first workstation and is pinned to floor 1.
  const orderedIds = useStore(useShallow((s) => [...s.agents.filter(isRamon), ...s.agents.filter((a) => !isRamon(a))].map((a) => a.id)));
  const pinned = useStore(useShallow((s) => s.agents.filter(isRamon).map((a) => a.id)));
  const levels = useMemo(() => assignOfficeLevels(orderedIds, saved, pinned), [orderedIds, saved, pinned]);
  // Keep auto-placements too (merged over the saved ones), or an agent that
  // overflowed to a higher floor jumps down the moment someone below leaves.
  const levelsJson = JSON.stringify(levels);
  useEffect(() => {
    setSaved((p) => {
      const next = { count: levels.count, byAgent: { ...p.byAgent, ...levels.byAgent } };
      return JSON.stringify(next) === JSON.stringify(p) ? p : next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only when the assignment changes
  }, [levelsJson]);
  useEffect(() => writeJson(LS_LEVELS, saved), [saved]);
  useEffect(() => { if (level >= levels.count) setLevel(levels.count - 1); }, [level, levels.count]);

  const onLevel = useStore(useShallow((s) => {
    const here = s.agents.filter((a) => levels.byAgent[a.id] === level);
    return [...here.filter(isRamon), ...here.filter((a) => !isRamon(a))];
  }));
  // Rebuilt only when something the office draws changes, not on every action update.
  const officeKey = JSON.stringify(onLevel.map(toOfficeAgent));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const officeAgents = useMemo(() => onLevel.map(toOfficeAgent), [officeKey]);

  const [desks, setDesks] = useState<Record<string, string>>(() => readJson(lsDesks(0), {}));
  useEffect(() => setDesks(readJson(lsDesks(level), {})), [level]);

  const ramonId = pinned[0] ?? null;
  const ramonName = useStore((s) => s.agents.find(isRamon)?.name);
  // Chatter follows the app language unless the owner switched that off
  // (Settings -> General -> Features); then it stays in the English/Taglish pool.
  const chatterFollows = featureOn(features, 'chatterFollowsLanguage');
  const pickChatter = useMemo<PickChatter>(() => {
    const ct = chatterFollows ? t : i18n.getFixedT('en');
    const lines = ct('office.cafeteria', { returnObjects: true }) as CafeteriaLines | undefined;
    return (kind, agentId, seed) => {
      const character = useStore.getState().agents.find((a) => a.id === agentId)?.character ?? 'michael';
      switch (kind) {
        case 'exchange': return [...pickExchange(lines, character, seed)];
        case 'gossip': {
          // Witty Pinoy chismis pool (office.gossip); its size is read, not assumed.
          const pool = ct('office.gossip', { returnObjects: true }) as unknown;
          const count = Array.isArray(pool) && pool.length > 0 ? pool.length : 1;
          return [ct(`office.gossip.${seed % count}`)];
        }
        case 'suckUp': return [ct(`office.suckUp.${SUCKUP_LINES[seed % SUCKUP_LINES.length]}`, { godName: ramonName ?? 'boss' })];
        case 'cheer': return [ct(`office.cheer.${seed % CHEER_COUNT}`)];
        default: return [pickSoloLine(lines, character, kind, seed)];
      }
    };
  }, [ramonName, t, i18n, chatterFollows]);

  // Reply bubbles, emoji reactions and janitors, from live agent state.
  const { feedEvents, cleaningCues } = useOfficeFeed(onLevel);
  // Meeting table → standup from hive tasks and each agent's recent commits.
  const standup = useOfficeStandup(onLevel);
  // Spoken replies (ElevenLabs, off until the user turns them on in office settings).
  const voice = useVoiceReplies();
  // Spotify jukebox (agents dance while it plays) and where agents walk.
  const jukebox = useJukebox();
  // Click a computer → that agent's live screen (tools, commands, last file).
  const monitors = useOfficeMonitors(onLevel);
  const activity = useOfficeActivity(onLevel, {
    cleaningCues,
    jukeboxPlaying: jukebox.isPlaying,
    onStandupRequested: standup.onStandupStartRequested,
    voiceAvailable: voice.voiceRepliesEnabled
  });
  const spokenRef = useRef<OfficeFeedEvent | null>(null);
  useEffect(() => {
    const latest = feedEvents[0];
    if (!latest || latest === spokenRef.current) return;
    spokenRef.current = latest;
    // The voice hook already speaks recentAssistantText; this covers hive messages.
    const own = useStore.getState().agents.find((a) => a.id === latest.id)?.recentAssistantText?.trim();
    if (latest.kind === 'reply' && latest.text !== own) voice.speak(latest.text);
  }, [feedEvents, voice]);

  // Focus mode and the IDE cover the office: no point drawing it.
  const coveredByOverlay = useStore((s) => Boolean(s.fullscreenAgentId) || s.ideOpen);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (fullscreen) {
      setFullscreen(false);
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    } else {
      setFullscreen(true);
      // OS full screen too; if the window refuses, the office still fills it.
      void document.documentElement.requestFullscreen?.().catch(() => {});
    }
  };
  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFullscreen(false); };
    // Leaving OS full screen (Esc, F11, window controls) leaves office full screen too.
    const onChange = () => { if (!document.fullscreenElement) setFullscreen(false); };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [fullscreen]);

  // The floor bar needs only the selected agent's name (Ramon can't be moved).
  const selectedName = useStore((s) => s.agents.find((a) => a.id === s.selectedId && !isRamon(a))?.name);
  const editing = useStore((s) => (editingId ? s.agents.find((a) => a.id === editingId) : undefined));

  const moveSelected = (to: number) => {
    if (!selectedId) return;
    const next = moveAgentToLevel(levels, selectedId, to, pinned);
    if (!next) {
      setNotice(t('office.levels.full', { n: to + 1, max: AGENTS_PER_LEVEL }));
      return;
    }
    setNotice(null);
    setSaved(next);
    goToLevel(to);
  };

  const levelCount = (i: number) =>
    Object.entries(levels.byAgent).filter(([id, l]) => l === i && !pinned.includes(id)).length;

  // Deletes the floor on screen; only an empty floor above Floor 1 qualifies.
  const deleteLevel = () => {
    const next = removeOfficeLevel(levels, level);
    if (!next || !window.confirm(t('office.levels.deleteConfirm', { n: level + 1 }))) return;
    try {
      const keys = Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i) ?? '');
      const { drop, moves } = levelKeyMoves(keys, level);
      for (const k of drop) localStorage.removeItem(k);
      for (const [from, to] of moves) {
        const v = localStorage.getItem(from);
        if (v !== null) localStorage.setItem(to, v);
        localStorage.removeItem(from);
      }
    } catch { /* storage unavailable: the floors above fall back to the default layout */ }
    stopRide();
    setRide(null);
    setNotice(null);
    setSaved(next);
    setLevel(level - 1);
  };

  return (
    // Full screen pins the office over the whole window (header, agent strip and
    // sidebar hidden) without remounting the 3D scene.
    <div className="devlabs-office" style={{
      position: fullscreen ? 'fixed' : 'absolute', inset: 0, zIndex: fullscreen ? 900 : undefined,
      overflow: 'hidden', background: '#0b0d10'
    }}>
      <div style={{ position: 'absolute', inset: 0, ...rideStyle(ride) }}>
      <RetroOffice3D
        key={`${level}:${themeRev}`}
        agents={officeAgents}
        {...standup}
        atmAnalytics={ATM_ANALYTICS}
        voiceRepliesEnabled={voice.voiceRepliesEnabled}
        voiceRepliesVoiceId={voice.voiceRepliesVoiceId}
        voiceRepliesSpeed={voice.voiceRepliesSpeed}
        voiceRepliesLoaded={voice.voiceRepliesLoaded}
        // v4: desks fixed (agents sat inside them) and a boss office for Ramon.
        storageNamespace={levelNamespace(level)}
        officeTitle={t('office.levels.floor', { n: level + 1 })}
        taskManagerEnabled
        pickChatter={pickChatter}
        bossAgentId={ramonId}
        feedEvents={feedEvents}
        cleaningCues={cleaningCues}
        animationState={activity.animationState}
        phoneBoothAgentId={activity.phoneBoothAgentId}
        phoneCallScenario={activity.phoneCallScenario}
        onPhoneCallComplete={activity.onPhoneCallComplete}
        smsBoothAgentId={activity.smsBoothAgentId}
        textMessageScenario={activity.textMessageScenario}
        onTextMessageComplete={activity.onTextMessageComplete}
        soundclawEnabled
        monitorAgentId={monitors.monitorAgentId}
        monitorByAgentId={monitors.monitorByAgentId}
        onMonitorSelect={monitors.onMonitorSelect}
        onJukeboxInteract={() => jukebox.setOpen(true)}
        deskAssignmentByDeskUid={desks}
        onDeskAssignmentChange={(deskUid, agentId) => {
          const next = { ...desks };
          for (const [uid, id] of Object.entries(next)) if (id === agentId) delete next[uid];
          if (agentId) next[deskUid] = agentId; else delete next[deskUid];
          setDesks(next);
          writeJson(lsDesks(level), next);
        }}
        onAgentChatSelect={(id) => useStore.getState().select(id)}
        onAgentEdit={setEditingId}
        onAddAgent={() => useStore.getState().setAddAgentOpen(true)}
        fullscreen={fullscreen}
        paused={coveredByOverlay}
        selectedAgentId={selectedId}
        onToggleFullscreen={toggleFullscreen}
      />
      </div>
      {ride && (
        // Elevator display; the pressed floor button already tells screen readers.
        <div aria-hidden style={{
          position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', zIndex: 29,
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderRadius: 10, pointerEvents: 'none',
          background: BRAND.panel, border: `1px solid ${BRAND.line}`, color: BRAND.lime,
          font: '800 22px/1 var(--cth-font-display)', letterSpacing: '-0.01em', textTransform: 'lowercase',
          fontVariantNumeric: 'tabular-nums'
        }}>
          <span style={{ fontSize: 14 }}>{ride.up ? '▲' : '▼'}</span>
          {t('office.levels.floor', { n: ride.shown + 1 })}
        </div>
      )}

      {themeOpen && featureOn(features, 'officeThemes') && (
        <OfficeThemePanel
          namespace={levelNamespace(level)}
          desks={desks}
          agents={themeAgents}
          onClose={() => setThemeOpen(false)}
          onApplied={(seats, mode) => {
            // Seats travel with the layout: back them up on import, bring them back on undo.
            const dk = lsDesks(level);
            if (mode === 'apply') { writeJson(`${dk}:theme-backup`, desks); setDesks(seats); writeJson(dk, seats); }
            else {
              const prev = readJson<Record<string, string>>(`${dk}:theme-backup`, {});
              setDesks(prev); writeJson(dk, prev);
              try { localStorage.removeItem(`${dk}:theme-backup`); } catch { /* ignore */ }
            }
            setThemeRev((r) => r + 1);
          }}
        />
      )}

      {/* The building — bottom right, floors stacked with Floor 1 at the bottom and
          "add floor" on the roof. It stays clear of the office's status line
          (bottom left) and scrolls when the building is tall. */}
      <div style={{
        position: 'absolute', right: 10, bottom: 10, zIndex: 30, maxWidth: 'calc(100% - 340px)',
        display: 'flex', flexDirection: 'column', alignItems: 'stretch', gap: 3, padding: 3, borderRadius: 8,
        background: BRAND.panel, border: `1px solid ${BRAND.line}`,
        font: '800 11px/1 var(--cth-font-display)', letterSpacing: '-0.01em', textTransform: 'lowercase'
      }}>
        {notice && (
          <div role="status" style={{
            maxWidth: 220, padding: '6px 8px', borderRadius: 6, background: BRAND.key, color: BRAND.dark,
            font: '600 12px/1.3 var(--cth-font-ui)', letterSpacing: 0, textTransform: 'none'
          }}>
            {notice}
          </div>
        )}
        {/* Above the stack, so the floors never move under the cursor. */}
        <div style={{ display: level > 0 || (levels.count > 1 && selectedName !== undefined) ? 'flex' : 'none', alignItems: 'center', gap: 4, minWidth: 0 }}>
        {level > 0 && (
          <button
            type="button"
            onClick={deleteLevel}
            disabled={levelCount(level) > 0}
            title={levelCount(level) > 0
              ? t('office.levels.deleteBlocked', { n: level + 1 })
              : t('office.levels.deleteFloor', { n: level + 1 })}
            style={{
              padding: '4px 8px', borderRadius: 6, border: `1px dashed ${BRAND.line}`, whiteSpace: 'nowrap',
              background: 'transparent', font: 'inherit', letterSpacing: 'inherit',
              color: levelCount(level) > 0 ? BRAND.muted : BRAND.key,
              cursor: levelCount(level) > 0 ? 'not-allowed' : 'pointer', opacity: levelCount(level) > 0 ? 0.55 : 1
            }}
          >
            − {t('office.levels.deleteFloor', { n: level + 1 })}
          </button>
        )}
        {levels.count > 1 && selectedId && selectedName !== undefined && (
          <label
            title={t('office.levels.moveTo', { name: selectedName })}
            style={{ display: 'flex', alignItems: 'center', gap: 6, color: BRAND.muted, paddingLeft: 4, whiteSpace: 'nowrap', minWidth: 0 }}
          >
            <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {t('office.levels.moveTo', { name: selectedName })}
            </span>
            <select
              value={levels.byAgent[selectedId] ?? 0}
              onChange={(e) => moveSelected(Number(e.target.value))}
              style={{ background: BRAND.dark, color: BRAND.text, border: `1px solid ${BRAND.line}`, borderRadius: 4, font: 'inherit', padding: '3px 4px' }}
            >
              {Array.from({ length: levels.count }, (_, i) => (
                <option key={i} value={i}>{t('office.levels.floor', { n: i + 1 })}</option>
              ))}
            </select>
          </label>
        )}
        </div>
        <button
          type="button"
          onClick={() => { setSaved({ count: levels.count + 1, byAgent: levels.byAgent }); goToLevel(levels.count); }}
          style={{
            padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: `1px dashed ${BRAND.line}`, whiteSpace: 'nowrap',
            background: 'transparent', color: BRAND.lime, font: 'inherit', letterSpacing: 'inherit'
          }}
        >
          + {t('office.levels.addFloor')}
        </button>
        {featureOn(features, 'officeThemes') && (
          <button
            type="button"
            onClick={() => setThemeOpen((o) => !o)}
            aria-pressed={themeOpen}
            title={t('office.theme.title')}
            style={{
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: `1px dashed ${BRAND.line}`, whiteSpace: 'nowrap',
              background: themeOpen ? BRAND.lime : 'transparent', color: themeOpen ? BRAND.dark : BRAND.lime, font: 'inherit', letterSpacing: 'inherit'
            }}
          >
            ◈ {t('office.theme.button')}
          </button>
        )}
        <BuildingFloors
          levels={levels}
          pinned={pinned}
          active={ride?.to ?? level}
          onPick={(i) => { setNotice(null); goToLevel(i); }}
        />
      </div>
      <MiniRadioPlayer />
      {jukebox.panel}
      {editing && <EditAgentModal agent={editing} onClose={() => setEditingId(null)} />}
    </div>
  );
}

// The building's floors as stacked slabs, Floor 1 at the bottom. Each slab has
// one window per seat, lit in the colour of the agent's status badge. Its own
// component so a status change redraws the strip, not the office.
function BuildingFloors({ levels, pinned, active, onPick }: {
  levels: OfficeLevels; pinned: string[]; active: number; onPick: (level: number) => void;
}) {
  const { t } = useTranslation();
  const statuses = useStore(useShallow((s) => s.agents.map((a) => `${a.id}\n${officeStatus(a)}`)));
  const windows = useMemo(() => {
    const byLevel: string[][] = Array.from({ length: levels.count }, () => []);
    for (const entry of statuses) {
      const [id, status] = entry.split('\n');
      const at = levels.byAgent[id];
      if (at === undefined || pinned.includes(id)) continue;
      byLevel[at]?.push(agentStatusBadge(status as OfficeAgent['status'], 'walking').color);
    }
    return byLevel;
  }, [statuses, levels, pinned]);
  const activeRef = useRef<HTMLButtonElement>(null);
  // Braces on purpose: newer Chromium returns a Promise from scrollIntoView.
  useEffect(() => { void activeRef.current?.scrollIntoView({ block: 'nearest' }); }, [active]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column-reverse', gap: 2, maxHeight: 'min(40vh, 200px)', overflowY: 'auto' }}>
      {windows.map((lit, i) => (
        <button
          key={i}
          ref={i === active ? activeRef : undefined}
          type="button"
          onClick={() => onPick(i)}
          title={t('office.levels.count', { count: lit.length, max: AGENTS_PER_LEVEL })}
          aria-label={`${t('office.levels.floor', { n: i + 1 })}, ${t('office.levels.count', { count: lit.length, max: AGENTS_PER_LEVEL })}`}
          aria-pressed={i === active}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexShrink: 0,
            padding: '4px 8px', borderRadius: 4, cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
            borderColor: i === active ? BRAND.lime : 'rgba(230, 236, 221, 0.1)',
            background: i === active ? 'rgba(205, 242, 82, 0.14)' : 'rgba(230, 236, 221, 0.04)',
            color: i === active ? BRAND.lime : BRAND.muted, font: 'inherit', letterSpacing: 'inherit'
          }}
        >
          {t('office.levels.floor', { n: i + 1 })}
          <span aria-hidden style={{ display: 'flex', gap: 2 }}>
            {Array.from({ length: AGENTS_PER_LEVEL }, (_, w) => (
              <span key={w} style={{
                width: 5, height: 8, borderRadius: 1,
                background: lit[w] ?? 'transparent',
                boxShadow: lit[w] ? undefined : 'inset 0 0 0 1px rgba(230, 236, 221, 0.14)'
              }} />
            ))}
          </span>
        </button>
      ))}
    </div>
  );
}

// Bottom-centre radio controls while the jukebox radio is on. Stop eases it out
// of sight; starting a station from the jukebox brings it back.
const EASE_OUT = '420ms cubic-bezier(0.22, 1, 0.36, 1)';

function MiniRadioPlayer() {
  const { t } = useTranslation();
  const player = useRadio();
  if (!player.station) return null;
  const shown = player.status !== 'stopped';
  const on = player.status === 'playing' || player.status === 'loading';
  const status = player.status === 'playing' ? 'live' : player.status === 'loading' ? 'connecting' : 'offline';
  const button = (label: string, onClick: () => void, icon: ReactNode) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 26, borderRadius: 6,
        border: `1px solid ${BRAND.line}`, background: 'transparent', color: BRAND.text, cursor: 'pointer'
      }}
    >
      {icon}
    </button>
  );
  return (
    <div
      role="region"
      aria-label={t('office.radio.player')}
      aria-hidden={!shown}
      style={{
        position: 'absolute', left: '50%', bottom: 10, zIndex: 30, maxWidth: 360,
        display: 'flex', alignItems: 'center', gap: 6, padding: '4px 5px 4px 10px', borderRadius: 8,
        background: BRAND.panel, border: `1px solid ${BRAND.line}`, color: BRAND.text,
        opacity: shown ? 1 : 0,
        transform: `translate(-50%, ${shown ? 0 : 14}px)`,
        pointerEvents: shown ? 'auto' : 'none',
        // Hidden only after the fade, so it can't be tabbed to while invisible.
        visibility: shown ? 'visible' : 'hidden',
        transition: `opacity ${EASE_OUT}, transform ${EASE_OUT}, visibility 0s linear ${shown ? '0s' : '420ms'}`
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
          background: status === 'live' ? BRAND.lime : status === 'offline' ? BRAND.key : BRAND.muted
        }}
      />
      <div style={{ minWidth: 0, marginRight: 4 }}>
        <div style={{ font: '600 12px/1.25 var(--cth-font-ui)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {player.station.name}
        </div>
        <div style={{ fontSize: 10, color: status === 'offline' ? BRAND.key : BRAND.muted }}>{t(`office.radio.${status}`)}</div>
      </div>
      {button(t('office.radio.previous'), () => radio.step(-1), <SkipBack size={13} />)}
      {on
        ? button(t('office.radio.stop'), () => radio.stop(), <Square size={12} />)
        : button(t('office.radio.play'), () => player.station && radio.play(player.station), <Play size={13} />)}
      {button(t('office.radio.next'), () => radio.step(1), <SkipForward size={13} />)}
    </div>
  );
}
