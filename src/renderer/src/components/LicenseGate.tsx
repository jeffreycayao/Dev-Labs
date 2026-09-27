/**
 * LicenseGate — the full-screen sign-in / subscribe screen shown instead of the
 * app while licensing is enforced and this install is not entitled.
 *
 * It is the FRIENDLY half of the paywall. The real check is in main
 * (spawnAgentCore refuses to start any agent), so hiding this screen from
 * devtools unlocks nothing.
 *
 * Every action happens in the system browser (Google/Yahoo sign-in on
 * auth.labs.atmt.dev, card entry on Stripe Checkout); this screen only starts
 * those and reflects what main reports back.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { LicenseStatus } from '@shared/license';
import { PixelPanel } from './PixelPanel';
import { PixelButton } from './PixelButton';
import brandLogo from '@brand/logo.png?url';
import { LICENSING } from '@shared/brand';

export interface LicenseGateProps {
  status: LicenseStatus;
}

export function LicenseGate({ status }: LicenseGateProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown> | undefined) => {
    setBusy(true);
    try { await fn(); } catch { /* main pushes the resulting status */ } finally { setBusy(false); }
  };
  const signIn = (hint: 'signin' | 'signup') => run(() => window.cth.licenseSignIn(hint));
  const startTrial = () => run(() => window.cth.licenseOpenBilling('checkout'));
  const manageBilling = () => run(() => window.cth.licenseOpenBilling('portal'));
  const refresh = () => run(() => window.cth.licenseRefresh());
  const signOut = () => run(() => window.cth.licenseSignOut());
  const cancel = () => run(() => window.cth.licenseCancelSignIn());

  // Unlock codes (free vouchers). Needs a signed-in account to attach to.
  const [codeOpen, setCodeOpen] = useState(false);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const redeem = () => run(async () => {
    setCodeError(null);
    const r = await window.cth.licenseRedeem(code);
    if (!r.ok) setCodeError(t(`license.errors.${r.error ?? 'server_error'}`));
  });

  const { state } = status;
  const needsPayment = state === 'inactive' && status.purchase === 'payment_required';
  const canTrial = state === 'inactive' && (status.purchase === 'none' || !status.purchase);
  const title =
    state === 'signing_in' ? t('license.waitingTitle')
    : needsPayment ? t('license.completeTitle')
    : state === 'inactive' ? t('license.inactiveTitle')
    : state === 'offline_expired' ? t('license.offlineTitle')
    : state === 'error' ? t('license.errorTitle')
    : t('license.title');

  const errorText = status.error ? t(`license.errors.${status.error}`) : null;

  return (
    <div style={{
      position: 'fixed', inset: 0,
      background: 'var(--cth-cream-200)',
      backgroundImage: 'repeating-linear-gradient(45deg, rgba(232, 217, 160, 0.4) 0 1px, transparent 1px 8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 300, padding: 32
    }}>
      <div style={{ width: 520, maxWidth: '94vw' }}>
        <PixelPanel variant="dialog" title={title} noPadding>
          <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <img src={brandLogo} alt="ATMT Labs" style={{ height: 40, width: 'auto', alignSelf: 'flex-start' }} />

            {status.email && state !== 'signed_out' && (
              <div style={{ fontFamily: 'var(--cth-font-mono)', fontSize: 11, color: 'var(--cth-ink-500)' }}>
                {t('license.signedInAs', { email: status.email })}
              </div>
            )}

            <p style={{ margin: 0, fontSize: 12.5, lineHeight: '19px', color: 'var(--cth-ink-700)' }}>
              {state === 'signing_in' ? t('license.waitingBody')
                : needsPayment ? t('license.completeBody')
                : state === 'inactive' ? t('license.inactiveBody')
                : state === 'offline_expired' ? t('license.offlineBody')
                : state === 'error' ? t('license.errorBody')
                : t('license.intro')}
            </p>

            {errorText && (
              <div role="alert" style={{
                padding: '6px 10px', background: 'var(--cth-coral-light)',
                boxShadow: 'inset 0 0 0 1px var(--cth-coral)', fontSize: 12, color: 'var(--cth-ink-900)'
              }}>{errorText}</div>
            )}

            {state === 'signed_out' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <PixelButton variant="primary" size="lg" fullWidth disabled={busy} onClick={() => signIn('signup')}>
                  {t('license.startTrial')}
                </PixelButton>
                <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-500)', textAlign: 'center' }}>
                  {t('license.trialNote')}
                </div>
                <PixelButton variant="secondary" size="md" fullWidth disabled={busy} onClick={() => signIn('signin')}>
                  {t('license.signIn')}
                </PixelButton>
              </div>
            )}

            {state === 'signing_in' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <PixelButton variant="ghost" size="md" disabled={busy} onClick={cancel}>{t('license.cancel')}</PixelButton>
                <PixelButton variant="secondary" size="md" disabled={busy} onClick={() => signIn('signin')}>
                  {t('license.reopen')}
                </PixelButton>
              </div>
            )}

            {state === 'inactive' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* The server picks trial vs. one-time purchase; the label just says which. */}
                <PixelButton variant="primary" size="lg" fullWidth disabled={busy} onClick={startTrial}>
                  {needsPayment ? t('license.completePurchase') : canTrial ? t('license.startTrial') : t('license.buyLicense')}
                </PixelButton>
                {canTrial && (
                  <div style={{ fontSize: 11, lineHeight: '16px', color: 'var(--cth-ink-500)', textAlign: 'center' }}>
                    {t('license.trialNote')}
                  </div>
                )}
                {!codeOpen ? (
                  <button
                    onClick={() => setCodeOpen(true)}
                    style={{ alignSelf: 'center', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--cth-ink-700)', textDecoration: 'underline' }}
                  >{t('license.haveCode')}</button>
                ) : (
                  <form
                    data-testid="license-redeem"
                    onSubmit={(e) => { e.preventDefault(); if (code.trim()) redeem(); }}
                    style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
                  >
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        autoFocus value={code} onChange={(e) => setCode(e.target.value)} maxLength={64}
                        placeholder="ATMT-XXXXX-XXXXX-XXXXX-XXXXX" spellCheck={false} aria-label={t('license.haveCode')}
                        style={{
                          flex: 1, minWidth: 0, padding: '6px 8px 4px', border: 'none', outline: 'none',
                          background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
                          fontFamily: 'var(--cth-font-mono)', fontSize: 13, color: 'var(--cth-ink-900)'
                        }}
                      />
                      <PixelButton variant="primary" size="sm" disabled={busy || !code.trim()} onClick={() => { if (code.trim()) redeem(); }}>
                        {t('license.redeem')}
                      </PixelButton>
                    </div>
                    <div style={{ fontSize: 11, lineHeight: '16px', color: codeError ? 'var(--cth-coral)' : 'var(--cth-ink-500)' }} role={codeError ? 'alert' : undefined}>
                      {codeError ?? t('license.codeNote')}
                    </div>
                  </form>
                )}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                  <PixelButton variant="ghost" size="sm" disabled={busy} onClick={signOut}>{t('license.signOut')}</PixelButton>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <PixelButton variant="secondary" size="sm" disabled={busy} onClick={manageBilling}>{t('license.manageAccount')}</PixelButton>
                    <PixelButton variant="secondary" size="sm" disabled={busy} onClick={refresh}>
                      {busy ? t('license.checking') : t('license.checkAgain')}
                    </PixelButton>
                  </div>
                </div>
              </div>
            )}

            {state === 'error' && status.error !== 'misconfigured' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <PixelButton variant="ghost" size="sm" disabled={busy} onClick={signOut}>{t('license.signOut')}</PixelButton>
                <div style={{ display: 'flex', gap: 8 }}>
                  <PixelButton variant="secondary" size="sm" disabled={busy} onClick={manageBilling}>{t('license.manageAccount')}</PixelButton>
                  <PixelButton variant="primary" size="sm" disabled={busy} onClick={refresh}>
                    {busy ? t('license.checking') : t('license.retry')}
                  </PixelButton>
                </div>
              </div>
            )}

            {state === 'offline_expired' && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between', flexWrap: 'wrap' }}>
                <PixelButton variant="ghost" size="sm" disabled={busy} onClick={signOut}>{t('license.signOut')}</PixelButton>
                <PixelButton variant="primary" size="md" disabled={busy} onClick={refresh}>
                  {busy ? t('license.checking') : t('license.retry')}
                </PixelButton>
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', textAlign: 'center' }}>
              {t('license.legalPrefix')}{' '}
              <a href="#" onClick={(e) => { e.preventDefault(); void window.cth.openExternal(`${LICENSING.siteOrigin}/terms`); }} style={{ color: 'inherit' }}>{t('license.terms')}</a>
              {' · '}
              <a href="#" onClick={(e) => { e.preventDefault(); void window.cth.openExternal(`${LICENSING.siteOrigin}/privacy`); }} style={{ color: 'inherit' }}>{t('license.privacy')}</a>
            </div>
          </div>
        </PixelPanel>
      </div>
    </div>
  );
}
