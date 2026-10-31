import Editor from '@monaco-editor/react';
import { setupMonaco, CTH_MONACO_THEME } from '@/ide/monaco';

// Same bundled Monaco and theme as the IDE (no CDN fetch, no unthemed first paint).
setupMonaco();

/**
 * A small JSON editor for a webhook's schema. Same Monaco the IDE uses, cut
 * down for a sidebar: no line numbers, no minimap, no folding — those eat a
 * third of the width here and none of them help edit twenty lines of schema.
 */
export function JsonEditor({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ background: 'var(--cth-paper-100)', boxShadow: 'inset 0 0 0 1px var(--cth-ink-100)' }}>
      <Editor
        height="180px"
        language="json"
        theme={CTH_MONACO_THEME}
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          fontFamily: 'var(--cth-font-mono)',
          fontSize: 13,
          lineHeight: 17,
          lineNumbers: 'off',
          glyphMargin: false,
          folding: false,
          lineDecorationsWidth: 8,
          minimap: { enabled: false },
          scrollBeyondLastLine: false,
          renderLineHighlight: 'none',
          wordWrap: 'on',
          quickSuggestions: false,
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 6, bottom: 6 }
        }}
      />
    </div>
  );
}
