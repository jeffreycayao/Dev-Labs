// Office ATM: PIN-locked cost & usage dashboard (ported from Claw3D). Data comes
// from the local cost ledger through window.cth.officeUsageAnalytics.
import { Check, Landmark, Lock, RefreshCw, Wallet } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import {
  type OfficeUsageAnalyticsParams,
  useOfficeUsageAnalyticsViewModel,
} from '@/features/office/hooks/useOfficeUsageAnalyticsViewModel';
import { formatCurrency, formatNumber, toDateInputValue } from '@/lib/office/usageAnalyticsPresentation';

// shortcut: the PIN is a soft privacy lock kept in plain localStorage, not security;
// clearing site data resets it. Upgrade to safeStorage via main if it must protect anything.
const PIN_STORAGE_KEY = 'devlabs.atm.pin';

const readPin = (): string | null => {
  try {
    return window.localStorage.getItem(PIN_STORAGE_KEY);
  } catch {
    return null;
  }
};

export function AtmImmersiveScreen(props: OfficeUsageAnalyticsParams) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pinMode] = useState<'setup' | 'verify'>(() => (readPin() ? 'verify' : 'setup'));
  const [inputPin, setInputPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data, loading, error: loadError, lastRefreshedAt, refresh, startDate, endDate, setStartDate, setEndDate } =
    useOfficeUsageAnalyticsViewModel(props);

  const handlePinSubmit = () => {
    if (inputPin.length < 4) {
      setError('The PIN needs at least 4 digits.');
      return;
    }
    if (pinMode === 'setup') {
      try {
        window.localStorage.setItem(PIN_STORAGE_KEY, inputPin);
      } catch {
        /* still let them in this time */
      }
      setIsAuthenticated(true);
      setError(null);
    } else if (inputPin === readPin()) {
      setIsAuthenticated(true);
      setError(null);
    } else {
      setError('Wrong PIN. Try again.');
      setInputPin('');
    }
  };

  const handleKeyPad = (key: string) => {
    setError(null);
    if (key === 'clear') setInputPin('');
    else if (key === 'submit') handlePinSubmit();
    else if (inputPin.length < 6) setInputPin((prev) => prev + key);
  };

  const totals = data?.totals;
  const days = data?.byDay ?? [];
  const recentCostDaily = useMemo(() => days.slice(-7), [days]);
  const chartMax = useMemo(() => recentCostDaily.reduce((max, d) => Math.max(max, d.totals.totalCost), 0), [recentCostDaily]);
  const activeDays = useMemo(() => [...days].reverse().filter((d) => d.totals.totalTokens > 0 || d.totals.totalCost > 0), [days]);
  const sessions = data?.sessions ?? 0;
  const overviewCards = [
    { label: 'Total spend', value: formatCurrency(totals?.totalCost) },
    { label: 'Total tokens', value: formatNumber(totals?.totalTokens) },
    { label: 'Sessions', value: formatNumber(sessions) },
    { label: 'Agents', value: formatNumber(data?.byAgent.length) },
    { label: 'Models', value: formatNumber(data?.byModel.length) },
    { label: 'Active days', value: formatNumber(activeDays.length) },
    { label: 'Avg per session', value: formatCurrency(sessions > 0 ? (totals?.totalCost ?? 0) / sessions : 0) },
    { label: 'Avg per active day', value: formatCurrency(activeDays.length > 0 ? (totals?.totalCost ?? 0) / activeDays.length : 0) },
  ];

  const selectedRangeLabel = useMemo(() => {
    const now = new Date();
    const end = toDateInputValue(now);
    const lastWeek = new Date(now);
    lastWeek.setDate(lastWeek.getDate() - 6);
    const lastMonth = new Date(now);
    lastMonth.setDate(lastMonth.getDate() - 29);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    if (endDate !== end) return 'Custom';
    if (startDate === toDateInputValue(lastWeek)) return '7D';
    if (startDate === toDateInputValue(lastMonth)) return '30D';
    if (startDate === toDateInputValue(monthStart)) return 'MTD';
    return 'Custom';
  }, [endDate, startDate]);

  const setQuickRange = (range: number | 'mtd') => {
    const end = new Date();
    const start = new Date(end);
    if (range === 'mtd') start.setDate(1);
    else start.setDate(start.getDate() - (range - 1));
    setStartDate(toDateInputValue(start));
    setEndDate(toDateInputValue(end));
  };

  if (!isAuthenticated) {
    return (
      <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#113a3d_0%,#071719_65%,#020607_100%)] text-[var(--color-office-lime-100)]">
        <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(130,255,228,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(130,255,228,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
        <div className="relative z-10 flex flex-col items-center">
          <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full border border-[var(--color-office-lime-300)]/30 bg-[var(--color-office-bg-5)] shadow-[0_0_40px_rgba(125,255,240,0.15)]">
            <Lock className="h-8 w-8 text-[var(--color-office-lime-300)]" />
          </div>
          <h2 className="text-[24px] font-medium tracking-[0.1em] text-[var(--color-office-lime-100)]">
            {pinMode === 'setup' ? 'CREATE A PIN' : 'ENTER YOUR PIN'}
          </h2>
          <p className="mt-2 text-[13px] uppercase tracking-[0.15em] text-[var(--color-office-lime-300)]/60">
            {pinMode === 'setup' ? 'Choose 4 to 6 digits to lock your spending view' : 'Enter your PIN to see spending'}
          </p>
          <div className="mb-8 mt-10 flex gap-4" aria-label={`${inputPin.length} digits entered`}>
            {Array.from({ length: Math.max(4, inputPin.length) }, (_, i) => (
              <div
                key={i}
                className={`h-4 w-4 rounded-full border border-[var(--color-office-lime-300)]/40 transition-all duration-200 ${
                  i < inputPin.length ? 'bg-[var(--color-office-lime-300)] shadow-[0_0_15px_rgba(125,255,240,0.6)]' : 'bg-transparent'
                }`}
              />
            ))}
          </div>
          {error ? (
            <div role="alert" className="mb-6 rounded-lg border border-rose-500/20 bg-rose-500/10 px-4 py-2 text-[13px] font-medium text-rose-200">
              {error}
            </div>
          ) : null}
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
              <button key={num} type="button" onClick={() => handleKeyPad(String(num))} className={KEY_CLASS}>
                {num}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleKeyPad('clear')}
              className="flex h-16 w-24 items-center justify-center rounded-xl border border-rose-500/20 bg-[var(--color-office-bg-2)]/60 text-[14px] font-medium uppercase tracking-wider text-rose-200 transition-all hover:bg-rose-900/40 active:scale-95"
            >
              Clear
            </button>
            <button type="button" onClick={() => handleKeyPad('0')} className={KEY_CLASS}>
              0
            </button>
            <button
              type="button"
              aria-label="Unlock"
              onClick={() => handleKeyPad('submit')}
              className="flex h-16 w-24 items-center justify-center rounded-xl border border-emerald-500/20 bg-[var(--color-office-bg-2)]/60 text-emerald-200 transition-all hover:bg-emerald-900/40 active:scale-95"
            >
              <Check className="h-6 w-6" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="absolute inset-0 overflow-y-auto bg-[radial-gradient(circle_at_top,#113a3d_0%,#071719_45%,#020607_100%)] text-[var(--color-office-lime-100)]">
      <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(130,255,228,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(130,255,228,0.08)_1px,transparent_1px)] [background-size:22px_22px]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_55%,rgba(0,0,0,0.34)_100%)]" />
      <div className="relative flex min-h-full flex-col px-10 py-8 pb-14">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="flex items-center gap-3 text-[12px] uppercase tracking-[0.32em] text-[var(--color-office-lime-300)]/70">
              <Landmark className="h-4 w-4" />
              DevLabs Treasury ATM
            </div>
            <div className="mt-3 text-[13px] uppercase tracking-[0.24em] text-[var(--color-office-lime-300)]/62">Token usage</div>
            <div className="mt-2 text-[44px] font-semibold tracking-[0.08em] text-[var(--color-office-lime-100)]">
              {formatNumber(totals?.totalTokens)}
            </div>
            <div className="mt-2 text-[15px] uppercase tracking-[0.28em] text-[var(--color-office-lime-300)]/72">Total tokens used</div>
            <div className="mt-4 inline-flex items-center rounded-full border border-[var(--color-office-lime-300)]/20 bg-black/20 px-4 py-2 text-[13px] uppercase tracking-[0.24em] text-[var(--color-office-lime-300)]/85">
              Spent {formatCurrency(totals?.totalCost)}
            </div>
          </div>
          <div className="w-[320px] rounded-[24px] border border-[var(--color-office-lime-300)]/18 bg-black/22 p-5 shadow-[0_18px_50px_rgba(0,0,0,0.34)]">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.24em] text-[var(--color-office-lime-300)]/62">
              <Wallet className="h-4 w-4" />
              Date range
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                { label: '7D', value: 7 },
                { label: '30D', value: 30 },
                { label: 'MTD', value: 'mtd' as const },
              ].map((range) => (
                <button
                  key={range.label}
                  type="button"
                  onClick={() => setQuickRange(range.value)}
                  className={`rounded-full border px-3 py-1.5 text-[10px] uppercase tracking-[0.22em] transition-colors ${
                    selectedRangeLabel === range.label
                      ? 'border-[var(--color-office-lime-300)]/40 bg-[var(--color-office-bg-5)] text-[var(--color-office-lime-100)]'
                      : 'border-[var(--color-office-lime-300)]/16 bg-[var(--color-office-bg-2)] text-[var(--color-office-lime-300)]/68 hover:border-[var(--color-office-lime-300)]/30 hover:text-[var(--color-office-lime-100)]'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <DateField label="From" value={startDate} max={endDate} onChange={setStartDate} />
              <DateField label="To" value={endDate} min={startDate} onChange={setEndDate} />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3">
              <SummaryCard label="Input" value={formatNumber(totals?.input)} />
              <SummaryCard label="Output" value={formatNumber(totals?.output)} />
              <SummaryCard label="Cache read" value={formatNumber(totals?.cacheRead)} />
              <SummaryCard label="Cache write" value={formatNumber(totals?.cacheWrite)} />
            </div>
            <div className="mt-4 rounded-2xl border border-[var(--color-office-lime-300)]/12 bg-[var(--color-office-bg-1)]/80 px-4 py-3 text-[12px] uppercase tracking-[0.18em] text-[var(--color-office-lime-300)]/76">
              {lastRefreshedAt ? `Updated ${new Date(lastRefreshedAt).toLocaleTimeString()}` : 'Loading spending'}
            </div>
          </div>
        </div>

        <div className="mt-7 space-y-6">
          <SectionCard
            title="Overview"
            subtitle="What your agents spent in the selected dates."
            action={
              <button
                type="button"
                onClick={() => void refresh()}
                className="inline-flex items-center gap-2 rounded-full border border-[var(--color-office-lime-300)]/24 bg-[var(--color-office-bg-4)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[var(--color-office-lime-300)] transition-colors hover:border-[var(--color-office-lime-300)]/40 hover:bg-[var(--color-office-bg-5)]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            }
          >
            {loadError ? <EmptyPanelState message={loadError} tone="danger" /> : null}
            <div className="mt-3 grid grid-cols-2 gap-3 xl:grid-cols-4">
              {overviewCards.map((card) => (
                <SummaryCard key={card.label} label={card.label} value={card.value} />
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Daily spend" subtitle="Cost for the last seven days of the range.">
            {loading && !data ? (
              <EmptyPanelState message="Loading spending." />
            ) : chartMax === 0 ? (
              <EmptyPanelState message="No spending in these days." />
            ) : (
              <div className="grid grid-cols-7 gap-3">
                {recentCostDaily.map((entry) => {
                  const heightPct = chartMax > 0 ? (entry.totals.totalCost / chartMax) * 100 : 0;
                  return (
                    <div key={entry.date} className="flex min-w-0 flex-col items-center gap-3">
                      <div className="text-center text-[11px] uppercase tracking-[0.12em] text-[var(--color-office-lime-300)]/68">
                        {formatCurrency(entry.totals.totalCost)}
                      </div>
                      <div className="flex h-[230px] w-full items-end rounded-[20px] border border-[var(--color-office-lime-300)]/10 bg-[var(--color-office-bg-2)]/86 p-2">
                        <div
                          className="w-full rounded-[14px] bg-[linear-gradient(180deg,#7effef_0%,#2cd3bf_100%)] shadow-[0_0_18px_rgba(85,255,231,0.32)]"
                          style={{ height: `${heightPct > 0 ? Math.max(4, heightPct) : 0}%` }}
                          title={`${entry.date} ${formatCurrency(entry.totals.totalCost)}`}
                        />
                      </div>
                      <div className="text-[11px] uppercase tracking-[0.16em] text-[var(--color-office-lime-300)]/72">{entry.date.slice(5)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <SectionCard title="Agent spending" subtitle="Agents ranked by cost.">
              <div className="space-y-3">
                {data?.byAgent.map((entry, index) => (
                  <ListRow
                    key={entry.agentId}
                    title={`Account ${String(index + 1).padStart(2, '0')} · ${entry.agentName}`}
                    primary={formatCurrency(entry.totals.totalCost)}
                    secondary={`${formatNumber(entry.totals.totalTokens)} tokens · ${formatNumber(entry.sessions)} ${entry.sessions === 1 ? 'session' : 'sessions'}`}
                  />
                ))}
                {!data?.byAgent.length ? <EmptyPanelState message="No agent spending in these days." /> : null}
              </div>
            </SectionCard>

            <SectionCard title="Model spending" subtitle="Cost by model.">
              <div className="space-y-3">
                {data?.byModel.map((entry, index) => (
                  <ListRow
                    key={entry.model}
                    title={`Route ${String(index + 1).padStart(2, '0')} · ${entry.model}`}
                    primary={formatCurrency(entry.totals.totalCost)}
                    secondary={`${formatNumber(entry.totals.totalTokens)} tokens`}
                  />
                ))}
                {!data?.byModel.length ? <EmptyPanelState message="No model spending in these days." /> : null}
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Spending by day" subtitle="Days with activity, newest first.">
            <div className="space-y-3">
              {activeDays.map((entry) => (
                <ListRow
                  key={entry.date}
                  title={entry.date}
                  primary={formatCurrency(entry.totals.totalCost)}
                  secondary={`${formatNumber(entry.totals.totalTokens)} tokens · ${formatNumber(entry.totals.input)} in · ${formatNumber(entry.totals.output)} out · ${formatNumber(entry.totals.cacheRead + entry.totals.cacheWrite)} cache`}
                />
              ))}
              {activeDays.length === 0 ? <EmptyPanelState message="No activity in these days." /> : null}
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}

const KEY_CLASS =
  'flex h-16 w-24 items-center justify-center rounded-xl border border-[var(--color-office-lime-300)]/10 bg-[var(--color-office-bg-2)]/80 text-[24px] font-light text-[var(--color-office-lime-100)] transition-all hover:bg-[var(--color-office-bg-5)] hover:border-[var(--color-office-lime-300)]/30 active:scale-95';

function DateField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[10px] uppercase tracking-[0.2em] text-[var(--color-office-lime-300)]/70">
      {label}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        className="rounded-lg border border-[var(--color-office-lime-300)]/16 bg-[var(--color-office-bg-2)] px-2 py-1 text-[12px] normal-case tracking-normal text-[var(--color-office-lime-100)] [color-scheme:dark]"
      />
    </label>
  );
}

function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-[28px] border border-[var(--color-office-lime-300)]/16 bg-black/20 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[12px] uppercase tracking-[0.24em] text-[var(--color-office-lime-300)]/64">{title}</div>
          <div className="mt-2 text-[14px] text-[var(--color-office-lime-100)]/74">{subtitle}</div>
        </div>
        {action}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-office-lime-300)]/10 bg-[var(--color-office-bg-1)]/78 px-4 py-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-[var(--color-office-lime-300)]/58">{label}</div>
      <div className="mt-2 text-[16px] text-[var(--color-office-lime-100)]">{value}</div>
    </div>
  );
}

function ListRow({ title, primary, secondary }: { title: string; primary: string; secondary: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl border border-[var(--color-office-lime-300)]/10 bg-[var(--color-office-bg-1)]/78 px-4 py-3">
      <div className="min-w-0">
        <div className="truncate text-[13px] uppercase tracking-[0.12em] text-[var(--color-office-lime-100)]">{title}</div>
        <div className="mt-1 text-[11px] text-[var(--color-office-lime-300)]/66">{secondary}</div>
      </div>
      <div className="shrink-0 text-right text-[15px] text-[var(--color-office-lime-100)]">{primary}</div>
    </div>
  );
}

function EmptyPanelState({ message, tone = 'neutral' }: { message: string; tone?: 'neutral' | 'danger' }) {
  const toneClass =
    tone === 'danger' ? 'border-rose-400/30 bg-rose-500/12 text-rose-100' : 'border-[var(--color-office-lime-300)]/10 bg-[var(--color-office-bg-1)]/78 text-[var(--color-office-lime-300)]/70';
  return (
    <div role={tone === 'danger' ? 'alert' : undefined} className={`rounded-2xl border px-4 py-4 text-[13px] ${toneClass}`}>
      {message}
    </div>
  );
}
