import { createAnsiStripper } from './ansiText';

/** The IPC spawn response only confirms that a process was created. An agent CLI
 * can still exit immediately, or wait for an interactive first-run question. */
export interface PtyStartupBridge {
  onPtyData(id: string, callback: (chunk: string) => void): () => void;
  onPtyExit(id: string, callback: (info: { exitCode: number }) => void): () => void;
  listPtys(): Promise<Array<{ id: string }>>;
}

export type PtyStartup =
  | { kind: 'running' }
  | { kind: 'needs-input' }
  | { kind: 'exited'; exitCode?: number; output: string };

/** First-run Codex menus must be answered by a person in the visible terminal. */
export function terminalNeedsStartupInput(text: string): boolean {
  // Windows sandbox setup may wait for an OS UAC dialog outside the PTY. Keep
  // this terminal visible and stop queued prompts until the person finishes it.
  return /set up (?:the )?(?:agent|windows|codex) sandbox to continue|(?:^|[\r\n])\s*windows sandbox setup (?:required|needs (?:administrator|admin) approval)\b|trust this folder\?|(?:^|[\r\n])\s*(?:\d+\.\s*|[❯>]\s*)sign in\b|how would you like to sign in|choose (?:how|a way) to sign in|(?:^|[\r\n])\s*(?:login|authentication) required\s*[.!]?(?=$|[\r\n])|(?:^|[\r\n])\s*(?:enter|paste) (?:your )?(?:openai )?api key\s*[.!]?(?=$|[\r\n])/i.test(text);
}

/** Subscribe before spawning so even an exit in the same IPC round trip is seen. */
export async function spawnAndObservePty<T extends { ok: boolean; setup?: string }>(
  id: string,
  bridge: PtyStartupBridge,
  spawn: () => Promise<T>,
  graceMs = 6_000
): Promise<{ result: T; startup?: PtyStartup }> {
  let output = '';
  const stripAnsi = createAnsiStripper();
  let resolveEvent!: (event: PtyStartup) => void;
  let settled = false;
  const event = new Promise<PtyStartup>((resolve) => { resolveEvent = resolve; });
  const finish = (value: PtyStartup) => {
    if (settled) return;
    settled = true;
    resolveEvent(value);
  };
  const stopData = bridge.onPtyData(id, (chunk) => {
    output = (output + stripAnsi(chunk).replace(/\r/g, '\n')).slice(-2_048);
    if (terminalNeedsStartupInput(output)) finish({ kind: 'needs-input' });
  });
  const stopExit = bridge.onPtyExit(id, ({ exitCode }) => {
    finish({ kind: 'exited', exitCode, output });
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await spawn();
    // The setup PTY is an installer or manual install hint. Its planned exit is
    // not an agent crash; the existing main-process relaunch owns that lifecycle.
    if (!result.ok || result.setup) return { result };
    if (!settled) {
      timer = setTimeout(() => finish({ kind: 'running' }), graceMs);
    }
    let startup = await event;
    if (startup.kind !== 'exited') {
      const live = await bridge.listPtys();
      if (!live.some((pty) => pty.id === id)) {
        startup = { kind: 'exited', output };
      }
    }
    return { result, startup };
  } finally {
    if (timer) clearTimeout(timer);
    stopData();
    stopExit();
  }
}
