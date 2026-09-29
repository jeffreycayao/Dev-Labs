/** Signed-in account summary in Settings. */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useLicenseStatus } from '@/hooks/useLicenseStatus';
import { PixelButton } from './PixelButton';

export function AccountSection() {
  const { t } = useTranslation();
  const status = useLicenseStatus();
  const [busy, setBusy] = useState(false);
  if (!status?.enforced || status.state !== 'licensed') return null;
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); } catch { /* status push covers it */ }
    finally { setBusy(false); }
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 10, color: 'var(--cth-ink-900)' }}>
        {t('license.account.title')}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <div style={{ fontSize: 12.5, color: 'var(--cth-ink-900)' }}>{status.email ?? status.name ?? ''}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--cth-ink-700)' }}>{t('license.account.free')}</div>
        </div>
        <PixelButton variant="secondary" size="sm" disabled={busy} onClick={() => act(() => window.cth.accountOpen())}>
          {t('license.manageAccount')}
        </PixelButton>
        <PixelButton variant="ghost" size="sm" disabled={busy} onClick={() => act(() => window.cth.licenseSignOut())}>
          {t('license.signOut')}
        </PixelButton>
      </div>
    </div>
  );
}
