import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import { PixelBadge, type StatusKind } from './PixelBadge';
import { useStore } from '@/store/store';
import { MarkdownPreview } from '@/markdown/MarkdownPreview';
import { isComposingKey } from '@shared/imeGuard';
import { useRtl } from '@/i18n/useDirection';
import { canOpenWithSystemApp, type Delivery, type DeliveryFile, type DeliveryStatus } from '@shared/delivery';

/**
 * DELIVERIES — the human's tray of finished files (HTML, Markdown, PDF, DOCX,
 * images…). An agent delivers by sending a "done" message with `attachments`;
 * the router snapshots the files into <hive>/deliveries/<id>/ (see
 * src/shared/delivery.ts). Here the human previews them and closes the loop:
 *   - approve: marks the delivery approved and tells the agent;
 *   - request changes: marks it and mails the agent the feedback, in the same
 *     conversation, so the next version comes back as a new delivery.
 * HTML previews in a sandboxed frame with scripts off; "Open" shows the real
 * thing in its default app.
 */

const POLL_MS = 5000;

type Preview =
  | { state: 'loading' }
  | { state: 'error' }
  | { state: 'ready'; kind: string; size: number; text?: string; dataUrl?: string; tooLarge?: boolean };

const STATUS_BADGE: Record<DeliveryStatus, StatusKind> = {
  new: 'waiting',
  seen: 'idle',
  approved: 'success',
  changes: 'blocked'
};

function formatSize(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function DeliveriesTab() {
  const { t } = useTranslation();
  const rtl = useRtl();
  const agents = useStore((s) => s.agents);
  const restorable = useStore((s) => s.restorableAgents);
  const [items, setItems] = useState<Delivery[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview>({ state: 'loading' });
  const [feedback, setFeedback] = useState('');
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveNote, setSaveNote] = useState('');
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refresh = useCallback(async () => {
    try { setItems(await window.cth.hiveDeliveries()); } catch { /* keep last good */ }
  }, []);

  useEffect(() => {
    void refresh();
    timer.current = setInterval(refresh, POLL_MS);
    const off = window.cth.onHiveDelivery(() => { void refresh(); });
    return () => { if (timer.current) clearInterval(timer.current); off(); };
  }, [refresh]);

  const selected = useMemo(
    () => items.find((d) => d.id === selectedId) ?? items[0] ?? null,
    [items, selectedId]
  );
  const file: DeliveryFile | null = selected
    ? (selected.files.find((f) => f.name === fileName) ?? selected.files[0] ?? null)
    : null;

  // Opening a delivery marks it seen (never downgrades approved/changes).
  useEffect(() => {
    if (!selected || selected.status !== 'new') return;
    void window.cth.hiveDeliverySetStatus(selected.id, 'seen').then((r) => {
      if (r.ok && r.delivery) setItems((list) => list.map((d) => (d.id === r.delivery!.id ? r.delivery! : d)));
    });
  }, [selected?.id, selected?.status]);

  useEffect(() => {
    let live = true;
    if (!selected || !file) return;
    setPreview({ state: 'loading' });
    void window.cth.hiveDeliveryRead(selected.id, file.name).then((r) => {
      if (!live) return;
      setPreview(r.ok ? { state: 'ready', kind: r.kind, size: r.size, text: r.text, dataUrl: r.dataUrl, tooLarge: r.tooLarge } : { state: 'error' });
    }).catch(() => { if (live) setPreview({ state: 'error' }); });
    return () => { live = false; };
  }, [selected?.id, file?.name]);

  const nameFor = (id: string): string =>
    id === 'human' ? t('deliveries.you') : (agents.find((a) => a.id === id)?.name ?? restorable.find((a) => a.id === id)?.name ?? id);

  const replaceItem = (d?: Delivery) => { if (d) setItems((list) => list.map((x) => (x.id === d.id ? d : x))); };

  const saveCopy = async () => {
    if (!selected || !file || busy) return;
    setBusy(true);
    setSaveNote('');
    try {
      const result = await window.cth.hiveDeliverySave(selected.id, file.name);
      if (result.ok && result.path) setSaveNote(t('deliveries.savedTo', { path: result.path }));
      else if (!result.canceled) setSaveNote(t('deliveries.saveFailed', { error: result.error ?? t('deliveries.unknownError') }));
    } catch (e) {
      setSaveNote(t('deliveries.saveFailed', { error: e instanceof Error ? e.message : String(e) }));
    } finally { setBusy(false); }
  };

  const approve = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const r = await window.cth.hiveDeliverySetStatus(selected.id, 'approved');
      if (r.ok) {
        replaceItem(r.delivery);
        await window.cth.hiveSend({
          to: selected.from,
          act: 'inform',
          conversation: selected.conversation,
          in_reply_to: selected.id,
          subject: `Approved: ${selected.subject}`,
          body: `The human approved your delivery "${selected.subject}" (${selected.files.map((f) => f.name).join(', ')}). No further changes needed.`
        }, 'human');
      }
    } finally { setBusy(false); }
  };

  const requestChanges = async () => {
    const text = feedback.trim();
    if (!selected || !text || busy) return;
    setBusy(true);
    try {
      const r = await window.cth.hiveDeliverySetStatus(selected.id, 'changes', text);
      if (r.ok) {
        replaceItem(r.delivery);
        await window.cth.hiveSend({
          to: selected.from,
          act: 'request',
          conversation: selected.conversation,
          in_reply_to: selected.id,
          subject: `Changes requested: ${selected.subject}`,
          body: [
            `The human reviewed your delivery "${selected.subject}" (${selected.files.map((f) => f.name).join(', ')}) and asked for changes:`,
            '',
            text,
            '',
            'Update the file(s) and deliver again (a "done" message with "attachments") in this same conversation.'
          ].join('\n')
        }, 'human');
        setFeedback('');
        setAsking(false);
      }
    } finally { setBusy(false); }
  };

  const newCount = items.filter((d) => d.status === 'new').length;

  if (!items.length) {
    return (
      <div style={{ flex: 1, overflowY: 'auto', background: 'var(--cth-paper-200)', padding: 24, textAlign: 'center', color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-mono)', fontSize: 13 }}>
        {t('deliveries.emptyTitle')}<br />
        <span style={{ fontSize: 12, color: 'var(--cth-ink-300)' }}>{t('deliveries.emptySub')}</span>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--cth-paper-200)', fontFamily: 'var(--cth-font-mono)' }}>
      {/* list */}
      <div style={{ width: 260, flexShrink: 0, overflowY: 'auto', boxShadow: 'inset -1px 0 0 var(--cth-ink-100)' }}>
        <div style={{ padding: '8px 10px', fontSize: 11, color: 'var(--cth-ink-500)' }}>
          {t('deliveries.count', { count: items.length })}{newCount ? ` · ${t('deliveries.newCount', { count: newCount })}` : ''}
        </div>
        {items.map((d) => {
          const active = selected?.id === d.id;
          return (
            <button
              key={d.id}
              onClick={() => { setSelectedId(d.id); setFileName(null); setAsking(false); setSaveNote(''); }}
              style={{
                display: 'block', width: '100%', textAlign: 'start', border: 'none', cursor: 'pointer',
                padding: '8px 10px', background: active ? 'var(--cth-paper-100)' : 'transparent',
                boxShadow: active ? 'inset 3px 0 0 var(--cth-ink-900)' : 'inset 0 -1px 0 var(--cth-ink-100)',
                fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink-900)'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, fontWeight: d.status === 'new' ? 700 : 400 }}>
                  {d.subject || d.files[0]?.name}
                </span>
                <PixelBadge status={STATUS_BADGE[d.status]} label={t(`deliveries.status.${d.status}`)} />
              </div>
              <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginTop: 2 }}>
                {nameFor(d.from)} · {t('deliveries.files', { count: d.files.length })} · {new Date(d.createdAt).toLocaleString()}
              </div>
            </button>
          );
        })}
      </div>

      {/* detail */}
      {selected && (
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', boxShadow: 'inset 0 -1px 0 var(--cth-ink-100)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 15, color: 'var(--cth-ink-900)' }}>{selected.subject}</div>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
              {t('deliveries.fromTo', { from: nameFor(selected.from), to: selected.to === 'human' ? t('deliveries.you') : nameFor(selected.to) })}
            </div>
            {selected.note && (
              <div dir={rtl ? 'auto' : undefined} style={{ fontSize: 13, color: 'var(--cth-ink-700)', maxHeight: 90, overflowY: 'auto' }}>
                <MarkdownPreview source={selected.note.split('\n\n📦')[0]} variant="card" />
              </div>
            )}
            {selected.skipped.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--cth-coral)' }}>
                {t('deliveries.skipped', { list: selected.skipped.map((s) => `${s.path} (${t(`deliveries.reason.${s.reason}`)})`).join(', ') })}
              </div>
            )}
            {selected.status === 'changes' && selected.feedback && (
              <div style={{ fontSize: 12, color: 'var(--cth-ink-700)' }}>{t('deliveries.yourFeedback')}: {selected.feedback}</div>
            )}
            {/* file chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selected.files.map((f) => (
                <button
                  key={f.name}
                  onClick={() => { setFileName(f.name); setSaveNote(''); }}
                  title={`${f.name} · ${formatSize(f.size)}`}
                  style={{
                    border: 'none', cursor: 'pointer', padding: '3px 8px', fontSize: 12,
                    fontFamily: 'var(--cth-font-mono)',
                    background: file?.name === f.name ? 'var(--cth-ink-900)' : 'var(--cth-cream-200)',
                    color: file?.name === f.name ? 'var(--cth-cream-100)' : 'var(--cth-ink-900)'
                  }}
                >
                  {f.name}
                </button>
              ))}
            </div>
          </div>

          {/* preview */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--cth-paper-100)', margin: 8, boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
            {file && preview.state === 'loading' && <Note>{t('deliveries.loading')}</Note>}
            {file && preview.state === 'error' && <Note>{t('deliveries.previewError')}</Note>}
            {file && preview.state === 'ready' && (
              preview.tooLarge ? <Note>{t('deliveries.tooLarge', { size: formatSize(preview.size) })}</Note>
                : preview.kind === 'html' && preview.text != null ? (
                  // sandbox="" = no scripts, no forms, no navigation, opaque origin.
                  <iframe title={file.name} sandbox="" srcDoc={preview.text} style={{ width: '100%', height: '100%', minHeight: 360, border: 'none', background: '#fff' }} />
                ) : preview.kind === 'markdown' && preview.text != null ? (
                  <div dir={rtl ? 'auto' : undefined} style={{ padding: 16 }}><MarkdownPreview source={preview.text} /></div>
                ) : preview.kind === 'text' && preview.text != null ? (
                  <pre style={{ margin: 0, padding: 12, fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{preview.text}</pre>
                ) : preview.kind === 'image' && preview.dataUrl ? (
                  <div style={{ padding: 12, textAlign: 'center' }}><img src={preview.dataUrl} alt={file.name} style={{ maxWidth: '100%' }} /></div>
                ) : (
                  <Note>{t('deliveries.noPreview', { name: file.name })}</Note>
                )
            )}
          </div>

          {/* actions */}
          <div style={{ padding: '0 8px 8px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('deliveries.storageNote')}</div>
            {saveNote && <div role="status" style={{ fontSize: 11, color: 'var(--cth-ink-700)', overflowWrap: 'anywhere' }}>{saveNote}</div>}
            {asking && (
              <textarea
                dir={rtl ? 'auto' : undefined}
                autoFocus
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                onKeyDown={(e) => { if (isComposingKey(e)) return; if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void requestChanges(); }}
                rows={3}
                placeholder={t('deliveries.feedbackPlaceholder')}
                style={{ width: '100%', resize: 'vertical', fontFamily: 'var(--cth-font-mono)', fontSize: 13, padding: 6, boxSizing: 'border-box' }}
              />
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {file && (
                <PixelButton size="sm" variant="primary" onClick={() => { void saveCopy(); }} disabled={busy}>
                  {t('deliveries.saveCopy')}
                </PixelButton>
              )}
              {file && (
                <PixelButton size="sm" variant="secondary" onClick={() => void window.cth.hiveDeliveryOpen(selected.id, file.name)}
                  title={canOpenWithSystemApp(file.name) ? t('deliveries.openTitle') : t('deliveries.revealOnlyTitle')}>
                  {canOpenWithSystemApp(file.name) ? t('deliveries.open') : t('deliveries.showInFolder')}
                </PixelButton>
              )}
              <PixelButton size="sm" variant="secondary" onClick={() => void window.cth.hiveDeliveryReveal(selected.id, file?.name)}>
                {t('deliveries.showInFolder')}
              </PixelButton>
              <span style={{ flex: 1 }} />
              {asking ? (
                <>
                  <PixelButton size="sm" variant="secondary" onClick={() => setAsking(false)}>{t('deliveries.cancel')}</PixelButton>
                  <PixelButton size="sm" onClick={() => void requestChanges()} disabled={busy || !feedback.trim()}>{t('deliveries.sendChanges')}</PixelButton>
                </>
              ) : (
                <>
                  <PixelButton size="sm" variant="secondary" onClick={() => setAsking(true)} disabled={busy}>{t('deliveries.requestChanges')}</PixelButton>
                  <PixelButton size="sm" onClick={() => void approve()} disabled={busy || selected.status === 'approved'}>
                    {selected.status === 'approved' ? t('deliveries.approved') : t('deliveries.approve')}
                  </PixelButton>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: 24, textAlign: 'center', fontSize: 13, color: 'var(--cth-ink-500)' }}>{children}</div>;
}
