// Shared brand tokens — mirror of the landing page + DESIGN.md.
export const C = {
  maroon: '#6E1423',
  maroonD: '#4A0D17',
  ink: '#1A0A0E',
  ink2: '#2A1014',
  ink900: '#1A1320',
  cream: '#F4F1EA',
  creamD: '#E7E2D8',
  gold: '#F4D35E',
  muted: '#B9A9AC',
  // agent accents (DESIGN.md §3.3)
  coral: '#FF6B6B',
  coralL: '#FFB4B4',
  mint: '#6BCF7F',
  mintL: '#B4E5BD',
  sky: '#4ECDC4',
  skyL: '#A8E6E0',
  lemon: '#FFD93D',
  lemonL: '#FFEC99',
  lilac: '#B197FC',
  lilacL: '#D6C5FF',
  skin: '#E8C39E',
  wood: '#C9A66B',
  woodL: '#E5C896',
  termBg: '#0c0608',
  termFg: '#d7c9a8',
} as const;

// Single typeface to match the landing page (JetBrains Mono). The render
// substitutes the loaded family via the exports in fonts.ts; these names are
// only the CSS fallback labels.
export const FONT = {
  display: '"JetBrains Mono"',
  mono: '"JetBrains Mono"',
  ui: '"JetBrains Mono"',
} as const;

export const FPS = 30;
