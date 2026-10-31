// What a working agent's bubble says in the 3D office: "<icon> <target>", like
// the 2D office's tool bubble did ("$ npm test", "> App.tsx", "< SPEC.md").
// The agent's `action` comes from hook events ("bash git push", from the tool
// name plus its command or file) or the terminal parser (same shape).

const ICON: Record<string, string> = {
  bash: '$',
  edit: '>',
  write: '>',
  multiedit: '>',
  notebookedit: '>',
  read: '<',
  grep: '?',
  glob: '?',
  webfetch: '@',
  websearch: '@',
  todowrite: '=',
  task: '*'
};

// Status words, not activity: the bubble keeps its animated dots for these.
const NOT_ACTIVITY = new Set([
  'idle',
  'awaiting',
  'thinking',
  'resumed',
  'starting up',
  'starting engine…',
  'running the floor',
  'reading inbox'
]);

/** Longest bubble text; a long command or path is cut with "…". */
export const ACTIVITY_MAX = 60;

/** Bubble text for an action, or '' when there is nothing concrete to show. */
export function activityBubble(action: string | null | undefined): string {
  const text = (action ?? '').trim().replace(/\s+/g, ' ');
  if (!text || NOT_ACTIVITY.has(text.toLowerCase())) return '';
  // A tool with no detail ("using Bash") still gets its icon.
  const bare = /^using (\S+)$/i.exec(text);
  const [head, ...rest] = bare ? [bare[1]] : text.split(' ');
  const icon = ICON[head.toLowerCase()];
  const out = icon ? `${icon} ${rest.length ? rest.join(' ') : head}` : text;
  return out.length > ACTIVITY_MAX ? `${out.slice(0, ACTIVITY_MAX - 1)}…` : out;
}
