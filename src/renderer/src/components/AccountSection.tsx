/**
 * Settings → General → "Account": who is signed in, the plan, where the trial
 * or billing period stands, and the two actions that belong here — manage
 * billing (Stripe Customer Portal) and sign out.
 *
 * Renders nothing when licensing is not enforced, so builds without the gate
 * look exactly as they did before.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { daysUntil } from '@shared/license';
import { useLicenseStatus } from '@/hooks/useLicenseStatus';
import { PixelButton } from './PixelButton';

export function AccountSection() {
  const { t, i18n } = useTranslation();
  const status = useLicenseStatus();
  const [busy, setBusy] = useState(false);
  if (!status?.enforced || status.state !== 'licensed') return null;

  const fmt = (ms: number | undefined) =>
    typeof ms === 'number' ? new Date(ms).toLocaleDateString(i18n.language, { dateStyle: 'medium' }) : '';
  const now = Date.now();

  let line: string;
  let warn = false;
  if (status.subscription === 'trialing') {
    line = t('license.account.trialing', { date: fmt(status.trialEndsAt), days: daysUntil(status.trialEndsAt, now) ?? 0 });
  } else if (status.subscription === 'past_due') {
    line = t('license.account.pastDue');
    warn = true;
  } else if (status.cancelAtPeriodEnd) {
    line = t('license.account.cancels', { date: fmt(status.periodEndsAt) });
    warn = true;
  } else {
    line = status.periodEndsAt ? t('license.account.renews', { date: fmt(status.periodEndsAt) }) : t('license.account.active');
  }

  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch { /* status push covers it */ } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, color: 'var(--cth-ink-900)' }}>
        {t('license.account.title')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12.5, color: 'var(--cth-ink-900)' }}>
            {status.email ?? status.name ?? ''}
            {status.plan && (
              <span style={{
                marginInlineStart: 8, fontFamily: 'var(--cth-font-mono)', fontSize: 9, letterSpacing: '.12em',
                textTransform: 'uppercase', padding: '2px 7px', background: 'var(--cth-mint-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-mint)'
              }}>{status.plan}</span>
            )}
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: warn ? 'var(--cth-coral)' : 'var(--cth-ink-700)' }}>{line}</div>
        </div>
        <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => act(() => window.cth.licenseOpenBilling('portal'))}>
          {t('license.manageBilling')}
        </PixelButton>
        <PixelButton variant="ghost" size="sm" disabled={busy} onClick={() => act(() => window.cth.licenseSignOut())}>
          {t('license.signOut')}
        </PixelButton>
      </div>
    </div>
  );
}
