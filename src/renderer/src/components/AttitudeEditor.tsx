/**
 * Settings → Agents & Models → "How agents talk to you": the editor for the
 * user's personal ATTITUDE.md. Saves straight to the file (not staged with the
 * rest of Settings) and shows the exact block every new agent receives.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ATTITUDE_MAX_CHARS, attitudePromptBlock, normalizeAttitude } from '@shared/attitude';
import { PixelButton } from './PixelButton';

export function AttitudeEditor({ enabled }: { enabled: boolean }) {
  const { t } = useTranslation();
  const [text, setText] = useState('');
  const [saved, setSaved] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    void window.cth.attitudeGet?.().then((v) => { setText(v); setSaved(v); }).catch(() => { /* older main */ });
  }, []);

  const dirty = normalizeAttitude(text) !== saved;
  const save = async () => {
    setBusy(true);
    try {
      const r = await window.cth.attitudeSet(text);
      if (r.ok) { setText(r.text); setSaved(r.text); setNote(r.text ? t('settings.attitude.savedNote') : t('settings.attitude.clearedNote')); }
      else setNote(r.error);
    } finally {
      setBusy(false);
      setTimeout(() => setNote(''), 3000);
    }
  };

  const block = attitudePromptBlock(text);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
        {t('settings.attitude.desc')}
      </span>
      {!enabled && (
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--cth-coral)' }}>{t('settings.attitude.switchedOff')}</span>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, ATTITUDE_MAX_CHARS))}
        placeholder={t('settings.attitude.placeholder')}
        aria-label={t('settings.attitude.title')}
        rows={7}
        spellCheck={false}
        style={{
          width: '100%', resize: 'vertical', padding: 8, fontSize: 12, lineHeight: '17px',
          fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink-900)', background: 'var(--cth-paper-100)',
          border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
        }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <PixelButton variant="primary" size="sm" onClick={() => { void save(); }} disabled={busy || !dirty}>
          {busy ? t('common.saving') : t('settings.attitude.save')}
        </PixelButton>
        <PixelButton variant="secondary" size="sm" onClick={() => setPreview((p) => !p)} disabled={!block}>
          {preview ? t('settings.attitude.hidePreview') : t('settings.attitude.showPreview')}
        </PixelButton>
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
          {t('settings.attitude.count', { n: normalizeAttitude(text).length, max: ATTITUDE_MAX_CHARS })}
        </span>
        {note && <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{note}</span>}
      </div>
      {preview && block && (
        <pre style={{
          margin: 0, padding: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontSize: 11, lineHeight: '15px',
          fontFamily: 'var(--cth-font-mono)', color: 'var(--cth-ink-700)', background: 'var(--cth-cream-100)',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)'
        }}>{block}</pre>
      )}
      <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('settings.attitude.appliesNext')}</span>
    </div>
  );
}
