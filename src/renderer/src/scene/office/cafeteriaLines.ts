// Cafeteria small-talk — Pinoy office edition.
//
// The cast is a Filipino office (see cast.ts), so an agent's coffee break is an
// excuse for Taglish chika: chismis, pasabog na chika, gay lingo, sweldo-day
// hope and merienda politics. Two kinds of line:
//   • solo  — one quip shown above a single agent at a break spot
//   • pair  — a two-beat exchange between two agents at the same table
//
// The WORDS live in the locale files (`office.cafeteria` in en/zh-CN/ar), so
// the language picker switches them like every other string; this module only
// picks. Character keys match OfficeCharacterName; anyone without bespoke
// lines falls back to the shared pool so the floor never feels empty.

import type { OfficeCharacterName } from './cast';

/** Where an agent is lingering — picks a contextual line pool. */
export type BreakSpot = 'coffee' | 'vending' | 'snack' | 'table';

/** The shape of `t('office.cafeteria', { returnObjects: true })`. Exchanges are
 *  beats that ALTERNATE between the two agents: beat[0] = the one who sat down,
 *  beat[1] = their table-mate, and so on. */
export interface CafeteriaLines {
  solo: Record<BreakSpot, readonly string[]>;
  character: Partial<Record<OfficeCharacterName, readonly string[]>>;
  pair: readonly (readonly string[])[];
  keyed: Partial<Record<OfficeCharacterName, readonly string[]>>;
}

const pick = <T,>(arr: readonly T[], seed: number): T =>
  arr[((seed % arr.length) + arr.length) % arr.length];

const nonEmpty = (arr: unknown): arr is readonly string[] => Array.isArray(arr) && arr.length > 0;

/** A solo break-room line. Character flavour ~60% of the time, else the line
 *  fits the spot the agent is standing at. `seed` keeps it deterministic per
 *  call site. Returns '' when the locale has no lines (nothing is shown). */
export function pickSoloLine(lines: CafeteriaLines | undefined, character: OfficeCharacterName, spot: BreakSpot, seed: number): string {
  const flavour = lines?.character?.[character];
  if (nonEmpty(flavour) && seed % 5 < 3) return pick(flavour, Math.floor(seed / 5));
  const pool = lines?.solo?.[spot];
  return nonEmpty(pool) ? pick(pool, seed) : '';
}

/** A multi-beat exchange for two agents sharing a table. Beats alternate:
 *  index 0 = `speaker`, 1 = the table-mate, 2 = speaker, … Keyed off the
 *  SPEAKER so, when the right character sits down first, they open with their
 *  signature bit. Empty when the locale has no exchanges. */
export function pickExchange(lines: CafeteriaLines | undefined, speaker: OfficeCharacterName, seed: number): readonly string[] {
  const keyed = lines?.keyed?.[speaker];
  if (nonEmpty(keyed) && seed % 4 === 0) return keyed;
  const pool = lines?.pair;
  return Array.isArray(pool) && pool.length > 0 ? pick(pool, seed) : [];
}
