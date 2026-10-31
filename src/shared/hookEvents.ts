/** Renderer-facing hook event shared across the Electron IPC boundary. */
export interface HookEvent {
  agentId?: string;
  event: string;
  tool?: string;
  notificationType?: string;
  source?: string;
  message?: string;
  /** Short summary of the tool input: the Bash command or the file path for
   *  Edit/Write/Read, capped at TOOL_DETAIL_MAX. Drives the 3D office (QA lab,
   *  desk monitors). Never leaves the machine. */
  detail?: string;
  blocked?: boolean;
}

export const TOOL_DETAIL_MAX = 200;

/** Pull the useful bit out of a Claude Code tool_input, or undefined. */
export function toolDetail(toolInput: unknown): string | undefined {
  if (typeof toolInput !== 'object' || toolInput === null) return undefined;
  const input = toolInput as Record<string, unknown>;
  const raw = [input.command, input.file_path, input.path, input.notebook_path]
    .find((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return raw ? raw.trim().replace(/\s+/g, ' ').slice(0, TOOL_DETAIL_MAX) : undefined;
}

const OPTIONAL_STRING_FIELDS = ['tool', 'notificationType', 'source', 'message', 'detail'] as const;

/** Validate an untrusted payload before it crosses the Electron IPC boundary. */
export function validateHookEvent(value: unknown): value is HookEvent {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;

  const candidate = value as Record<string, unknown>;
  if (typeof candidate.event !== 'string' || candidate.event.length === 0) return false;
  if (
    candidate.agentId !== undefined &&
    (typeof candidate.agentId !== 'string' || candidate.agentId.length === 0)
  ) return false;

  for (const field of OPTIONAL_STRING_FIELDS) {
    if (candidate[field] !== undefined && typeof candidate[field] !== 'string') return false;
  }

  return candidate.blocked === undefined || typeof candidate.blocked === 'boolean';
}
