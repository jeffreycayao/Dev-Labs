import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { fullMcpCatalog, mcpCatalogFor, sanitizeCustomMcp, CUSTOM_MCP_MAX, type CustomMcpServer, type McpCatalogEntry, type McpTier } from '@shared/mcpCatalog';

export interface McpDefaultsSettingsProps {
  config: HarnessConfig;
}

const TIER_ORDER: McpTier[] = ['safe-readonly', 'write', 'secret', 'browser'];
const TIER_LABEL_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonly',
  'write': 'mcpDefaults.tiers.write',
  'secret': 'mcpDefaults.tiers.secret',
  'browser': 'mcpDefaults.tiers.browser'
};
const TIER_NOTE_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonlyNote',
  'write': 'mcpDefaults.tiers.writeNote',
  'secret': 'mcpDefaults.tiers.secretNote',
  'browser': 'mcpDefaults.tiers.browserNote'
};

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--cth-font-display)',
  fontSize: 8,
  lineHeight: '12px',
  color: 'var(--cth-ink-500)',
  textTransform: 'uppercase'
};

/**
 * The key row under a connector that needs one. WRITE-ONLY: the key goes to the
 * main-process encrypted store and is never read back — the row only ever knows
 * whether one is saved.
 */
function ConnectorKey({ entry, hasKey, onChanged }: { entry: McpCatalogEntry; hasKey: boolean; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const secret = entry.secret!;
  const save = async () => {
    if (!value.trim()) return;
    setBusy(true);
    try {
      const r = await window.cth.mcpSecretSet({ id: entry.id, secret: value });
      setValue('');
      onChanged(r.ok ? t('mcpDefaults.key.savedNote', { label: entry.label }) : (r.error ?? t('mcpDefaults.couldNotSave')));
    } finally { setBusy(false); }
  };
  const clear = async () => {
    setBusy(true);
    try {
      await window.cth.mcpSecretClear(entry.id);
      onChanged(t('mcpDefaults.key.clearedNote', { label: entry.label }));
    } finally { setBusy(false); }
  };
  const small: React.CSSProperties = {
    padding: '3px 8px 1px', border: 'none', cursor: busy ? 'default' : 'pointer',
    fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '14px', textTransform: 'uppercase',
    background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)', color: 'var(--cth-ink-900)'
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
      <span style={{ fontSize: 11, fontWeight: 600, color: hasKey ? 'var(--cth-mint)' : 'var(--cth-coral)' }}>
        {hasKey ? t('mcpDefaults.key.saved') : t('mcpDefaults.key.missing')}
      </span>
      <input
        type="password"
        autoComplete="off"
        spellCheck={false}
        value={value}
        placeholder={hasKey ? t('mcpDefaults.key.replace', { label: secret.label }) : secret.label}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') void save(); }}
        style={{
          flex: '1 1 180px', minWidth: 140, padding: '3px 6px', fontSize: 12,
          fontFamily: 'var(--cth-font-mono)', background: 'var(--cth-paper-100)',
          border: 'none', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', color: 'var(--cth-ink-900)'
        }}
      />
      <button type="button" disabled={busy || !value.trim()} onClick={() => { void save(); }} style={small}>
        {t('mcpDefaults.key.save')}
      </button>
      {hasKey && (
        <button type="button" disabled={busy} onClick={() => { void clear(); }} style={small}>
          {t('mcpDefaults.key.clear')}
        </button>
      )}
      {secret.helpUrl && (
        <button
          type="button"
          onClick={() => { void window.cth.openExternal(secret.helpUrl!); }}
          style={{ ...small, background: 'transparent', boxShadow: 'none', textDecoration: 'underline' }}
        >
          {t('mcpDefaults.key.howToGet')}
        </button>
      )}
    </div>
  );
}

const smallButton: React.CSSProperties = {
  padding: '3px 8px 1px', border: 'none', cursor: 'pointer',
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '14px', textTransform: 'uppercase',
  background: 'var(--cth-cream-200)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-700)', color: 'var(--cth-ink-900)'
};

/** Plain-language setup steps (`mcpDefaults.setup.<id>`), behind a toggle. */
function SetupSteps({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const key = `mcpDefaults.setup.${id}`;
  if (!i18n.exists(key)) return null;
  const steps = t(key, { returnObjects: true }) as string[];
  return (
    <div style={{ marginTop: 4 }}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ ...smallButton, background: 'transparent', boxShadow: 'none', textDecoration: 'underline', padding: 0 }}
      >
        {open ? t('mcpDefaults.setupHide') : t('mcpDefaults.setupShow')}
      </button>
      {open && (
        <ol style={{ margin: '4px 0 0', paddingInlineStart: 18, fontSize: 12, lineHeight: '17px', color: 'var(--cth-ink-700)' }}>
          {steps.map((s, i) => <li key={i}>{s}</li>)}
        </ol>
      )}
    </div>
  );
}

/** The Obsidian connector's folder. The connector is contained to it, so the
 *  only setting it needs is this path (no key). */
function ObsidianVault({ vault, onChanged }: { vault?: string; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<{ exists: boolean; isVault: boolean } | null>(null);
  useEffect(() => {
    void window.cth.obsidianStatus?.().then(setStatus).catch(() => { /* older main */ });
  }, [vault]);
  const choose = async () => {
    const pick = await window.cth.chooseFolder();
    if (!pick.ok) return;
    const r = await window.cth.obsidianSetVault(pick.path);
    setStatus(r);
    onChanged(r.ok ? t('mcpDefaults.vault.savedNote') : (r.error ?? t('mcpDefaults.couldNotSave')));
  };
  const clear = async () => {
    setStatus(await window.cth.obsidianSetVault(null));
    onChanged(t('mcpDefaults.vault.clearedNote'));
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 4 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <code style={{
          flex: '1 1 180px', minWidth: 0, fontFamily: 'var(--cth-font-mono)', fontSize: 11, wordBreak: 'break-all',
          color: vault ? 'var(--cth-ink-900)' : 'var(--cth-coral)'
        }}>
          {vault ?? t('mcpDefaults.vault.none')}
        </code>
        <button type="button" onClick={() => { void choose(); }} style={smallButton}>{t('mcpDefaults.vault.choose')}</button>
        {vault && <button type="button" onClick={() => { void clear(); }} style={smallButton}>{t('mcpDefaults.vault.clear')}</button>}
      </div>
      {vault && status && !status.exists && (
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cth-coral)' }}>{t('mcpDefaults.vault.missing')}</span>
      )}
      {vault && status?.exists && !status.isVault && (
        <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('mcpDefaults.vault.notVault')}</span>
      )}
    </div>
  );
}

/** A connector's plain (non-secret) value, e.g. HighLevel's sub-account id.
 *  Stored in `config.mcpVars` and filled into the catalog spec at spawn. */
function ConnectorVar({ name, label, config, onChanged }: { name: string; label: string; config: HarnessConfig; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const [value, setValue] = useState(config.mcpVars?.[name] ?? '');
  const save = async () => {
    const next = { ...(config.mcpVars ?? {}) };
    const v = value.trim().replace(/[\r\n]/g, '').slice(0, 200);
    if (v) next[name] = v; else delete next[name];
    try {
      await window.cth.updateConfig({ mcpVars: next });
      onChanged(v ? t('mcpDefaults.vars.savedNote', { label }) : t('mcpDefaults.vars.clearedNote', { label }));
    } catch { onChanged(t('mcpDefaults.couldNotSave')); }
  };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={label}
        aria-label={label}
        style={{
          flex: '1 1 180px', minWidth: 0, padding: '3px 6px', fontSize: 12,
          fontFamily: 'var(--cth-font-mono)', border: 'none',
          boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)'
        }}
      />
      <button type="button" onClick={() => { void save(); }} style={smallButton}>{t('mcpDefaults.vars.save')}</button>
    </div>
  );
}

// No flex basis here: in a column it would set the HEIGHT (a 180px-tall input).
const fieldStyle: React.CSSProperties = {
  minWidth: 0, padding: '3px 6px', fontSize: 12,
  fontFamily: 'var(--cth-font-mono)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)', background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)'
};

/** Add an MCP server by hand: a remote URL (with or without a key) or a local
 *  command. Saved in config.customMcpServers; main re-validates every row, and
 *  the key, if any, is saved afterwards in the row's own key field. */
function CustomMcpForm({ config, onChanged }: { config: HarnessConfig; onChanged: (msg: string) => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<'http' | 'stdio'>('http');
  const [url, setUrl] = useState('');
  const [auth, setAuth] = useState<'none' | 'bearer' | 'header'>('bearer');
  const [headerName, setHeaderName] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [envName, setEnvName] = useState('');
  const existing = sanitizeCustomMcp(config.customMcpServers);
  const add = async () => {
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'server';
    let id = `custom-${slug}`;
    for (let n = 2; existing.some((c) => c.id === id); n++) id = `custom-${slug}-${n}`;
    const row: CustomMcpServer = transport === 'http'
      ? { id, label: name.trim(), transport, url: url.trim(), auth, ...(auth === 'header' ? { headerName: headerName.trim() } : {}) }
      : { id, label: name.trim(), transport, command: command.trim(), args: args.split(/\r?\n/).map((a) => a.trim()).filter(Boolean), ...(envName.trim() ? { envName: envName.trim() } : {}) };
    // The same check main applies: refuse here with a reason instead of silently dropping.
    if (!sanitizeCustomMcp([row]).length) { onChanged(t('mcpDefaults.custom.invalid')); return; }
    if (existing.length >= CUSTOM_MCP_MAX) { onChanged(t('mcpDefaults.custom.tooMany', { max: CUSTOM_MCP_MAX })); return; }
    try {
      await window.cth.updateConfig({ customMcpServers: [...existing, row] });
      setName(''); setUrl(''); setHeaderName(''); setCommand(''); setArgs(''); setEnvName('');
      onChanged(t('mcpDefaults.custom.added', { label: row.label }));
    } catch { onChanged(t('mcpDefaults.couldNotSave')); }
  };
  const line: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' };
  const pick = (on: boolean): React.CSSProperties => ({ ...smallButton, background: on ? 'var(--cth-lemon)' : 'var(--cth-cream-200)' });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)' }}>
      <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-500)' }}>{t('mcpDefaults.custom.note')}</span>
      <div style={line}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('mcpDefaults.custom.name')} aria-label={t('mcpDefaults.custom.name')} style={{ ...fieldStyle, flex: '1 1 180px' }} maxLength={60} />
        <button type="button" onClick={() => setTransport('http')} style={pick(transport === 'http')}>{t('mcpDefaults.custom.remote')}</button>
        <button type="button" onClick={() => setTransport('stdio')} style={pick(transport === 'stdio')}>{t('mcpDefaults.custom.local')}</button>
      </div>
      {transport === 'http' ? (
        <>
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/mcp" aria-label={t('mcpDefaults.custom.url')} style={fieldStyle} />
          <div style={line}>
            <span style={{ fontSize: 11, color: 'var(--cth-ink-500)' }}>{t('mcpDefaults.custom.auth')}</span>
            <button type="button" onClick={() => setAuth('bearer')} style={pick(auth === 'bearer')}>{t('mcpDefaults.custom.authBearer')}</button>
            <button type="button" onClick={() => setAuth('header')} style={pick(auth === 'header')}>{t('mcpDefaults.custom.authHeader')}</button>
            <button type="button" onClick={() => setAuth('none')} style={pick(auth === 'none')}>{t('mcpDefaults.custom.authNone')}</button>
            {auth === 'header' && (
              <input value={headerName} onChange={(e) => setHeaderName(e.target.value)} placeholder="X-Api-Key" aria-label={t('mcpDefaults.custom.headerName')} style={{ ...fieldStyle, flex: '0 1 160px' }} />
            )}
          </div>
        </>
      ) : (
        <>
          <input value={command} onChange={(e) => setCommand(e.target.value)} placeholder="npx" aria-label={t('mcpDefaults.custom.command')} style={fieldStyle} />
          <textarea value={args} onChange={(e) => setArgs(e.target.value)} rows={3} placeholder={t('mcpDefaults.custom.argsPlaceholder')} aria-label={t('mcpDefaults.custom.args')} style={{ ...fieldStyle, resize: 'vertical' }} />
          <input value={envName} onChange={(e) => setEnvName(e.target.value)} placeholder={t('mcpDefaults.custom.envName')} aria-label={t('mcpDefaults.custom.envName')} style={fieldStyle} />
        </>
      )}
      <div style={line}>
        <button type="button" disabled={!name.trim()} onClick={() => { void add(); }} style={smallButton}>{t('mcpDefaults.custom.add')}</button>
      </div>
    </div>
  );
}

export function McpDefaultsSettings({ config }: McpDefaultsSettingsProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const refreshKeys = useCallback(() => {
    void window.cth.mcpSecretStatus?.().then(setKeys).catch(() => { /* older main */ });
  }, []);
  useEffect(() => { refreshKeys(); }, [refreshKeys]);
  // One timer: an older message's timer must not clear a newer message.
  const noteTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flash = (msg: string) => {
    setNote(msg);
    refreshKeys();
    if (noteTimer.current) clearTimeout(noteTimer.current);
    noteTimer.current = setTimeout(() => setNote(''), 2400);
  };

  // Built-in connectors plus the user's own servers (config.customMcpServers).
  const catalog = fullMcpCatalog(config.customMcpServers);
  const enabledFor = (id: string): boolean =>
    config.mcpDefaults?.[id]?.enabled ?? catalog.find((e) => e.id === id)?.defaultEnabled ?? false;
  const removeCustom = async (id: string) => {
    try {
      await window.cth.updateConfig({ customMcpServers: sanitizeCustomMcp(config.customMcpServers).filter((c) => c.id !== id) });
      flash(t('mcpDefaults.custom.removed'));
    } catch { flash(t('mcpDefaults.couldNotSave')); }
  };

  const toggle = async (id: string) => {
    const next = !enabledFor(id);
    try {
      await window.cth.updateConfig({
        mcpDefaults: { ...(config.mcpDefaults ?? {}), [id]: { enabled: next } }
      });
      setNote(t('mcpDefaults.toggleNote', { id, state: next ? t('common.on') : t('common.off') }));
      setTimeout(() => setNote(''), 1800);
    } catch {
      setNote(t('mcpDefaults.couldNotSave'));
      setTimeout(() => setNote(''), 2000);
    }
  };

  // An entry behind a switched-off feature (Settings → General → Features) is not shown.
  const byTier = (tier: McpTier) => mcpCatalogFor(config.features, catalog).filter((e) => e.tier === tier);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <div style={{ ...labelStyle, marginBottom: 6 }}>{t('mcpDefaults.title')}</div>
        <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)' }}>
          {t('mcpDefaults.desc')}
        </span>
      </div>

      {TIER_ORDER.map((tier) => {
        const entries = byTier(tier);
        if (entries.length === 0) return null;
        const isConsent = tier !== 'safe-readonly';
        return (
          <div key={tier} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{
                fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
                color: isConsent ? '#6E1423' : 'var(--cth-ink-500)',
                textTransform: 'uppercase'
              }}>
                {t(TIER_LABEL_KEY[tier])}
              </span>
              <span style={{ fontSize: 11, lineHeight: '15px', color: 'var(--cth-ink-400, var(--cth-ink-500))' }}>
                {t(TIER_NOTE_KEY[tier])}
              </span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {entries.map((entry) => {
                const on = enabledFor(entry.id);
                return (
                  <div
                    key={entry.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 12, padding: '7px 10px',
                      background: 'var(--cth-paper-100)',
                      boxShadow: `inset 0 0 0 1px ${isConsent && on ? '#6E1423' : 'var(--cth-ink-300)'}`
                    }}
                  >
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1, flex: 1, minWidth: 0 }}>
                      <span style={{ fontSize: 12, lineHeight: '18px', color: 'var(--cth-ink-900)', fontWeight: 600 }}>
                        {entry.label}
                        <code style={{
                          marginLeft: 6,
                          fontFamily: 'var(--cth-font-mono)',
                          fontSize: 11,
                          color: 'var(--cth-ink-500)',
                          fontWeight: 400
                        }}>{entry.id}</code>
                      </span>
                      <span style={{ fontSize: 12, lineHeight: '16px', color: 'var(--cth-ink-500)', wordBreak: 'break-word' }}>
                        {entry.description}
                      </span>
                      {entry.secret && (
                        <ConnectorKey entry={entry} hasKey={!!keys[entry.id]} onChanged={flash} />
                      )}
                      {entry.secret && on && !keys[entry.id] && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cth-coral)' }}>{t('mcpDefaults.key.needsKey')}</span>
                      )}
                      {entry.vars?.map((v) => (
                        <ConnectorVar key={v.name} name={v.name} label={v.label} config={config} onChanged={flash} />
                      ))}
                      {entry.id === 'obsidian' && <ObsidianVault vault={config.obsidianVault} onChanged={flash} />}
                      {entry.id === 'obsidian' && on && !config.obsidianVault && (
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--cth-coral)' }}>{t('mcpDefaults.vault.needsVault')}</span>
                      )}
                      <SetupSteps id={entry.id} />
                      {entry.id.startsWith('custom-') && (
                        <button type="button" onClick={() => { void removeCustom(entry.id); }}
                          style={{ ...smallButton, alignSelf: 'flex-start', marginTop: 4 }}>{t('mcpDefaults.custom.remove')}</button>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => { void toggle(entry.id); }}
                      style={{
                        flexShrink: 0,
                        padding: '3px 10px 1px',
                        background: on
                          ? (isConsent ? 'var(--cth-coral-light, #f6d3c4)' : 'var(--cth-lemon)')
                          : 'var(--cth-cream-200)',
                        boxShadow: `inset 0 0 0 1px ${on ? 'var(--cth-ink-900)' : 'var(--cth-ink-700)'}`,
                        border: 'none',
                        fontFamily: 'var(--cth-font-display)',
                        fontSize: 8,
                        lineHeight: '14px',
                        color: 'var(--cth-ink-900)',
                        cursor: 'pointer',
                        textTransform: 'uppercase'
                      }}
                    >
                      {on ? t('common.on') : t('common.off')}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px', color: '#6E1423', textTransform: 'uppercase' }}>
          {t('mcpDefaults.custom.title')}
        </span>
        <CustomMcpForm config={config} onChanged={flash} />
      </div>

      {note && (
        <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{note}</span>
      )}
    </div>
  );
}
