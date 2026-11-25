import type { TFunction } from 'i18next';

/** Last path segment, on either separator: a Windows `C:\work\repo` has no '/',
 *  so a '/'-only split showed the whole absolute path as the name. */
export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

/** Colour for a git status letter (M/A/D/R/C/?). */
export function statusColor(code: string): string {
  if (code === 'M') return 'var(--cth-lemon)';
  if (code === 'A') return 'var(--cth-mint)';
  if (code === 'D') return 'var(--cth-coral)';
  if (code === 'R' || code === 'C') return 'var(--cth-lilac)';
  if (code === '?') return 'var(--cth-ink-300)';
  return 'var(--cth-ink-500)';
}

/** "just now" / "5m ago" / "in 2h", from `<ns>.justNow`, `<ns>.ago`, `<ns>.in`. */
export function relTime(ms: number, t: TFunction, ns: string): string {
  const past = ms >= 0;
  const a = Math.abs(ms);
  if (a < 45_000) return t(`${ns}.justNow`);
  const mins = Math.round(a / 60_000);
  const unit = mins < 60 ? `${mins}m` : mins < 1440 ? `${Math.round(mins / 60)}h` : `${Math.round(mins / 1440)}d`;
  return past ? t(`${ns}.ago`, { unit }) : t(`${ns}.in`, { unit });
}
