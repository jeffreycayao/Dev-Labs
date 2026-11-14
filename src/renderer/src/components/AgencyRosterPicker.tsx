/**
 * Add Agent → templates → Agency: the vendored agency-agents roster grouped by
 * division, with a search box. Picking a persona reads its markdown from main and
 * hands the Add Agent modal a hire manifest to pre-fill — the user still reviews
 * every field and clicks spawn, exactly like a role template.
 */
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { agencyHireManifest, type AgencyAgentEntry, type AgencyDivision } from '@shared/agencyAgents';
import type { HireManifest } from '@shared/hire';

interface Props {
  selectedId: string | null;
  onPick: (manifest: HireManifest, id: string) => void;
}

const chip = (active: boolean) => ({
  padding: '2px 8px 1px', border: 'none', cursor: 'pointer',
  background: active ? 'var(--cth-lemon)' : 'var(--cth-cream-200)',
  color: active ? 'var(--cth-on-accent)' : 'var(--cth-ink-900)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
  fontFamily: 'var(--cth-font-ui)', fontSize: 12
});

export function AgencyRosterPicker({ selectedId, onPick }: Props) {
  const { t } = useTranslation();
  const [agents, setAgents] = useState<AgencyAgentEntry[] | null>(null);
  const [divisions, setDivisions] = useState<Record<string, AgencyDivision>>({});
  const [error, setError] = useState<string | undefined>();
  const [division, setDivision] = useState<string>('');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void window.cth.agencyList().then((res) => {
      if (!alive) return;
      if (res.ok) { setAgents(res.agents); setDivisions(res.divisions); } else setError(res.error);
    });
    return () => { alive = false; };
  }, []);

  const divisionIds = useMemo(
    () => Object.keys(divisions).filter((d) => agents?.some((a) => a.division === d)),
    [divisions, agents]
  );
  const shown = useMemo(() => {
    if (!agents) return [];
    const q = query.trim().toLowerCase();
    return agents.filter((a) =>
      (!division || a.division === division)
      && (!q || `${a.name} ${a.description} ${a.vibe} ${a.id}`.toLowerCase().includes(q))
    );
  }, [agents, division, query]);

  const pick = async (a: AgencyAgentEntry) => {
    setBusyId(a.id);
    setError(undefined);
    const res = await window.cth.agencyRead(a.id);
    setBusyId(null);
    if (!res.ok) { setError(res.error); return; }
    onPick(agencyHireManifest(a, res.markdown), a.id);
  };

  if (error && !agents) return <span style={{ fontSize: 12, color: 'var(--cth-coral)' }}>{t('agency.failed', { error })}</span>;
  if (!agents) return <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('agency.loading')}</span>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span style={{ fontSize: 12, color: 'var(--cth-ink-500)', lineHeight: '16px' }}>
        {t('agency.hint', { count: agents.length })}
      </span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, alignItems: 'center' }}>
        <button onClick={() => setDivision('')} style={chip(division === '')}>{t('agency.allDivisions')}</button>
        {divisionIds.map((d) => (
          <button key={d} onClick={() => setDivision(d)} style={chip(division === d)}>
            {divisions[d]?.label ?? d} · {agents.filter((a) => a.division === d).length}
          </button>
        ))}
      </div>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('agency.searchPlaceholder')}
        aria-label={t('agency.searchPlaceholder')}
        style={{
          padding: '4px 8px', border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
          background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
          fontFamily: 'var(--cth-font-ui)', fontSize: 12
        }}
      />
      {error && <span style={{ fontSize: 12, color: 'var(--cth-coral)' }}>{error}</span>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 180, overflowY: 'auto' }}>
        {shown.length === 0 && <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('agency.noMatch')}</span>}
        {shown.map((a) => (
          <button
            key={a.id}
            onClick={() => { void pick(a); }}
            disabled={busyId !== null}
            title={`${a.description}${a.vibe ? `\n\n${a.vibe}` : ''}`}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '3px 8px', border: 'none', cursor: busyId ? 'wait' : 'pointer',
              background: selectedId === a.id ? 'var(--cth-lemon-light)' : 'var(--cth-paper-100)',
              boxShadow: selectedId === a.id ? 'inset 0 0 0 1px var(--cth-lemon)' : 'inset 0 0 0 1px var(--cth-ink-100)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 12, color: 'var(--cth-ink-900)'
            }}
          >
            <span aria-hidden>{a.emoji}</span>
            {a.name}
            {!division && <span style={{ color: 'var(--cth-ink-500)' }}>· {divisions[a.division]?.label ?? a.division}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
