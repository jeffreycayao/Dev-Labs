// Pure helpers for the 3D office's activity signals (see
// src/renderer/src/scene/office3d/useOfficeActivity.ts).

const TEST_COMMAND_RE =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?test\b|\b(?:vitest|jest|mocha|pytest|playwright\s+test|phpunit|rspec)\b|\bgo\s+test\b|\bcargo\s+test\b|\bnode\s+--test\b|\bdotnet\s+test\b/i;

/** True when a Bash tool call's text looks like it runs a test suite. */
export function isTestCommand(text: string | undefined | null): boolean {
  return typeof text === 'string' && TEST_COMMAND_RE.test(text);
}
