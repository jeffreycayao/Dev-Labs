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
import { MODEL_RE } from '../shared/hire';

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

/** One OpenRouter model as the Add Agent picker shows it. `id` is the engine
 *  slug (`openrouter/<vendor>/<model>`), the same form as OSS_PROVIDER_PICKS. */
export interface OpenRouterModel {
  id: string;
  label: string;
  free: boolean;
  /** USD per million input tokens (0 for free models). */
  inPerM: number;
  ctx: number;
}

/** Models from OpenRouter's public `/models` list that a coding agent can use:
 *  tool calling supported, a real price (routers report -1), and an id that is
 *  safe on a command line. Free = both input and output price are 0. */
export function parseOpenRouterModels(json: unknown): OpenRouterModel[] {
  const data = (json as { data?: unknown })?.data;
  if (!Array.isArray(data)) return [];
  const out: OpenRouterModel[] = [];
  for (const m of data as (Record<string, unknown> | null)[]) {
    if (!m || typeof m.id !== 'string' || !m.id) continue; // one bad row must not empty the list
    const id = `openrouter/${m.id}`;
    if (!MODEL_RE.test(id)) continue; // network data ends up after --model
    const params = Array.isArray(m.supported_parameters) ? m.supported_parameters : [];
    if (!params.includes('tools')) continue;
    const pricing = (m.pricing ?? {}) as Record<string, unknown>;
    const inp = Number(pricing.prompt);
    const outp = Number(pricing.completion);
    if (!Number.isFinite(inp) || !Number.isFinite(outp) || inp < 0 || outp < 0) continue;
    out.push({
      id,
      label: typeof m.name === 'string' && m.name ? m.name.slice(0, 80) : id.slice(11),
      free: inp === 0 && outp === 0,
      inPerM: inp * 1e6,
      ctx: Number(m.context_length) || 0
    });
  }
  return out.sort((a, b) => a.label.localeCompare(b.label));
}

let orCache: { at: number; models: OpenRouterModel[] } | null = null;

/** OpenRouter's model list (public, no key needed). Cached for TTL_MS; on a
 *  network error the last good list is kept. */
export async function listOpenRouterModels(force = false): Promise<OpenRouterModel[]> {
  if (!force && orCache && Date.now() - orCache.at < TTL_MS) return orCache.models;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) return orCache?.models ?? [];
    const models = parseOpenRouterModels(await res.json());
    if (models.length) orCache = { at: Date.now(), models };
    return models;
  } catch {
    return orCache?.models ?? [];
  }
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
