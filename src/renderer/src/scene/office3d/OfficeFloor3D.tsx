import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useShallow } from 'zustand/react/shallow';
import { useStore, type Agent } from '@/store/store';
import { accentByName } from '@/design/tokens';
import { RetroOffice3D } from '@/features/retro-office/RetroOffice3D';
import type { OfficeAgent } from '@/features/retro-office/core/types';
import { EditAgentModal } from '@/components/EditAgentModal';
import type { PickChatter } from '@/features/retro-office/systems/chatter';
import { pickExchange, pickSoloLine } from '@/scene/office/cafeteriaLines';
import { useOfficeFeed, type OfficeFeedEvent } from './useOfficeFeed';
import { useOfficeStandup } from './useOfficeStandup';
import { useVoiceReplies } from './useVoiceReplies';
import { useOfficeActivity } from './useOfficeActivity';
import { useJukebox } from './useJukebox';
import { useOfficeMonitors } from './useOfficeMonitors';
import {
  AGENTS_PER_LEVEL, assignOfficeLevels, levelDesksKey, levelKeyMoves, levelNamespace, moveAgentToLevel,
  parseOfficeLevels, removeOfficeLevel, type OfficeLevels
} from '@shared/officeLevels';
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

const BUSY = new Set(['working', 'thinking', 'compacting', 'looping']);

const toOfficeAgent = (a: Agent): OfficeAgent => ({
  id: a.id,
  name: a.name,
  // Ramon's red plate already says "boss"; his long brief doesn't fit a tag.
  subtitle: a.isGod || a.id === 'god' ? null : a.description || null,
  status: a.status === 'blocked' ? 'error' : BUSY.has(a.status) ? 'working' : 'idle',
  color: `#${(accentByName[a.accent] ?? 0x888888).toString(16).padStart(6, '0')}`,
  item: itemFor(a.id),
  avatarProfile: a.avatarProfile ?? null
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
  const { t } = useTranslation();
  const selectedId = useStore((s) => s.selectedId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saved, setSaved] = useState<OfficeLevels>(() => {
    try { return parseOfficeLevels(localStorage.getItem(LS_LEVELS)); } catch { return parseOfficeLevels(null); }
  });
  const [level, setLevel] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);

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
  const pickChatter = useMemo<PickChatter>(() => (kind, agentId, seed) => {
    const character = useStore.getState().agents.find((a) => a.id === agentId)?.character ?? 'michael';
    switch (kind) {
      case 'exchange': return [...pickExchange(character, seed)];
      case 'gossip': {
        // Witty Pinoy chismis pool (office.gossip); its size is read, not assumed.
        const pool = t('office.gossip', { returnObjects: true }) as unknown;
        const count = Array.isArray(pool) && pool.length > 0 ? pool.length : 1;
        return [t(`office.gossip.${seed % count}`)];
      }
      case 'suckUp': return [t(`office.suckUp.${SUCKUP_LINES[seed % SUCKUP_LINES.length]}`, { godName: ramonName ?? 'boss' })];
      case 'cheer': return [t(`office.cheer.${seed % CHEER_COUNT}`)];
      default: return [pickSoloLine(character, kind, seed)];
    }
  }, [ramonName, t]);

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
    setLevel(to);
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
      <RetroOffice3D
        key={level}
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
        onToggleFullscreen={toggleFullscreen}
      />

      {/* Floor switcher — bottom right, one line, so it never covers the office's
          status line (bottom left); scrolls sideways when there are many floors. */}
      <div style={{
        position: 'absolute', right: 10, bottom: 10, zIndex: 30, maxWidth: 'calc(100% - 340px)', overflowX: 'auto',
        display: 'flex', alignItems: 'center', gap: 4, padding: 3, borderRadius: 8,
        background: BRAND.panel, border: `1px solid ${BRAND.line}`,
        font: '800 11px/1 var(--cth-font-display)', letterSpacing: '-0.01em', textTransform: 'lowercase'
      }}>
        {Array.from({ length: levels.count }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setLevel(i); setNotice(null); }}
            title={t('office.levels.count', { count: levelCount(i), max: AGENTS_PER_LEVEL })}
            aria-pressed={i === level}
            style={{
              padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: '1px solid', whiteSpace: 'nowrap',
              borderColor: i === level ? BRAND.lime : 'transparent',
              background: i === level ? BRAND.lime : 'transparent',
              color: i === level ? BRAND.dark : BRAND.muted, font: 'inherit', letterSpacing: 'inherit'
            }}
          >
            {t('office.levels.floor', { n: i + 1 })} · {levelCount(i)}/{AGENTS_PER_LEVEL}
          </button>
        ))}
        <button
          type="button"
          onClick={() => { setSaved({ count: levels.count + 1, byAgent: levels.byAgent }); setLevel(levels.count); }}
          style={{
            padding: '4px 8px', borderRadius: 6, cursor: 'pointer', border: `1px dashed ${BRAND.line}`, whiteSpace: 'nowrap',
            background: 'transparent', color: BRAND.lime, font: 'inherit', letterSpacing: 'inherit'
          }}
        >
          + {t('office.levels.addFloor')}
        </button>
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
      {notice && (
        <div role="status" style={{
          position: 'absolute', right: 10, bottom: 46, zIndex: 30,
          padding: '6px 10px', borderRadius: 6, background: BRAND.key, color: BRAND.dark, fontSize: 12
        }}>
          {notice}
        </div>
      )}

      {jukebox.panel}
      {editing && <EditAgentModal agent={editing} onClose={() => setEditingId(null)} />}
    </div>
  );
}
