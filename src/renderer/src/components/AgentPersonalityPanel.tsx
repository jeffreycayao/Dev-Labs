/**
 * Agent personality ("Brain") panel, ported from Claw3D's AgentBrainPanel.
 *
 * Structured fields → one marked section in the instruction file the agent's CLI
 * already reads from its folder (CLAUDE.md / GEMINI.md / AGENTS.md). Text outside
 * that section is the user's and is kept byte-for-byte. Reads and writes go
 * through the existing root-confined window.cth.readFile / writeFile, so only
 * that one file inside the agent's folder is ever touched.
 */
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { PixelButton } from './PixelButton';
import type { Agent } from '@/store/store';
import {
  PERSONALITY_FIELDS, PERSONALITY_FIELD_MAX, buildPersonalitySection, emptyPersonality,
  instructionFileFor, isEmptyPersonality, mergePersonalitySection, readPersonalitySection,
  type PersonalityDraft
} from '@shared/office/personality';

const box: CSSProperties = {
  padding: '8px 10px',
  background: 'var(--cth-cream-100)',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-300)',
  fontSize: 12, color: 'var(--cth-ink-900)', lineHeight: '17px'
};
const label: CSSProperties = {
  fontFamily: 'var(--cth-font-display)', fontSize: 8, lineHeight: '12px',
  color: 'var(--cth-ink-700)', textTransform: 'uppercase'
};
const input: CSSProperties = {
  width: '100%', padding: '6px 8px 4px', background: 'var(--cth-paper-100)', border: 'none',
  boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)', fontFamily: 'var(--cth-font-ui)',
  fontSize: 13, color: 'var(--cth-ink-900)', outline: 'none', resize: 'vertical'
};

/** A missing file is fine (we create it); any other read error blocks saving so we never clobber it. */
async function readInstructionFile(root: string, file: string): Promise<{ ok: true; content: string } | { ok: false; error: string }> {
  const res = await window.cth.readFile(root, file);
  if (res.ok) return { ok: true, content: res.content };
  if (/ENOENT|no such file/i.test(res.error)) return { ok: true, content: '' };
  return { ok: false, error: res.error };
}

export interface AgentPersonalityPanelProps { agent: Agent }

export function AgentPersonalityPanel({ agent }: AgentPersonalityPanelProps) {
  const { t: tr } = useTranslation();
  const root = agent.worktreePath || agent.cwd;
  const file = instructionFileFor(agent.provider);
  const [draft, setDraft] = useState<PersonalityDraft>(emptyPersonality);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let live = true;
    setLoaded(false);
    setError(undefined);
    if (!root) { setError(tr('company.brainNoFolder')); return; }
    readInstructionFile(root, file).then(res => {
      if (!live) return;
      if (!res.ok) { setError(tr('company.brainReadError', { file, error: res.error })); return; }
      setDraft(readPersonalitySection(res.content, agent.id) ?? emptyPersonality());
      setLoaded(true);
    });
    return () => { live = false; };
  }, [root, file, agent.id, tr]);

  const preview = useMemo(
    () => (isEmptyPersonality(draft) ? '' : buildPersonalitySection(agent.id, agent.name, draft)),
    [draft, agent.id, agent.name]
  );

  const save = async () => {
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      // Re-read right before writing so edits made elsewhere since load are kept.
      const cur = await readInstructionFile(root, file);
      if (!cur.ok) { setError(tr('company.brainReadError', { file, error: cur.error })); return; }
      const next = mergePersonalitySection(cur.content, agent.id, agent.name, draft);
      if (next !== cur.content) {
        const w = await window.cth.writeFile(root, file, next);
        if (!w.ok) { setError(tr('company.brainWriteError', { file, error: w.error })); return; }
      }
      setSaved(true);
    } finally {
      setBusy(false);
    }
  };

  const set = (k: keyof PersonalityDraft, v: string) => { setSaved(false); setDraft(d => ({ ...d, [k]: v })); };

  return (
    <div data-testid="agent-personality" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={box}>{tr('company.brainIntro', { file })}</div>

      {PERSONALITY_FIELDS.map(k => (
        <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <span style={label}>{tr(`company.brainField.${k}`)}</span>
          <textarea
            value={draft[k]}
            onChange={(e) => set(k, e.target.value)}
            placeholder={tr(`company.brainHint.${k}`)}
            maxLength={PERSONALITY_FIELD_MAX}
            rows={k === 'identity' || k === 'vibe' ? 2 : 3}
            disabled={!loaded || busy}
            style={input}
          />
        </label>
      ))}

      {preview && (
        <details>
          <summary style={{ ...label, cursor: 'pointer' }}>{tr('company.brainPreview', { file })}</summary>
          <pre style={{ ...box, fontFamily: 'var(--cth-font-mono)', fontSize: 11, whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{preview}</pre>
        </details>
      )}

      {error && <div role="alert" style={{ ...box, color: 'var(--cth-coral)' }}>{error}</div>}
      {saved && <div style={box}>{tr('company.brainSaved', { file })}</div>}

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <PixelButton variant="primary" size="md" onClick={save} disabled={!loaded || busy}>
          {tr('company.brainSave')}
        </PixelButton>
      </div>
    </div>
  );
}
