/**
 * Spawn one hire from a floor without opening the Add-Agent form.
 *
 * Mirrors AddAgentModal.submit for a fresh (non-resume) hire: the command is
 * built LOCALLY from the provider preset + the manifest's allowlisted flags, so a
 * floor can never name the binary. Returns the Agent to add, or an error.
 */
import type { Agent } from '@/store/store';
import type { HireManifest } from '@shared/hire';
import { OFFICE_CAST, DEFAULT_CHARACTER, type OfficeCharacterName } from '@/scene/office/cast';
import { type AccentColorName } from '@/design/tokens';
import {
  type AgentProvider,
  type HarnessConfig,
  buildSpawnCommand,
  tokenizeCommand,
  inferAgentProvider
} from '@/store/config';

const ACCENTS: AccentColorName[] = ['coral', 'mint', 'sky', 'lemon', 'lilac', 'peach'];

function characterFor(m: HireManifest): OfficeCharacterName {
  if (m.character && OFFICE_CAST.some(c => c.name === m.character)) return m.character as OfficeCharacterName;
  const q = m.name.trim().toLowerCase();
  const hit = OFFICE_CAST.find(c => c.displayName.toLowerCase() === q || c.name === q);
  return hit ? hit.name : DEFAULT_CHARACTER;
}

function basename(path: string): string {
  return path.split('/').filter(Boolean).pop() ?? path;
}

export function floorHireCommand(config: HarnessConfig, m: HireManifest): { command: string; provider: AgentProvider } {
  const provider: AgentProvider = m.provider ?? inferAgentProvider(config.defaultCommand);
  const base = buildSpawnCommand(config, m.model, provider);
  return { command: m.commandFlags?.length ? `${base} ${m.commandFlags.join(' ')}` : base, provider };
}

export async function spawnFloorHire(
  config: HarnessConfig,
  m: HireManifest,
  cwd: string
): Promise<{ ok: true; agent: Agent } | { ok: false; error: string }> {
  const { command, provider } = floorHireCommand(config, m);
  const id = `${m.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const ptyId = `pty-${id}`;
  const [exe, ...args] = tokenizeCommand(command);
  const isolate = m.isolate ?? false;
  const res = await window.cth.spawnPty({
    id: ptyId,
    cwd,
    command: exe,
    provider,
    args,
    cols: 100,
    rows: 30,
    isolate,
    hive: { id, name: m.name, provider, cwd, role: m.description, capabilities: m.capabilities }
  });
  if (!res.ok) return { ok: false, error: res.error ?? 'spawn failed' };
  const spawnedCwd = res.cwd || cwd;
  const agent: Agent = {
    id,
    name: m.name,
    character: characterFor(m),
    accent: ACCENTS.includes(m.accent as AccentColorName) ? (m.accent as AccentColorName) : 'sky',
    description: m.description || 'a fresh harness',
    project: basename(isolate ? cwd : spawnedCwd),
    tmuxTarget: '',
    cwd: spawnedCwd,
    goal: m.goal || undefined,
    status: 'idle',
    action: 'starting up',
    progress: 0,
    currentStation: 'desk',
    ptyId,
    command,
    provider,
    model: m.model,
    worktreePath: res.worktreePath,
    seedPrompt: res.seedPrompt,
    recentTextTs: Date.now()
  };
  return { ok: true, agent };
}
