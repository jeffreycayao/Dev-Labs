/**
 * How a god-hired worker's spawn request becomes an executable + argv, as a
 * pure function: this exact translation silently killed real workers for days
 * while reporting success, which is what earned it a unit test.
 */
import { AGENT_PROVIDER_PRESETS, autoModeFlagForProvider, commandBinary, hasAutoModeStance, inferAgentProvider } from '../shared/agentProvider';
import { tokenizeCommand } from '../shared/commandLine';

export interface WorkerLaunch {
  /** The executable name alone — what the PTY layer resolves and spawns. */
  bin: string;
  /** Everything else, in argv form, model flag included when applicable. */
  args: string[];
  /** The full effective command line, for display and floor cards. */
  command: string;
  /** True when the request named its own command (untrusted, allowlisted);
   *  false when it fell back to the user's configured default (trusted). */
  fromRequest: boolean;
}

export function buildWorkerLaunch(opts: {
  /** `command` from the spawn request — god authors a full command LINE. */
  requestCommand?: unknown;
  requestProvider?: unknown;
  /** Separate `model` field from the request, if any. */
  requestModel?: unknown;
  defaultCommand?: string;
  /** The app's auto (skip-permissions) setting. */
  autoMode: boolean;
}): WorkerLaunch {
  const fromRequest = typeof opts.requestCommand === 'string' && !!opts.requestCommand.trim();
  let command = fromRequest
    ? (opts.requestCommand as string).trim()
    : (opts.defaultCommand ?? 'claude');
  // Inherit the app's auto (skip-permissions) mode when the request takes no
  // stance of its own: a headless worker has no human to click through tool
  // prompts, so without the flag it stalls at the first ask until the idle
  // reaper kills it. The flag is the PROVIDER'S — a codex worker needs
  // `-a never -s workspace-write`, and claude's --permission-mode
  // would mean nothing to it (an earlier hardcoded-claude version left every
  // non-claude worker stalling; review caught it). An explicit stance in the
  // request still wins: the flag's leading token already present as a TOKEN
  // (not substring — copilot's flag starts with `-s`) means the request chose.
  const provider = inferAgentProvider(command, opts.requestProvider);
  const autoFlag = opts.autoMode ? autoModeFlagForProvider(provider) : '';
  if (autoFlag && !hasAutoModeStance(tokenizeCommand(command), provider)) {
    command += ` ${autoFlag}`;
  }
  // god authors `command` as a full command LINE ("claude --model … --permission-mode …"),
  // but the PTY layer takes ONE executable name (resolveCommand) plus argv — the
  // unsplit line made node-pty exec a binary literally named like the whole
  // string → ENOENT → the worker died within ~1s of spawning while its request
  // archived as .done (this killed both flag-carrying Ryan spawns on 2026-08-16;
  // only the bare-`claude` one lived). Split with the SAME tokenizer the
  // renderer's spawn flows use, and hand the flags over as argv.
  const tokens = tokenizeCommand(command);
  const bin = tokens[0] || command;
  const flags = tokens.slice(1);
  // A separate `model` field only applies when the command line didn't pick a
  // model itself (spawnAgentCore likewise skips its default-model injection
  // when argv already carries --model).
  const model =
    typeof opts.requestModel === 'string' && opts.requestModel.trim() ? opts.requestModel.trim() : '';
  const args = [...flags, ...(model && !flags.includes('--model') ? ['--model', model] : [])];
  return { bin, args, command, fromRequest };
}

/** Flags a spawn REQUEST may carry. A default-deny allowlist like the hire
 *  manifest's: the request file is agent-reachable, and flags such as Claude's
 *  `--settings` / `--mcp-config` / `--plugin-dir` or Codex's `-c` load hooks or
 *  servers that run any program outside the sandbox. Each provider's own
 *  auto-mode flags are included, since buildWorkerLaunch appends them. */
const WORKER_FLAGS = new Set([
  '--model', '-m', '--max-turns', '--output-format', '--verbose', '--permission-mode',
  ...AGENT_PROVIDER_PRESETS.flatMap((p) => tokenizeCommand(p.autoModeFlag ?? '').filter((t) => t.startsWith('-')).map((t) => t.split('=')[0]))
]);
/** Flags whose value changes how sandboxed the agent is: only these values. */
const WORKER_FLAG_VALUES: Record<string, ReadonlySet<string>> = {
  '-s': new Set(['workspace-write', 'read-only']),          // codex sandbox (never danger-full-access)
  '--sandbox': new Set(['workspace-write', 'read-only']),
  '-a': new Set(['never', 'on-request', 'on-failure', 'untrusted'])
};

/** The first request flag that is not allowed, or null when all are. A plain
 *  value (not starting with `-`) is accepted only right after an allowed flag. */
export function disallowedWorkerFlag(args: readonly string[]): string | null {
  let prev: string | null = null;
  for (const tok of args) {
    if (tok.startsWith('-')) {
      const [name, inline] = [tok.split('=')[0], tok.includes('=') ? tok.slice(tok.indexOf('=') + 1) : null];
      if (!WORKER_FLAGS.has(name)) return tok;
      if (inline !== null && WORKER_FLAG_VALUES[name] && !WORKER_FLAG_VALUES[name].has(inline)) return tok;
      prev = inline === null ? name : null;
      continue;
    }
    if (!prev) return tok;
    if (WORKER_FLAG_VALUES[prev] && !WORKER_FLAG_VALUES[prev].has(tok)) return `${prev} ${tok}`;
    prev = null;
  }
  return null;
}

/** May a spawn-request start this executable? Only a known agent CLI
 *  (`claude`, `codex`, `cursor-agent`, …) by bare name, looked up on PATH like
 *  the app does. A path is refused outright — `/tmp/claude` is any program — as
 *  is a shell, `node -e`, or anything else: the request file is agent-reachable
 *  input. Applies only to a command the request names; the user's own
 *  configured default is trusted. */
export function isAllowedWorkerBin(bin: string): boolean {
  // shortcut: a path-qualified bin is refused even when it is the PATH copy; compare resolved paths if anyone needs it
  if (/[\\/\s]/.test(bin)) return false;
  const name = commandBinary(bin);
  return /^[a-z0-9_-]+$/.test(name) && inferAgentProvider(name) !== 'custom';
}
