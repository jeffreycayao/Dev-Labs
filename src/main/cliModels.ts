/**
 * Live model discovery from the agent CLIs installed on this machine.
 *
 * The baked/remote catalog only carries curated quick-picks, so a provider the
 * user authenticated inside the CLI itself (e.g. `opencode auth login` → Z.AI
 * Coding Plan) never reached the picker. `opencode models` prints exactly the
 * `provider/model` slugs the user holds credentials for, so it is the source of
 * truth; the renderer appends these after the curated entries.
 *
 * Never throws: a missing CLI, a timeout or odd output all yield an empty list.
 */
import { spawn } from 'node:child_process';
import { userShellPath } from './shellEnv';
import type { CatalogModel } from '../shared/modelCatalogPayload';

const TTL_MS = 10 * 60 * 1000;
const TIMEOUT_MS = 20_000;

/** Friendly provider names for picker labels; unknown ids show as-is. */
const PROVIDER_LABELS: Record<string, string> = {
  'zai-coding-plan': 'Z.ai Coding Plan',
  zai: 'Z.ai',
  zhipuai: 'Zhipu AI',
  'zhipuai-coding-plan': 'Zhipu Coding Plan',
  openrouter: 'OpenRouter',
  opencode: 'OpenCode Zen',
  anthropic: 'Anthropic',
  openai: 'OpenAI',
  google: 'Google',
  deepseek: 'DeepSeek',
  moonshotai: 'Moonshot',
  groq: 'Groq',
  ollama: 'Ollama',
  lmstudio: 'LM Studio'
};

/** OpenRouter exposes hundreds of models; only these families are listed live
 *  (the rest stay reachable by typing the slug in the command field). */
const OPENROUTER_FAMILIES = ['z-ai/'];

/** `provider/model` slugs from `opencode models` output, in order, de-duplicated. */
export function parseOpencodeModels(stdout: string): string[] {
  const seen = new Set<string>();
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (/^[\w.-]+\/[\w.:~/-]+$/.test(line)) seen.add(line);
  }
  return [...seen];
}

/** Catalog entries for the live slugs: direct providers first, then the
 *  allowed OpenRouter families, each labelled "model (Provider)". */
export function toOpencodeEntries(slugs: string[]): CatalogModel[] {
  const direct: CatalogModel[] = [];
  const routed: CatalogModel[] = [];
  for (const id of slugs) {
    const slash = id.indexOf('/');
    const provider = id.slice(0, slash);
    const model = id.slice(slash + 1);
    if (provider === 'openrouter') {
      if (OPENROUTER_FAMILIES.some((f) => model.startsWith(f))) {
        routed.push({ id, label: `${model.replace(/^[^/]*\//, '')} (OpenRouter)` });
      }
      continue;
    }
    direct.push({ id, label: `${model} (${PROVIDER_LABELS[provider] ?? provider})` });
  }
  return [...direct, ...routed];
}

function runOpencodeModels(): Promise<string> {
  return new Promise((resolve) => {
    let out = '';
    let done = false;
    const finish = (): void => { if (!done) { done = true; resolve(out); } };
    try {
      // Constant command string, no user input. On Windows npm installs
      // opencode as a .cmd/.ps1 shim, which only a shell can execute.
      const child = process.platform === 'win32'
        ? spawn('opencode models', { shell: true, windowsHide: true })
        : spawn('opencode', ['models'], { env: { ...process.env, PATH: userShellPath() } });
      const timer = setTimeout(() => { child.kill(); finish(); }, TIMEOUT_MS);
      child.stdout?.on('data', (d: Buffer) => { out += d.toString('utf8'); });
      child.on('error', () => { clearTimeout(timer); finish(); });
      child.on('close', () => { clearTimeout(timer); finish(); });
    } catch {
      finish();
    }
  });
}

let cache: { at: number; entries: CatalogModel[] } | null = null;
let inflight: Promise<CatalogModel[]> | null = null;

/** Live models per provider id. Cached for TTL_MS; `force` re-probes. */
export async function listLiveModels(force = false): Promise<Record<string, CatalogModel[]>> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return { opencode: cache.entries };
  inflight ??= runOpencodeModels()
    .then((stdout) => toOpencodeEntries(parseOpencodeModels(stdout)))
    .catch(() => [] as CatalogModel[])
    .finally(() => { inflight = null; });
  const entries = await inflight;
  cache = { at: Date.now(), entries };
  return { opencode: entries };
}
