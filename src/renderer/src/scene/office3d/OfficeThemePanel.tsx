/**
 * Office theme panel (floor bar → Theme). Export the current floor's layout as
 * one JSON file, import one (validated in main AND here, previewed as a diff,
 * backed up, undoable), or copy a prompt + schema so any AI can design one.
 *
 * Host-side on purpose: it only reads/writes the floor's saved layout through
 * themeStore and asks the host to remount the scene; retro-office is untouched.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  diffOfficeThemes, officeThemeFromFurniture, officeThemeJsonSchema, officeThemePrompt, validateOfficeTheme,
  type OfficeTheme, type OfficeThemeDiff
} from '@shared/officeTheme';
import { applyTheme, hasBackup, readFurniture, readScene, revertTheme, type StoredFurniture } from './themeStore';
import { OFFICE_THEME_PRESETS, buildOfficeThemePreset, type OfficeThemePresetId } from './themePresets';

export interface OfficeThemePanelProps {
  /** The floor's storage namespace (`levelNamespace(level)`). */
  namespace: string;
  /** Desk uid → agent id for this floor, and the agents to resolve names. */
  desks: Record<string, string>;
  agents: { id: string; name: string }[];
  /** Called after an import or undo with the seat map to store; the host then remounts the scene. */
  onApplied: (desks: Record<string, string>, mode: 'apply' | 'undo') => void;
  onClose: () => void;
}

const panel: React.CSSProperties = {
  position: 'absolute', right: 10, bottom: 52, zIndex: 40, width: 360, maxHeight: 'calc(100% - 80px)', overflowY: 'auto',
  padding: 12, borderRadius: 10, background: 'rgba(24, 28, 23, 0.97)', border: '1px solid rgba(205, 242, 82, 0.28)',
  color: '#E6ECDD', font: '12px/1.4 var(--cth-font-ui)'
};
const btn: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, cursor: 'pointer', border: '1px solid rgba(205, 242, 82, 0.28)',
  background: 'transparent', color: '#CDF252', font: '800 11px/1 var(--cth-font-display)', textTransform: 'lowercase'
};
const primary: React.CSSProperties = { ...btn, background: '#CDF252', color: '#181C17' };
const muted: React.CSSProperties = { color: '#9AA38F', fontSize: 11 };
const input: React.CSSProperties = {
  width: '100%', padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(205, 242, 82, 0.28)',
  background: 'rgba(255,255,255,0.04)', color: '#E6ECDD', font: 'inherit'
};

export function OfficeThemePanel({ namespace, desks, agents, onApplied, onClose }: OfficeThemePanelProps) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [note, setNote] = useState<{ text: string; error?: boolean } | null>(null);
  const [pending, setPending] = useState<{ theme: OfficeTheme; diff: OfficeThemeDiff; path: string } | null>(null);
  const [canUndo, setCanUndo] = useState(() => hasBackup(localStorage, namespace));
  const [copied, setCopied] = useState<'prompt' | 'schema' | null>(null);
  useEffect(() => setCanUndo(hasBackup(localStorage, namespace)), [namespace]);

  const current = useMemo(() => readFurniture(localStorage, namespace) ?? [], [namespace, pending, canUndo]);
  const agentName = (id: string) => agents.find((a) => a.id === id)?.name;

  /** The floor as a theme: desks get a stable id so seats survive the trip. */
  const exportTheme = (): OfficeTheme => {
    let n = 0;
    const items = current.map((it) => (it.type === 'desk_cubicle' && !it.id ? { ...it, id: `desk-${++n}` } : it));
    const seats: Record<string, string> = {};
    for (const [uid, agentId] of Object.entries(desks)) {
      const item = items.find((it) => it._uid === uid);
      const who = agentName(agentId);
      if (item?.id && who) seats[item.id] = who;
    }
    return officeThemeFromFurniture(items, { name: name || t('office.theme.defaultName') }, seats, readScene(localStorage, namespace));
  };

  const doExport = async () => {
    const theme = exportTheme();
    const v = validateOfficeTheme(theme);
    if (!v.ok) return setNote({ text: v.errors.join('; '), error: true });
    const r = await window.cth.officeThemeSave(theme);
    if (r.ok) setNote({ text: t('office.theme.exported', { path: r.path ?? '' }) });
    else if (r.error !== 'cancelled') setNote({ text: r.error ?? t('office.theme.failed'), error: true });
  };

  const doOpen = async () => {
    setNote(null);
    const r = await window.cth.officeThemeOpen();
    if (!r.ok) { if (r.error !== 'cancelled') setNote({ text: r.error, error: true }); return; }
    // Main validated it; validate again here so the renderer never trusts the bridge blindly.
    const v = validateOfficeTheme(r.theme);
    if (!v.ok || !v.theme) return setNote({ text: v.errors.join('; '), error: true });
    setPending({ theme: v.theme, diff: diffOfficeThemes(current, v.theme.items), path: r.path });
  };

  const previewPreset = (id: OfficeThemePresetId) => {
    setNote(null);
    try {
      const theme = buildOfficeThemePreset(id);
      setPending({ theme, diff: diffOfficeThemes(current, theme.items), path: '' });
    } catch (e) {
      setNote({ text: e instanceof Error ? e.message : String(e), error: true });
    }
  };

  const doApply = () => {
    if (!pending) return;
    const before = current;
    const stored: StoredFurniture[] = applyTheme(localStorage, namespace, pending.theme);
    // Seats: theme desk id → new uid → agent matched by NAME (ids differ between installs).
    const seats: Record<string, string> = {};
    for (const [deskId, who] of Object.entries(pending.theme.desks ?? {})) {
      const item = stored.find((it) => it.id === deskId);
      const agent = agents.find((a) => a.name === who);
      if (item && agent) seats[item._uid] = agent.id;
    }
    // A theme without seats keeps everyone at a desk that is still in the same spot.
    if (!pending.theme.desks) {
      for (const [uid, agentId] of Object.entries(desks)) {
        const old = before.find((it) => it._uid === uid);
        const same = old && stored.find((it) => it.type === old.type && it.x === old.x && it.y === old.y);
        if (same) seats[same._uid] = agentId;
      }
    }
    setPending(null);
    setCanUndo(true);
    setNote({ text: t('office.theme.applied', { name: pending.theme.name }) });
    onApplied(seats, 'apply');
  };

  const doUndo = () => {
    const restored = revertTheme(localStorage, namespace);
    setCanUndo(false);
    if (!restored) return setNote({ text: t('office.theme.nothingToUndo'), error: true });
    setNote({ text: t('office.theme.reverted') });
    onApplied({}, 'undo');
  };

  const copy = async (what: 'prompt' | 'schema') => {
    const text = what === 'prompt' ? officeThemePrompt(exportTheme()) : JSON.stringify(officeThemeJsonSchema(), null, 2);
    try { await navigator.clipboard.writeText(text); setCopied(what); setTimeout(() => setCopied(null), 1800); }
    catch { setNote({ text: t('office.theme.copyFailed'), error: true }); }
  };

  const counts = (m: Record<string, number>) => Object.entries(m).map(([type, n]) => `${n} × ${type}`).join(', ');

  return (
    <div style={panel} role="dialog" aria-label={t('office.theme.title')}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong style={{ font: '800 12px/1 var(--cth-font-display)', color: '#CDF252' }}>{t('office.theme.title')}</strong>
        <button type="button" onClick={onClose} style={btn} aria-label={t('common.close')}>×</button>
      </div>
      <p style={{ ...muted, margin: '0 0 10px' }}>{t('office.theme.desc', { count: current.length })}</p>

      {/* Export */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <input value={name} onChange={(e) => setName(e.target.value.slice(0, 80))} placeholder={t('office.theme.namePlaceholder')} aria-label={t('office.theme.namePlaceholder')} style={input} />
        <button type="button" onClick={() => { void doExport(); }} style={primary}>{t('office.theme.export')}</button>
      </div>

      {/* Import + undo */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
        <button type="button" onClick={() => { void doOpen(); }} style={btn}>{t('office.theme.import')}</button>
        <button type="button" onClick={doUndo} disabled={!canUndo} style={{ ...btn, opacity: canUndo ? 1 : 0.45, cursor: canUndo ? 'pointer' : 'not-allowed' }}>{t('office.theme.undo')}</button>
      </div>

      {/* Built-in themes */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ ...muted, marginBottom: 4 }}>{t('office.theme.presetsTitle')}</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {OFFICE_THEME_PRESETS.map((id) => (
            <button key={id} type="button" onClick={() => previewPreset(id)} style={btn}>{t(`office.theme.preset.${id}`)}</button>
          ))}
        </div>
      </div>

      {pending && (
        <div style={{ padding: 10, borderRadius: 8, background: 'rgba(255,255,255,0.04)', marginBottom: 10 }}>
          <div style={{ marginBottom: 6 }}><strong>{pending.theme.name}</strong>{pending.theme.author ? ` · ${pending.theme.author}` : ''}</div>
          {pending.theme.description && <div style={{ ...muted, marginBottom: 6 }}>{pending.theme.description}</div>}
          <div style={{ fontSize: 11, lineHeight: 1.5 }}>
            <div>{t('office.theme.diffTotals', { before: pending.diff.before, after: pending.diff.after })}</div>
            {Object.keys(pending.diff.added).length > 0 && <div>+ {counts(pending.diff.added)}</div>}
            {Object.keys(pending.diff.removed).length > 0 && <div>− {counts(pending.diff.removed)}</div>}
            {pending.diff.changed > 0 && <div>{t('office.theme.diffMoved', { n: pending.diff.changed })}</div>}
            {pending.theme.scene && <div>{t('office.theme.diffScene', { list: Object.entries(pending.theme.scene).map(([k, v]) => `${k} ${String(v)}`).join(', ') })}</div>}
            {pending.theme.desks && <div>{t('office.theme.diffSeats', { n: Object.keys(pending.theme.desks).length })}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
            <button type="button" onClick={doApply} style={primary}>{t('office.theme.apply')}</button>
            <button type="button" onClick={() => setPending(null)} style={btn}>{t('common.cancel')}</button>
          </div>
          <div style={{ ...muted, marginTop: 6 }}>{t('office.theme.backupNote')}</div>
        </div>
      )}

      {/* Ask an AI */}
      <div style={{ borderTop: '1px solid rgba(205, 242, 82, 0.18)', paddingTop: 8 }}>
        <div style={{ marginBottom: 4 }}>{t('office.theme.aiTitle')}</div>
        <p style={{ ...muted, margin: '0 0 6px' }}>{t('office.theme.aiDesc')}</p>
        <div style={{ display: 'flex', gap: 6 }}>
          <button type="button" onClick={() => { void copy('prompt'); }} style={btn}>{copied === 'prompt' ? t('office.theme.copied') : t('office.theme.copyPrompt')}</button>
          <button type="button" onClick={() => { void copy('schema'); }} style={btn}>{copied === 'schema' ? t('office.theme.copied') : t('office.theme.copySchema')}</button>
        </div>
      </div>

      {note && <div style={{ marginTop: 8, fontSize: 11, color: note.error ? '#FF8A80' : '#CDF252', wordBreak: 'break-word' }}>{note.text}</div>}
    </div>
  );
}
