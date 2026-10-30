import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Agent } from '@/store/store';
import {
  PROMPT_CATEGORIES,
  promptsFor,
  roleCategoryFor,
  type PromptCategory,
  type PromptItem
} from '@shared/promptLibrary';

/** Per-agent category override — a UI convenience, so localStorage is enough. */
const LS_KEY = (agentId: string) => `cth.promptCategory.${agentId}`;
function readOverride(agentId: string): PromptCategory | null {
  try {
    const v = window.localStorage.getItem(LS_KEY(agentId));
    return v && PROMPT_CATEGORIES.some((c) => c.id === v) ? (v as PromptCategory) : null;
  } catch { return null; }
}
function writeOverride(agentId: string, v: PromptCategory | null): void {
  try {
    if (v) window.localStorage.setItem(LS_KEY(agentId), v);
    else window.localStorage.removeItem(LS_KEY(agentId));
  } catch { /* storage unavailable: override lasts for this session only */ }
}

/**
 * Prompt Library panel for the composer. Shows prompts for the category derived
 * from the addressed agent's role (free text → roleCategoryFor), with a manual
 * override and a search box. Picking a prompt hands its body to `onPick`.
 */
export function PromptLibraryPanel({ agent, onPick }: { agent: Agent; onPick: (item: PromptItem) => void }) {
  const { t } = useTranslation();
  const auto = roleCategoryFor(agent);
  const [override, setOverride] = useState<PromptCategory | null>(() => readOverride(agent.id));
  const [query, setQuery] = useState('');
  const category = override ?? auto;

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    // Searching looks across the whole library, not just this role.
    const pool = q
      ? PROMPT_CATEGORIES.flatMap((c) => promptsFor(c.id).filter((x) => x.category === c.id))
      : promptsFor(category);
    return q ? pool.filter((x) => `${x.title} ${x.body}`.toLowerCase().includes(q)) : pool;
  }, [category, query]);

  const label = (id: PromptCategory) => PROMPT_CATEGORIES.find((c) => c.id === id)?.label ?? id;
  const choose = (v: string) => {
    const next = v === 'auto' ? null : (v as PromptCategory);
    setOverride(next);
    writeOverride(agent.id, next);
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6, padding: 8,
      background: 'var(--cth-cream-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontFamily: 'var(--cth-font-display)', fontSize: 9, letterSpacing: '.08em', color: 'var(--cth-ink-900)' }}>
          {t('queueComposer.promptsTitle')}
        </span>
        <span style={{ fontSize: 12, color: 'var(--cth-ink-500)' }}>{t('queueComposer.promptsFor')}</span>
        <select
          value={override ?? 'auto'}
          onChange={(e) => choose(e.target.value)}
          title={t('queueComposer.promptsCategoryTitle')}
          style={{
            fontSize: 12, padding: '2px 4px', border: 'none', color: 'var(--cth-ink-900)',
            background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)'
          }}
        >
          <option value="auto">{t('queueComposer.promptsAuto', { category: label(auto) })}</option>
          {PROMPT_CATEGORIES.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
        </select>
        <input
          className="cth-input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('queueComposer.promptsSearch')}
          style={{
            flex: 1, minWidth: 120, fontSize: 12, padding: '3px 6px', border: 'none',
            background: 'var(--cth-paper-100)', color: 'var(--cth-ink-900)', outline: 'none'
          }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 220, overflowY: 'auto' }}>
        {items.length === 0 && (
          <span style={{ fontSize: 12, color: 'var(--cth-ink-500)', padding: 4 }}>{t('queueComposer.promptsEmpty')}</span>
        )}
        {items.map((item) => (
          <button
            key={item.id}
            onClick={() => onPick(item)}
            title={item.body}
            style={{
              textAlign: 'left', border: 'none', cursor: 'pointer', padding: '5px 8px',
              background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)',
              color: 'var(--cth-ink-900)', fontFamily: 'var(--cth-font-ui)'
            }}
          >
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontSize: 12.5, fontWeight: 600 }}>{item.title}</span>
              {(query || item.category !== category) && (
                <span style={{ fontSize: 10, color: 'var(--cth-ink-500)', fontFamily: 'var(--cth-font-mono)' }}>
                  {label(item.category)}
                </span>
              )}
            </div>
            <div style={{
              fontSize: 11.5, color: 'var(--cth-ink-500)', lineHeight: '15px',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>{item.body}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
