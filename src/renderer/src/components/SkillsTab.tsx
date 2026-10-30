/** Local skills and the first-party DevLabs Skills Library. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { LocalSkill, CatalogSkill } from '../../../preload';

type Mode = 'installed' | 'browse';

const PROVIDER_LABEL: Record<LocalSkill['provider'], string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex'
};

function Chip({ text, tone = 'quiet' }: { text: string; tone?: 'quiet' | 'accent' }) {
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--cth-font-display)', letterSpacing: 0.4,
      padding: '2px 6px', flexShrink: 0, textTransform: 'uppercase',
      color: 'var(--cth-ink-900)',
      background: tone === 'accent' ? 'var(--cth-mint-light)' : 'var(--cth-cream-200)',
      boxShadow: `inset 0 0 0 1px ${tone === 'accent' ? 'var(--cth-mint)' : 'var(--cth-ink-300)'}`
    }}>{text}</span>
  );
}

export function SkillsTab({ agentCwd }: { agentCwd?: string }) {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>('installed');
  const [query, setQuery] = useState('');
  const [local, setLocal] = useState<LocalSkill[] | null>(null);
  const [catalog, setCatalog] = useState<CatalogSkill[] | null>(null);
  const [catalogMeta, setCatalogMeta] = useState<{ stale: boolean; error?: string; fetchedAt: number } | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [busy, setBusy] = useState(false);
  /** Per-row action state, keyed by catalog ID / local path. Keeps one row's
   *  spinner or error from being mistaken for the whole tab failing. */
  const [action, setAction] = useState<Record<string, { busy?: boolean; error?: string; done?: string }>>({});
  /** Uninstall is destructive, so it is two clicks: the first arms this, the
   *  second does it. No modal — the row itself becomes the confirmation. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const loadLocal = useCallback(async () => {
    try { setLocal(await window.cth.skillsLocal(agentCwd)); } catch { setLocal([]); }
  }, [agentCwd]);

  const loadCatalog = useCallback(async (force = false) => {
    setBusy(true);
    try {
      const res = await window.cth.skillsCatalog(force);
      setCatalog(res.skills);
      setCatalogMeta({ stale: res.stale, error: res.error, fetchedAt: res.fetchedAt });
    } catch {
      setCatalog([]);
      setCatalogMeta({ stale: true, error: t('skillsTab.catalogUnreachable'), fetchedAt: 0 });
    } finally { setBusy(false); }
  }, [t]);

  useEffect(() => { void loadLocal(); }, [loadLocal]);
  // The catalog is fetched only when the user actually opens Browse — no network
  // call for someone who just wanted to see what is installed.
  useEffect(() => { if (mode === 'browse' && catalog === null) void loadCatalog(); }, [mode, catalog, loadCatalog]);

  const q = query.trim().toLowerCase();

  const shownLocal = useMemo(() => {
    const list = local ?? [];
    if (!q) return list;
    return list.filter((s) =>
      s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q));
  }, [local, q]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of catalog ?? []) counts.set(s.category, (counts.get(s.category) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [catalog]);

  const shownCatalog = useMemo(() => {
    let list = catalog ?? [];
    if (category !== 'all') list = list.filter((s) => s.category === category);
    if (q) {
      list = list.filter((s) =>
        s.name.toLowerCase().includes(q) ||
        s.description.toLowerCase().includes(q) ||
        s.id.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q));
    }
    return list;
  }, [catalog, category, q]);

  const install = async (c: CatalogSkill) => {
    if (c.installState !== 'not-installed' && c.installState !== 'update-available') return;
    setAction((a) => ({ ...a, [c.id]: { busy: true } }));
    try {
      const res = await window.cth.skillsInstall(c.id, c.version, c.sourceCommit);
      if (res.ok) {
        setAction((a) => ({ ...a, [c.id]: { done: t(c.installState === 'update-available' ? 'skillsTab.updated' : 'skillsTab.installed') } }));
        await Promise.all([loadLocal(), loadCatalog()]);
      } else {
        setAction((a) => ({ ...a, [c.id]: { error: res.error ?? t('skillsTab.installFailed') } }));
        void loadCatalog();
      }
    } catch (e) {
      setAction((a) => ({ ...a, [c.id]: { error: e instanceof Error ? e.message : t('skillsTab.installFailed') } }));
    }
  };

  const uninstall = async (sk: LocalSkill) => {
    setConfirming(null);
    setAction((a) => ({ ...a, [sk.path]: { busy: true } }));
    try {
      const res = await window.cth.skillsUninstall(sk.path);
      if (res.ok) {
        setAction((a) => { const n = { ...a }; delete n[sk.path]; return n; });
        void loadLocal();
        if (catalog !== null) void loadCatalog();
      }
      else setAction((a) => ({ ...a, [sk.path]: { error: res.error ?? t('skillsTab.removeFailed') } }));
    } catch (e) {
      setAction((a) => ({ ...a, [sk.path]: { error: e instanceof Error ? e.message : t('skillsTab.uninstallFailed') } }));
    }
  };

  const actionBtn = (kind: 'primary' | 'quiet' | 'danger'): React.CSSProperties => ({
    padding: '3px 9px 2px', border: 'none', cursor: 'pointer', flexShrink: 0,
    fontFamily: 'var(--cth-font-ui)', fontSize: 11,
    color: 'var(--cth-ink-900)',
    background:
      kind === 'primary' ? 'var(--cth-mint-light)'
      : kind === 'danger' ? 'var(--cth-coral-light)'
      : 'var(--cth-cream-200)',
    boxShadow: `inset 0 0 0 1px ${
      kind === 'primary' ? 'var(--cth-mint)' : kind === 'danger' ? 'var(--cth-coral)' : 'var(--cth-ink-300)'
    }`
  });

  const tabBtn = (m: Mode, label: string): React.CSSProperties => ({
    padding: '4px 10px 3px', border: 'none', cursor: 'pointer',
    fontFamily: 'var(--cth-font-ui)', fontSize: 12,
    background: mode === m ? 'var(--cth-lemon-light)' : 'var(--cth-cream-200)',
    boxShadow: `inset 0 0 0 1px ${mode === m ? 'var(--cth-lemon)' : 'var(--cth-ink-300)'}`,
    color: 'var(--cth-ink-900)'
  });

  const cachedAt = catalogMeta?.fetchedAt
    ? new Date(catalogMeta.fetchedAt).toLocaleString(i18n.language)
    : null;

  const catalogActionLabel = (s: CatalogSkill): string => {
    if (action[s.id]?.busy) return t(s.installState === 'update-available' ? 'skillsTab.updating' : 'skillsTab.installing');
    switch (s.installState) {
      case 'installed': return t('skillsTab.installed');
      case 'update-available': return t('skillsTab.update');
      case 'modified': return t('skillsTab.localChanges');
      case 'unmanaged': return t('skillsTab.alreadyExists');
      case 'newer-installed': return t('skillsTab.newerInstalled');
      default: return t('skillsTab.install');
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, height: '100%' }}>
      {/* Controls */}
      <div style={{
        flexShrink: 0, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap',
        padding: 10, borderBottom: '1px solid var(--cth-ink-300)'
      }}>
        <button onClick={() => setMode('installed')} style={tabBtn('installed', t('skillsTab.installed'))}>
          {t('skillsTab.installed')}{local ? ` (${local.length})` : ''}
        </button>
        <button onClick={() => setMode('browse')} style={tabBtn('browse', t('skillsTab.browse'))}>
          {t('skillsTab.browse')}{catalog ? ` (${catalog.length})` : ''}
        </button>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={mode === 'installed' ? t('skillsTab.searchInstalled') : t('skillsTab.searchCatalog')}
          style={{
            flex: 1, minWidth: 140, padding: '4px 8px',
            background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
            border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
            fontFamily: 'var(--cth-font-ui)', fontSize: 12
          }}
        />
        {mode === 'browse' && (
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            title={t('skillsTab.categoryTitle')}
            style={{
              padding: '4px 6px', maxWidth: 210,
              background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)',
              border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
              fontFamily: 'var(--cth-font-ui)', fontSize: 12
            }}
          >
            <option value="all">{t('skillsTab.allCategories')}</option>
            {categories.map(([c, n]) => <option key={c} value={c}>{c} ({n})</option>)}
          </select>
        )}
        <PixelButton
          variant="ghost"
          size="sm"
          onClick={() => (mode === 'installed' ? void loadLocal() : void loadCatalog(true))}
          disabled={busy}
        >{busy ? t('skillsTab.loading') : t('skillsTab.refresh')}</PixelButton>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 10 }}>
        {mode === 'installed' ? (
          local === null ? <Muted>{t('skillsTab.scanning')}</Muted>
          : shownLocal.length === 0 ? (
            <Muted>
              {local.length === 0
                ? t('skillsTab.noSkillsInstalled')
                : t('skillsTab.nothingMatches')}
            </Muted>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shownLocal.map((s) => (
                <div key={s.id + s.path} style={rowStyle}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, flex: 1, minWidth: 0 }}>
                      {s.name.toUpperCase()}
                    </span>
                    <Chip text={PROVIDER_LABEL[s.provider]} />
                    <Chip text={s.scope} tone={s.scope === 'project' ? 'accent' : 'quiet'} />
                  </div>
                  {s.description && (
                    <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.45 }}>
                      {s.description.length > 220 ? `${s.description.slice(0, 220)}…` : s.description}
                    </div>
                  )}
                  <div style={{
                    fontFamily: 'var(--cth-font-mono)', fontSize: 10.5,
                    color: 'var(--cth-ink-500)', wordBreak: 'break-all'
                  }}>{s.path}</div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button onClick={() => void window.cth.skillsReveal(s.path)} style={actionBtn('quiet')}>
                      {t('skillsTab.openFolder')}
                    </button>
                    {s.scope === 'bundled' ? (
                      // Bundled skills ship inside the app and are re-copied into
                      // every agent on spawn, so "removing" one would silently come
                      // back. Say that instead of offering a button that lies.
                      <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
                        {t('skillsTab.shipsWithApp')}
                      </span>
                    ) : confirming === s.path ? (
                      <>
                        <button onClick={() => void uninstall(s)} style={actionBtn('danger')}>
                          {t('skillsTab.deleteConfirm', { name: s.name })}
                        </button>
                        <button onClick={() => setConfirming(null)} style={actionBtn('quiet')}>{t('common.cancel')}</button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirming(s.path)}
                        disabled={action[s.path]?.busy}
                        style={actionBtn('quiet')}
                      >{action[s.path]?.busy ? t('skillsTab.removing') : t('skillsTab.uninstall')}</button>
                    )}
                    {action[s.path]?.error && (
                      <span style={{ fontSize: 11, color: 'var(--cth-coral)' }}>{action[s.path]?.error}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : catalog === null ? <Muted>{t('skillsTab.loadingCatalog')}</Muted>
        : (
          <>
            <div style={{
              marginBottom: 10, padding: 10, background: 'var(--cth-lemon-light)',
              boxShadow: 'inset 0 0 0 1px var(--cth-lemon)'
            }}>
              <div style={{ fontFamily: 'var(--cth-font-display)', fontSize: 12, marginBottom: 4 }}>
                {t('skillsTab.libraryTitle')}
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.5 }}>{t('skillsTab.libraryIntro')}</div>
              <div style={{ fontSize: 11, lineHeight: 1.5, marginTop: 4, color: 'var(--cth-ink-700)' }}>
                {t('skillsTab.licenseNote')}
              </div>
            </div>
            {catalogMeta?.stale && (
              <div style={{
                marginBottom: 8, padding: 8, fontSize: 12, color: 'var(--cth-ink-900)',
                background: 'var(--cth-coral-light)', boxShadow: 'inset 0 0 0 1px var(--cth-coral)'
              }}>
                {catalog.length > 0
                  ? t('skillsTab.cachedCopy', {
                    date: cachedAt ?? t('skillsTab.timeUnknown'),
                    error: catalogMeta.error ?? t('skillsTab.catalogUnreachable')
                  })
                  : t('skillsTab.catalogUnavailable', { error: catalogMeta.error ?? t('skillsTab.catalogUnreachable') })}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'var(--cth-ink-500)', marginBottom: 8 }}>
              {t('skillsTab.matching', { count: shownCatalog.length })}
              {' · '}{t('skillsTab.curatedBy')}
            </div>
            {catalog.length === 0
              ? <Muted>{catalogMeta?.stale ? t('skillsTab.noCachedSkills') : t('skillsTab.noPublishedSkills')}</Muted>
              : shownCatalog.length === 0
                ? <Muted>{t('skillsTab.nothingMatches')}</Muted>
                : null}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {shownCatalog.map((s) => (
                <div key={s.id} style={rowStyle}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 11, flex: 1, minWidth: 0 }}>
                      {s.name.toUpperCase()}
                    </span>
                    <Chip text={s.category} />
                    <Chip text={t('skillsTab.version', { version: s.version })} />
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--cth-ink-700)', lineHeight: 1.45 }}>
                    {s.description}
                  </div>
                  {s.installedVersion && (
                    <div style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>
                      {t('skillsTab.installedVersion', { version: s.installedVersion })}
                    </div>
                  )}
                  {s.installState === 'modified' && (
                    <div style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>
                      {t('skillsTab.modifiedHelp')}
                    </div>
                  )}
                  {s.installState === 'unmanaged' && (
                    <div style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>
                      {t('skillsTab.unmanagedHelp')}
                    </div>
                  )}
                  {s.installState === 'newer-installed' && (
                    <div style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>
                      {t('skillsTab.newerHelp')}
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => void install(s)}
                      disabled={!!action[s.id]?.busy || (s.installState !== 'not-installed' && s.installState !== 'update-available')}
                      style={actionBtn(s.installState === 'not-installed' || s.installState === 'update-available' ? 'primary' : 'quiet')}
                    >
                      {catalogActionLabel(s)}
                    </button>
                    <button
                      onClick={() => void window.cth.openExternal(s.sourceUrl)}
                      style={actionBtn('quiet')}
                    >{t('skillsTab.learnMore')}</button>
                    {action[s.id]?.done && (
                      <span style={{ fontSize: 11, color: 'var(--cth-ink-700)' }}>{action[s.id].done}</span>
                    )}
                    {action[s.id]?.error && (
                      <span style={{ fontSize: 11, color: 'var(--cth-coral)', flex: 1, minWidth: 0 }}>
                        {action[s.id].error}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: 5, padding: 10,
  background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  color: 'var(--cth-ink-900)'
};

function Muted({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, color: 'var(--cth-ink-500)', padding: 6 }}>{children}</div>;
}
