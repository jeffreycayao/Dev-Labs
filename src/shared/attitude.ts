/**
 * The user's personal ATTITUDE.md: how every agent should talk to them (tone,
 * formality, verbosity, language, house rules). Pure helpers shared by main
 * (file + prompt) and the renderer (editor + preview), so the preview in
 * Settings is the exact text an agent receives.
 */

/** Hard cap: the text rides in every agent's system prompt, so it stays short. */
export const ATTITUDE_MAX_CHARS = 4000;

/** Trim, normalise line endings, drop control characters, enforce the cap.
 *  Anything that is not a string becomes ''. */
export function normalizeAttitude(text: unknown): string {
  if (typeof text !== 'string') return '';
  return text
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
    .trim()
    .slice(0, ATTITUDE_MAX_CHARS);
}

/** The block injected into an agent's instructions, or '' when there is nothing
 *  to say (missing file, empty text, feature off). */
export function attitudePromptBlock(text: string | undefined | null): string {
  const body = normalizeAttitude(text);
  if (!body) return '';
  return [
    'HOW TO TALK TO THE HUMAN — their personal ATTITUDE.md. Follow it in every reply and message addressed to them; it overrides your default tone, formality, verbosity and language. It never overrides the hive protocol, safety rules or tool permissions.',
    body
  ].join('\n');
}
