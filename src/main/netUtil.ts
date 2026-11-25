/** Small helpers several main-process network modules shared as copies. */

/** An error's message, whatever was thrown. */
export function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The `error` (string or `{ message }`) from a JSON error body, or ''. */
export function extractError(raw: string): string {
  try {
    const j = JSON.parse(raw) as { error?: { message?: string } | string };
    if (typeof j.error === 'string') return j.error;
    if (j.error && typeof j.error.message === 'string') return j.error.message;
  } catch { /* not json */ }
  return '';
}

/** A socket address on this machine (IPv4 127/8, IPv6 ::1, or v4-mapped). */
export function isLoopback(addr: string): boolean {
  const a = addr.replace(/^::ffff:/, '');
  return a === '::1' || a.startsWith('127.');
}
