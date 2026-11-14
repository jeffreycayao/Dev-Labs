import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { ResourceUsage } from '@shared/resourceUsage';

/** Settings → General → Resource use. Polls only while it is on screen. */
const POLL_MS = 5_000;

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 10, lineHeight: '14px', color: 'var(--cth-ink-900)'
};

const gb = (mb: number): string => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`);

export function ResourceUsageSettings() {
  const { t } = useTranslation();
  const [usage, setUsage] = useState<ResourceUsage | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let first = true;
    const tick = async () => {
      try {
        const u = await window.cth.resourceUsage();
        if (alive) { setUsage(u); setFailed(false); }
      } catch {
        if (alive) setFailed(true);
      }
      // A first sample has no CPU rate yet, so take the second one soon.
      if (alive) timer = setTimeout(() => { void tick(); }, first ? 1_500 : POLL_MS);
      first = false;
    };
    void tick();
    return () => { alive = false; if (timer) clearTimeout(timer); };
  }, []);

  const cpu = usage?.cpuPct == null ? '…' : `${usage.cpuPct}%`;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={labelStyle}>{t('settings.resources.title')}</div>
      <p style={{ margin: 0, fontSize: 13, lineHeight: '20px', color: 'var(--cth-ink-700)' }}>
        {failed && !usage
          ? t('settings.resources.unavailable')
          : usage
            ? t('settings.resources.summary', { cpu, mem: gb(usage.memMB), procs: usage.procs })
            : t('settings.resources.loading')}
      </p>
      {usage && usage.agents.length > 0 && (
        <table style={{ fontSize: 12, borderCollapse: 'collapse', color: 'var(--cth-ink-700)' }}>
          <thead>
            <tr style={{ textAlign: 'start', color: 'var(--cth-ink-500)' }}>
              <th style={{ textAlign: 'start', fontWeight: 600, padding: '2px 8px 2px 0' }}>{t('settings.resources.agent')}</th>
              <th style={{ textAlign: 'end', fontWeight: 600, padding: '2px 8px' }}>{t('settings.resources.processes')}</th>
              <th style={{ textAlign: 'end', fontWeight: 600, padding: '2px 8px' }}>{t('settings.resources.memory')}</th>
              <th style={{ textAlign: 'end', fontWeight: 600, padding: '2px 0 2px 8px' }}>{t('settings.resources.cpu')}</th>
            </tr>
          </thead>
          <tbody>
            {usage.agents.map((a) => (
              <tr key={a.id}>
                <td style={{ padding: '2px 8px 2px 0' }}>{a.name}</td>
                <td style={{ textAlign: 'end', padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>{a.procs}</td>
                <td style={{ textAlign: 'end', padding: '2px 8px', fontVariantNumeric: 'tabular-nums' }}>{gb(a.memMB)}</td>
                <td style={{ textAlign: 'end', padding: '2px 0 2px 8px', fontVariantNumeric: 'tabular-nums' }}>{usage.cpuPct == null ? '…' : `${a.cpuPct}%`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>{t('settings.resources.note')}</span>
    </div>
  );
}
