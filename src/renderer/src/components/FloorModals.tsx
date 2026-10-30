/**
 * Shareable floors — review-and-hire a whole team, or export the current one.
 * Spec + validator: src/shared/floor.ts. Guide: .documentations/FLOORS.md.
 *
 * Import never spawns by itself: the human picks a project folder and clicks
 * "Hire all", or hands the team to the Add-Agent form to review one by one.
 * Connectors a floor asks for are listed, never enabled — keys and consent stay
 * in Settings → Connections.
 */
import { useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { useStore } from '@/store/store';
import { OFFICE_CAST, DEFAULT_CHARACTER, type OfficeCharacterName } from '@/scene/office/cast';
import type { HarnessConfig } from '@/store/config';
import type { HireManifest } from '@shared/hire';
import { MCP_CATALOG, mcpCatalogEntry } from '@shared/mcpCatalog';
import { buildFloorExport, type FloorManifest } from '@shared/floor';
import { floorHireCommand, spawnFloorHire } from './floorSpawn';

export interface FloorImportPayload { floor: FloorManifest; consentRequired?: string[] }

const overlay: CSSProperties = {
  position: 'fixed', inset: 0,
  background: 'rgba(26, 19, 32, 0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  zIndex: 500
};
const box: CSSProperties = {
  padding: '8px 10px',
  background: 'var(--cth-cream-100)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  fontSize: 12, color: 'var(--cth-ink-900)', lineHeight: '17px'
};
const label: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-700)', textTransform: 'uppercase'
};
const input: CSSProperties = {
  width: '100%', padding: '6px 8px 4px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 14, color: 'var(--cth-ink-900)', outline: 'none'
};
const chip: CSSProperties = {
  display: 'inline-block', padding: '1px 6px', marginInlineEnd: 4,
  background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontSize: 11
};

function portraitFor(m: { name: string; character?: string }): OfficeCharacterName {
  if (m.character && OFFICE_CAST.some(c => c.name === m.character)) return m.character as OfficeCharacterName;
  const q = m.name.trim().toLowerCase();
  return OFFICE_CAST.find(c => c.displayName.toLowerCase() === q || c.name === q)?.name ?? DEFAULT_CHARACTER;
}

function connectorLabel(id: string): string {
  return mcpCatalogEntry(id)?.label ?? id;
}

type HireState = { kind: 'waiting' } | { kind: 'spawning' } | { kind: 'done' } | { kind: 'failed'; error: string };

export interface FloorImportModalProps {
  payload: FloorImportPayload;
  config: HarnessConfig;
  onConfigChange?: (config: HarnessConfig) => void;
  onClose: () => void;
  /** Hand the team to the Add-Agent form, one hire at a time. */
  onReviewOneByOne: (hires: HireManifest[]) => void;
}

export function FloorImportModal({ payload, config, onConfigChange, onClose, onReviewOneByOne }: FloorImportModalProps) {
  const { t: tr } = useTranslation();
  const addAgent = useStore(s => s.addAgent);
  const { floor, consentRequired } = payload;
  const [cwd, setCwd] = useState<string>(config.registeredRepos[0] ?? '');
  const [states, setStates] = useState<HireState[]>(() => floor.hires.map(() => ({ kind: 'waiting' })));
  const [busy, setBusy] = useState(false);
  const [finished, setFinished] = useState(false);
  const [error, setError] = useState<string>();

  const pickFolder = async () => {
    setError(undefined);
    const res = await window.cth.chooseFolder();
    if (res.ok) setCwd(res.path);
    else if (res.error !== 'cancelled') setError(res.error);
  };

  const setState = (i: number, s: HireState) =>
    setStates(prev => prev.map((p, j) => (j === i ? s : p)));

  const hireAll = async () => {
    if (!cwd) { setError(tr('floor.errFolder')); return; }
    setError(undefined);
    setBusy(true);
    let latest = config;
    for (let i = 0; i < floor.hires.length; i++) {
      if (states[i].kind === 'done') continue;
      const m = floor.hires[i];
      setState(i, { kind: 'spawning' });
      const res = await spawnFloorHire(latest, m, cwd);
      if (!res.ok) { setState(i, { kind: 'failed', error: res.error }); continue; }
      addAgent(res.agent);
      if (m.tokenCap) {
        try { latest = await window.cth.setAgentTokenCap(res.agent.id, m.tokenCap); } catch { /* best-effort */ }
      }
      setState(i, { kind: 'done' });
    }
    // Remember the project for the next hire, like the Add-Agent form does.
    if (latest.registeredRepos[0] !== cwd) {
      try { latest = await window.cth.updateConfig({ registeredRepos: [cwd, ...latest.registeredRepos.filter(r => r !== cwd)] }); } catch { /* best-effort */ }
    }
    onConfigChange?.(latest);
    setBusy(false);
    setFinished(true);
  };

  const doneCount = states.filter(s => s.kind === 'done').length;
  const failedCount = states.filter(s => s.kind === 'failed').length;

  return (
    <div onClick={busy ? undefined : onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 760, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title={tr('floor.importTitle')} noPadding>
          <div data-testid="floor-import" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={box}>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{floor.name}</div>
              {floor.author && <div style={{ color: 'var(--cth-ink-500)' }}>{tr('floor.byAuthor', { author: floor.author })}</div>}
              {floor.description && <div style={{ marginTop: 4 }}>{floor.description}</div>}
              <div style={{ marginTop: 6, color: 'var(--cth-ink-700)' }}>{tr('floor.importNote', { count: floor.hires.length })}</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {floor.hires.map((m, i) => {
                const s = states[i];
                return (
                  <div key={m.name} style={{ ...box, display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--cth-paper-100)' }}>
                    <SpritePortrait character={portraitFor(m)} scale={1} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div><strong>{m.name}</strong>{m.description ? <> — {m.description}</> : null}</div>
                      <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)', wordBreak: 'break-all' }}>
                        {floorHireCommand(config, m).command}
                      </div>
                      {m.goal && <div style={{ color: 'var(--cth-ink-700)', marginTop: 2 }}>{m.goal}</div>}
                      <div style={{ marginTop: 4 }}>
                        {m.isolate && <span style={chip}>{tr('floor.isolated')}</span>}
                        {m.tokenCap && <span style={chip}>{tr('floor.tokenCap', { cap: m.tokenCap.toLocaleString() })}</span>}
                        {(m.mcpServers ?? []).map(id => <span key={id} style={chip}>🔌 {connectorLabel(id)}</span>)}
                        {(m.skills ?? []).map(id => <span key={id} style={chip}>{id}</span>)}
                      </div>
                    </div>
                    <span data-testid={`floor-hire-state-${i}`} style={{
                      flexShrink: 0, fontSize: 12,
                      color: s.kind === 'failed' ? 'var(--cth-coral)' : 'var(--cth-ink-700)'
                    }}>
                      {s.kind === 'waiting' ? '' : s.kind === 'spawning' ? tr('floor.stateSpawning')
                        : s.kind === 'done' ? tr('floor.stateDone') : tr('floor.stateFailed', { error: s.error })}
                    </span>
                  </div>
                );
              })}
            </div>

            {consentRequired && consentRequired.length > 0 && (
              <div style={{ ...box, background: 'var(--cth-lemon-light, #fdf3cf)' }}>
                <strong>{tr('floor.connectorsTitle')}</strong> {consentRequired.map(connectorLabel).join(', ')}
                <div>{tr('floor.connectorsNote')}</div>
              </div>
            )}

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{tr('floor.projectFolder')}</span>
              <div style={{ display: 'flex', gap: 8 }}>
                <select value={cwd} onChange={(e) => setCwd(e.target.value)} style={{ ...input, flex: 1 }} disabled={busy}>
                  {cwd && !config.registeredRepos.includes(cwd) && <option value={cwd}>{cwd}</option>}
                  {!cwd && <option value="">{tr('floor.noFolder')}</option>}
                  {config.registeredRepos.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <PixelButton variant="secondary" size="md" onClick={pickFolder} disabled={busy}>{tr('floor.browse')}</PixelButton>
              </div>
            </label>

            {error && <div style={{ ...box, color: 'var(--cth-coral)' }}>{error}</div>}
            {finished && (
              <div data-testid="floor-import-summary" style={box}>
                {tr('floor.summary', { done: doneCount, total: floor.hires.length })}
                {failedCount > 0 ? <> {tr('floor.summaryFailed', { count: failedCount })}</> : null}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              {!finished && (
                <PixelButton variant="secondary" size="md" onClick={() => onReviewOneByOne(floor.hires)} disabled={busy}>
                  {tr('floor.reviewOneByOne')}
                </PixelButton>
              )}
              <div style={{ flex: 1 }} />
              <PixelButton variant="ghost" size="md" onClick={onClose} disabled={busy}>
                {finished ? tr('floor.close') : tr('common.cancel')}
              </PixelButton>
              {(!finished || failedCount > 0) && (
                <PixelButton variant="primary" size="md" onClick={hireAll} disabled={busy}>
                  {busy ? tr('floor.hiring') : finished ? tr('floor.retryFailed') : tr('floor.hireAll', { count: floor.hires.length })}
                </PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}

export interface FloorExportModalProps {
  config: HarnessConfig;
  onClose: () => void;
}

export function FloorExportModal({ config, onClose }: FloorExportModalProps) {
  const { t: tr } = useTranslation();
  const agents = useStore(s => s.agents);
  const [name, setName] = useState('My floor');
  const [description, setDescription] = useState('');
  const [author, setAuthor] = useState('');
  const [includeConnectors, setIncludeConnectors] = useState(true);
  const [status, setStatus] = useState<{ ok: boolean; text: string }>();

  // Connectors the user has switched on that need a key — the team likely relies on them.
  const enabledConnectors = useMemo(() => MCP_CATALOG
    .filter(e => e.tier !== 'safe-readonly' && config.mcpDefaults?.[e.id]?.enabled)
    .map(e => e.id), [config.mcpDefaults]);

  const result = useMemo(() => buildFloorExport(
    agents,
    { name: name.trim(), description: description.trim() || undefined, author: author.trim() || undefined },
    { tokenCaps: config.agentTokenCaps, connectors: includeConnectors ? enabledConnectors : undefined }
  ), [agents, name, description, author, includeConnectors, enabledConnectors, config.agentTokenCaps]);

  const save = async () => {
    if (!result.ok) return;
    setStatus(undefined);
    const res = await window.cth.saveFloorFile(result.floor);
    if (res.ok) setStatus({ ok: true, text: tr('floor.saved', { path: res.path ?? '' }) });
    else if (res.error !== 'cancelled') setStatus({ ok: false, text: res.error ?? 'save failed' });
  };

  return (
    <div onClick={onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 620, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title={tr('floor.exportTitle')} noPadding>
          <div data-testid="floor-export" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={box}>{tr('floor.exportNote')}</div>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{tr('floor.name')}</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} style={input} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{tr('floor.description')}</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} rows={2} style={{ ...input, resize: 'vertical' }} />
            </label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{tr('floor.author')}</span>
              <input value={author} onChange={(e) => setAuthor(e.target.value)} maxLength={80} style={input} />
            </label>
            {enabledConnectors.length > 0 && (
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12 }}>
                <input type="checkbox" checked={includeConnectors} onChange={(e) => setIncludeConnectors(e.target.checked)} />
                {tr('floor.includeConnectors', { list: enabledConnectors.map(connectorLabel).join(', ') })}
              </label>
            )}

            {result.ok ? (
              <div style={box}>
                <strong>{tr('floor.exportIncluded', { count: result.floor.hires.length })}</strong>{' '}
                {result.floor.hires.map(h => h.name).join(', ')}
                {result.skipped.length > 0 && (
                  <div style={{ marginTop: 4, color: 'var(--cth-ink-700)' }}>
                    {tr('floor.exportSkipped')}{' '}
                    {result.skipped.map(s => `${s.name} (${s.reason})`).join('; ')}
                  </div>
                )}
              </div>
            ) : (
              <div style={{ ...box, color: 'var(--cth-coral)' }}>{tr('floor.exportNothing')} {result.errors.join('; ')}</div>
            )}

            {status && <div data-testid="floor-export-status" style={{ ...box, color: status.ok ? 'var(--cth-ink-900)' : 'var(--cth-coral)' }}>{status.text}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PixelButton variant="ghost" size="md" onClick={onClose}>{tr('floor.close')}</PixelButton>
              <PixelButton variant="primary" size="md" onClick={save} disabled={!result.ok}>{tr('floor.saveFile')}</PixelButton>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
