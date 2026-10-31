// Company builder (ported from Claw3D): description → LLM team plan → validated
// floor manifest. Returns the floor only; the renderer hands it to the normal
// floor review, so nothing is ever spawned from here.
import { ipcMain } from 'electron';
import { readConfig } from '../config';
import { groqChat } from '../groq';
import { runHiddenClaude } from '../hiddenClaude';
import { buildCompanyPlanPrompt, parseCompanyPlan, COMPANY_MAX_DESCRIPTION } from '../../shared/office/companyBuilder';

const PLAN_MODEL_CLAUDE = 'claude-haiku-4-5';

export function registerCompanyBuilderIpc(): void {
  ipcMain.handle('office:companyBuilder:generate', async (_evt, description: unknown) => {
    if (typeof description !== 'string' || !description.trim()) {
      return { ok: false, error: 'Describe the company first.' };
    }
    if (description.length > COMPANY_MAX_DESCRIPTION) {
      return { ok: false, error: `Keep the description under ${COMPANY_MAX_DESCRIPTION} characters.` };
    }
    const prompt = buildCompanyPlanPrompt(description);
    const cfg = readConfig();

    // Groq when the user has saved a key (fast, no CLI); otherwise a hidden Claude run.
    let reply: { ok: boolean; text?: string; error?: string };
    let engine: 'groq' | 'claude';
    if (cfg.groqApiKey) {
      engine = 'groq';
      reply = await groqChat({
        apiKey: cfg.groqApiKey,
        temperature: 0.4,
        messages: [{ role: 'system', content: prompt.system }, { role: 'user', content: prompt.user }]
      });
    } else {
      engine = 'claude';
      if (!cfg.harnessHome) return { ok: false, error: 'Finish setting up your office first, or add a Groq key in Settings.' };
      reply = await runHiddenClaude(`${prompt.system}\n\n${prompt.user}`, {
        model: PLAN_MODEL_CLAUDE,
        cwd: cfg.harnessHome,
        // Pure text task: no file edits, no shell, no web.
        disallowedTools: ['Edit', 'Write', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch'],
        timeoutMs: 120_000
      });
    }
    if (!reply.ok || !reply.text) {
      return { ok: false, error: `The planner could not answer (${reply.error ?? 'no reply'}). Try again.`, engine };
    }
    return { ...parseCompanyPlan(reply.text), engine };
  });
}
