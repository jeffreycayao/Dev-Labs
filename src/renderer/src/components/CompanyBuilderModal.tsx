/**
 * Company builder (ported from Claw3D): describe a company, let the planner LLM
 * propose a team, preview it, then hand it to the normal floor review. This
 * modal never spawns anyone — "Review & hire" opens FloorImportModal, where the
 * human picks a folder and clicks "Hire all" (or reviews one by one).
 */
import { useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import { SpritePortrait } from './SpritePortrait';
import { OFFICE_CAST, type OfficeCharacterName } from '@/scene/office/cast';
import type { FloorImportPayload } from './FloorModals';
import { COMPANY_MAX_DESCRIPTION } from '@shared/office/companyBuilder';

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
  fontSize: 14, color: 'var(--cth-ink-900)', outline: 'none', resize: 'vertical'
};

// Ramon ('michael') is the orchestrator's sprite; hires get the rest of the cast.
const HIRE_CAST: OfficeCharacterName[] = OFFICE_CAST.map(c => c.name).filter(n => n !== 'michael');

export interface CompanyBuilderModalProps {
  onClose: () => void;
  /** Open the existing floor review with the planned team. */
  onReview: (payload: FloorImportPayload) => void;
}

export function CompanyBuilderModal({ onClose, onReview }: CompanyBuilderModalProps) {
  const { t: tr } = useTranslation();
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [plan, setPlan] = useState<FloorImportPayload>();

  const generate = async () => {
    if (!description.trim()) { setError(tr('company.errEmpty')); return; }
    setError(undefined);
    setBusy(true);
    try {
      const res = await window.cth.companyBuilderGenerate(description);
      if (!res.ok) { setError(res.error); return; }
      const hires = res.floor.hires.map((h, i) => ({ ...h, character: h.character ?? HIRE_CAST[i % HIRE_CAST.length] }));
      setPlan({ floor: { ...res.floor, hires }, consentRequired: res.consentRequired });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const review = () => {
    if (!plan) return;
    onReview(plan);
    onClose();
  };

  return (
    <div onClick={busy ? undefined : onClose} style={overlay}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 720, maxWidth: '95vw' }}>
        <PixelPanel variant="dialog" title={tr('company.title')} noPadding>
          <div data-testid="company-builder" style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, maxHeight: '86vh', overflowY: 'auto' }}>
            <div style={box}>{tr('company.intro')}</div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={label}>{tr('company.describeLabel')}</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder={tr('company.describePlaceholder')}
                maxLength={COMPANY_MAX_DESCRIPTION}
                rows={5}
                disabled={busy}
                style={input}
              />
            </label>

            {busy && <div style={box}>{tr('company.generating')}</div>}
            {error && <div role="alert" style={{ ...box, color: 'var(--cth-coral)' }}>{error}</div>}

            {plan && !busy && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={box}>
                  <div style={{ fontSize: 16, fontWeight: 600 }}>{plan.floor.name}</div>
                  {plan.floor.description && <div style={{ marginTop: 4 }}>{plan.floor.description}</div>}
                  <div style={{ marginTop: 6, color: 'var(--cth-ink-700)' }}>{tr('company.teamCount', { count: plan.floor.hires.length })}</div>
                </div>
                {plan.floor.hires.map(m => (
                  <div key={m.name} style={{ ...box, display: 'flex', gap: 10, alignItems: 'flex-start', background: 'var(--cth-paper-100)' }}>
                    <SpritePortrait character={m.character as OfficeCharacterName} scale={1} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div><strong>{m.name}</strong>{m.description ? <> — {m.description}</> : null}</div>
                      {m.goal && <div style={{ color: 'var(--cth-ink-700)', marginTop: 2, whiteSpace: 'pre-wrap' }}>{m.goal}</div>}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <PixelButton variant="ghost" size="md" onClick={onClose} disabled={busy}>{tr('common.cancel')}</PixelButton>
              <div style={{ flex: 1 }} />
              <PixelButton variant={plan ? 'secondary' : 'primary'} size="md" onClick={generate} disabled={busy || !description.trim()}>
                {plan ? tr('company.regenerate') : tr('company.generate')}
              </PixelButton>
              {plan && (
                <PixelButton variant="primary" size="md" onClick={review} disabled={busy}>{tr('company.review')}</PixelButton>
              )}
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
