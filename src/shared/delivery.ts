/**
 * Deliveries: finished files an agent hands back (HTML, Markdown, PDF, DOCX,
 * images, …). Pure helpers shared by main (capture, validation) and the
 * renderer (the Deliveries tray), so both agree on kinds, limits and names.
 *
 * Flow: an agent writes the file, then sends an outbox message with
 * `"attachments": ["report.html"]`. The router copies each file into
 * `<hive>/deliveries/<message-id>/` (a snapshot, so later edits never change
 * what was delivered), writes `delivery.json`, and routes the message as usual.
 * The human reviews the snapshot in the Deliveries tray: approve, or request
 * changes, which mails the agent back.
 */

export const DELIVERY_LIMITS = {
  /** Attachments per message; extras are skipped (and reported). */
  maxFiles: 20,
  /** Per file. Bigger files are skipped, not truncated. */
  maxFileBytes: 50 * 1024 * 1024,
  /** Per delivery. */
  maxTotalBytes: 200 * 1024 * 1024,
  /** Inline preview caps (renderer), so one huge file can't stall the UI. */
  maxPreviewTextBytes: 2 * 1024 * 1024,
  maxPreviewImageBytes: 15 * 1024 * 1024
} as const;

export type DeliveryKind =
  | 'html' | 'markdown' | 'text' | 'image' | 'pdf' | 'word' | 'sheet' | 'slides' | 'other';

export type DeliveryStatus = 'new' | 'seen' | 'approved' | 'changes';
export const DELIVERY_STATUSES: readonly DeliveryStatus[] = ['new', 'seen', 'approved', 'changes'];

export interface DeliveryFile {
  /** Safe file name inside the delivery folder. */
  name: string;
  size: number;
  kind: DeliveryKind;
}

export interface DeliverySkipped {
  /** The path the agent gave, as given (trimmed). */
  path: string;
  reason: 'not-found' | 'not-a-file' | 'symlink' | 'outside-workspace' | 'too-large' | 'too-many' | 'total-too-large';
}

export interface Delivery {
  /** Same as the message id that carried it. */
  id: string;
  from: string;
  to: string;
  subject: string;
  /** The message body (the agent's note), as sent. */
  note: string;
  conversation: string;
  createdAt: string;
  files: DeliveryFile[];
  skipped: DeliverySkipped[];
  status: DeliveryStatus;
  /** When the human last changed the status, and their note for "changes". */
  reviewedAt?: string;
  feedback?: string;
}

const EXT_KIND: Record<string, DeliveryKind> = {
  html: 'html', htm: 'html',
  md: 'markdown', markdown: 'markdown', mdx: 'markdown',
  txt: 'text', csv: 'text', tsv: 'text', json: 'text', log: 'text', xml: 'text', yml: 'text', yaml: 'text',
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image', avif: 'image',
  pdf: 'pdf',
  doc: 'word', docx: 'word', odt: 'word', rtf: 'word',
  xls: 'sheet', xlsx: 'sheet', ods: 'sheet',
  ppt: 'slides', pptx: 'slides', odp: 'slides', key: 'slides'
};

export function extensionOf(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1).toLowerCase() : '';
}

export function deliveryKind(name: string): DeliveryKind {
  return EXT_KIND[extensionOf(name)] ?? 'other';
}

/** Kinds the app may hand to the OS default app. Everything else is only ever
 *  revealed in the file browser: an agent-supplied `.exe`, `.dmg`, `.sh`,
 *  `.command` or `.desktop` must never be one click from running (the same rule
 *  as fs:revealPath). */
export function canOpenWithSystemApp(name: string): boolean {
  return deliveryKind(name) !== 'other';
}

export const MIME_BY_EXT: Record<string, string> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif', pdf: 'application/pdf'
};

/**
 * A file name that is safe to create inside the delivery folder: the last path
 * segment only, no control characters, no leading dots (no hidden files, no
 * "..") and a bounded length that keeps the extension.
 */
export function safeFileName(input: string): string {
  let base = String(input ?? '').split(/[\\/]/).pop() ?? '';
  base = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim().replace(/^\.+/, '');
  if (!base) base = 'file';
  if (base.length > 120) {
    const ext = extensionOf(base);
    const keep = ext && ext.length < 16 ? `.${ext}` : '';
    base = base.slice(0, 120 - keep.length) + keep;
  }
  return base;
}

/** Pick a name not already in `taken` ("report.html" → "report-2.html"). */
export function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name.toLowerCase())) return name;
  const ext = extensionOf(name);
  const stem = ext ? name.slice(0, -(ext.length + 1)) : name;
  for (let i = 2; ; i++) {
    const candidate = ext ? `${stem}-${i}.${ext}` : `${stem}-${i}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/** Accept `attachments` as a string or a list of strings; drop anything else,
 *  blanks and duplicates. The count cap is applied later so extras are
 *  reported as skipped rather than silently dropped. */
export function normalizeAttachments(raw: unknown): string[] {
  const list = typeof raw === 'string' ? [raw] : Array.isArray(raw) ? raw : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const v of list) {
    if (typeof v !== 'string') continue;
    const p = v.trim();
    if (!p || p.length > 4096 || p.includes('\0') || seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

export function isDeliveryStatus(v: unknown): v is DeliveryStatus {
  return typeof v === 'string' && (DELIVERY_STATUSES as readonly string[]).includes(v);
}

/** Delivery ids are message ids; allow only their character set so an id can
 *  never walk out of the deliveries folder. */
export function isDeliveryId(v: unknown): v is string {
  return typeof v === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(v) && !v.startsWith('.');
}
