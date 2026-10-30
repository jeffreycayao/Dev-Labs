// Design tokens — single source of truth. Mirrors tokens.css for non-styled consumers (Pixi).
// Any change here must also update tokens.css.

export const colors = {
  cream: {
    50: 0xf7f9f2,
    100: 0xf0f3e8,
    200: 0xe5eadb,
    300: 0xd8dfcb
  },
  paper: {
    100: 0xfffffb,
    200: 0xedf1e3
  },
  ink: {
    900: 0x181c17,
    700: 0x363d32,
    500: 0x596254,
    300: 0x737c6a,
    100: 0xd9dfcf
  },
  // v0.3.4 recalibration: same hues, professional saturation (mirrors tokens.css)
  accent: {
    coral: 0xcf5f52,
    coralLight: 0xf5d9d2,
    mint: 0x5e9a4e,
    mintLight: 0xdcebd2,
    sky: 0x4a8a9a,
    skyLight: 0xd3e6ea,
    lemon: 0xcdf252,
    lemonLight: 0xf0fbcf,
    lilac: 0x8a79c2,
    lilacLight: 0xe3ddf2,
    peach: 0xd4af37,
    peachLight: 0xf4e9c4
  },
  // Brand key accent (--cth-key): the ONE key word, asterisks.
  key: 0xe1642d,
  status: {
    idle: 0xa3977f,
    thinking: 0x4a8a9a,
    working: 0x9dbb2e,
    blocked: 0xcf5f52,
    success: 0x5e9a4e,
    ghost: 0xd9dfcf
  },
  world: {
    grassLight: 0xd4eab0,
    grassDark: 0xb5d589,
    woodLight: 0xe5c896,
    woodDark: 0xc9a66b,
    path: 0xe8d8b0,
    wall: 0x8b6f47
  }
} as const;

export const space = {
  0: 0, 1: 4, 2: 8, 3: 12, 4: 16, 5: 24, 6: 32, 7: 48, 8: 64
} as const;

export const type = {
  display: '"Plus Jakarta Sans", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  ui: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", sans-serif',
  mono: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, "PingFang SC", "Microsoft YaHei", "Noto Sans Mono CJK SC", "Noto Sans CJK SC", "Geeza Pro", "Noto Naskh Arabic", "Segoe UI Historic", monospace'
} as const;

export const tileSize = 32; // px — the world is built from 32×32 tiles

export type AccentColorName =
  | 'coral' | 'mint' | 'sky' | 'lemon' | 'lilac' | 'peach';

export const accentByName: Record<AccentColorName, number> = {
  coral: colors.accent.coral,
  mint:  colors.accent.mint,
  sky:   colors.accent.sky,
  lemon: colors.accent.lemon,
  lilac: colors.accent.lilac,
  peach: colors.accent.peach
};

export const accentLightByName: Record<AccentColorName, number> = {
  coral: colors.accent.coralLight,
  mint:  colors.accent.mintLight,
  sky:   colors.accent.skyLight,
  lemon: colors.accent.lemonLight,
  lilac: colors.accent.lilacLight,
  peach: colors.accent.peachLight
};

// Convert 0xRRGGBB to "#RRGGBB"
export function hex(c: number): string {
  return '#' + c.toString(16).padStart(6, '0').toUpperCase();
}
