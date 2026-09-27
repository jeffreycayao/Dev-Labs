import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { HarnessConfig } from '@/store/config';
import { MCP_CATALOG, type McpCatalogEntry, type McpTier } from '@shared/mcpCatalog';

export interface McpDefaultsSettingsProps {
  config: HarnessConfig;
}

const TIER_ORDER: McpTier[] = ['safe-readonly', 'write', 'secret'];
const TIER_LABEL_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonly',
  'write': 'mcpDefaults.tiers.write',
  'secret': 'mcpDefaults.tiers.secret'
};
const TIER_NOTE_KEY: Record<McpTier, string> = {
  'safe-readonly': 'mcpDefaults.tiers.safeReadonlyNote',
  'write': 'mcpDefaults.tiers.writeNote',
  'secret': 'mcpDefaults.tiers.secretNote'
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

export function McpDefaultsSettings({ config }: McpDefaultsSettingsProps) {
  const { t } = useTranslation();
  const [note, setNote] = useState('');
  const [keys, setKeys] = useState<Record<string, boolean>>({});
  const refreshKeys = useCallback(() => {
    void window.cth.mcpSecretStatus?.().then(setKeys).catch(() => { /* older main */ });
  }, []);
  useEffect(() => { refreshKeys(); }, [refreshKeys]);
  const flash = (msg: string) => {
    setNote(msg);
    refreshKeys();
    setTimeout(() => setNote(''), 2400);
  };

  const enabledFor = (id: string): boolean =>
    config.mcpDefaults?.[id]?.enabled ?? MCP_CATALOG.find((e) => e.id === id)?.defaultEnabled ?? false;

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

  const byTier = (tier: McpTier) => MCP_CATALOG.filter((e) => e.tier === tier);

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

      {note && (
        <span style={{ fontSize: 12, color: 'var(--cth-mint)' }}>{note}</span>
      )}
    </div>
  );
}
