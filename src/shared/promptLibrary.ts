/**
 * Prompt Library — reusable prompts grouped by job category, shown in the
 * message composer for the agent being addressed.
 *
 * An agent's role is free text (hive `role` == roster `description`), so the
 * category is DERIVED: exact match on the role title first (role templates all
 * start "Title — …"), then keyword scoring over description + name. The boss
 * (god) is always 'management' — its prompts delegate, and every category stays
 * one click away because it routes work to the whole floor. The UI lets the
 * user override the guess per agent.
 *
 * `{placeholders}` in a body are meant to be overwritten; the composer selects
 * the first one on insert.
 */

export type PromptCategory =
  | 'management' | 'engineering' | 'security' | 'marketing' | 'sales'
  | 'support' | 'research' | 'operations' | 'hr' | 'finance' | 'general';

export const PROMPT_CATEGORIES: { id: PromptCategory; label: string }[] = [
  { id: 'management', label: 'Management' },
  { id: 'engineering', label: 'Engineering' },
  { id: 'security', label: 'Security' },
  { id: 'marketing', label: 'Marketing' },
  { id: 'sales', label: 'Sales' },
  { id: 'support', label: 'Support' },
  { id: 'research', label: 'Research' },
  { id: 'operations', label: 'Operations' },
  { id: 'hr', label: 'HR' },
  { id: 'finance', label: 'Finance' },
  { id: 'general', label: 'General' }
];

export interface PromptItem {
  id: string;
  category: PromptCategory;
  title: string;
  body: string;
}

// ─── role → category ────────────────────────────────────────────────────────

/** Role-template titles (agentTemplates.ts) → category, matched exactly. */
const TITLE_MAP: Record<string, PromptCategory> = {
  'jr. programmer': 'engineering',
  'sr. programmer': 'engineering',
  'qa tester': 'engineering',
  'devops engineer': 'engineering',
  'technical writer': 'engineering',
  'security auditor': 'security',
  'scrum master': 'operations',
  'marketing executive': 'marketing',
  'marketing executive (feature launch)': 'marketing',
  'social media manager': 'marketing',
  'content writer': 'marketing',
  'customer support lead': 'support',
  'sales & lead researcher': 'sales',
  'market researcher': 'research',
  'operations / admin assistant': 'operations',
  'hr & recruitment': 'hr',
  'finance / bookkeeper': 'finance'
};

/** Keyword rules, in tie-break priority order. */
const KEYWORDS: [PromptCategory, RegExp][] = [
  ['security', /\b(secur\w*|audit\w*|pentest\w*|vulnerab\w*|appsec|infosec|compliance)\b/gi],
  ['sales', /\b(sales|sell\w*|lead\s?gen\w*|leads?|prospect\w*|closer|account exec\w*|bdr|sdr|outreach)\b/gi],
  ['support', /\b(support|customer service|helpdesk|help desk|csr|customer care|tickets?|faq)\b/gi],
  ['marketing', /\b(marketing|marketer|social media|content|copy\w*|brand\w*|seo|ads?|campaigns?|growth|launch|community|pr)\b/gi],
  ['research', /\b(research\w*|analyst|analysis|insights?|competitor\w*|survey\w*)\b/gi],
  ['hr', /\b(hr|human resources?|recruit\w*|talent|hiring|people ops|onboarding)\b/gi],
  ['finance', /\b(financ\w*|bookkeep\w*|accounting|accountant|budget\w*|invoic\w*|payroll|tax\w*|expenses?)\b/gi],
  ['operations', /\b(operations?|ops|admin\w*|assistant|scrum|project manag\w*|pm|coordinat\w*|planner|secretary|virtual assistant)\b/gi],
  ['engineering', /\b(programmer|developer|dev|engineer\w*|coder|code|software|frontend|backend|full[- ]?stack|qa|tester|testing|devops|bug\w*|refactor\w*|docs?|documentation|technical writer|architect)\b/gi]
];

export function roleCategoryFor(agent: { name?: string; description?: string; isGod?: boolean }): PromptCategory {
  if (agent.isGod) return 'management';
  const desc = (agent.description ?? '').trim();
  const title = desc.split(/\s+[—–-]\s+/)[0].trim().toLowerCase();
  if (TITLE_MAP[title]) return TITLE_MAP[title];
  // The role title outweighs the rest of the sentence (e.g. "…never moves money").
  const text = `${title} ${title} ${title} ${desc} ${agent.name ?? ''}`;
  let best: PromptCategory = 'general';
  let bestScore = 0;
  for (const [cat, re] of KEYWORDS) {
    const score = (text.match(re) ?? []).length;
    if (score > bestScore) { best = cat; bestScore = score; }
  }
  return best;
}

// ─── the library ────────────────────────────────────────────────────────────

const p = (category: PromptCategory, id: string, title: string, body: string): PromptItem =>
  ({ id: `${category}.${id}`, category, title, body });

export const PROMPTS: readonly PromptItem[] = [
  // Management — addressed to the boss; he plans and delegates.
  p('management', 'delegate', 'Delegate a goal to the team', 'Goal: {what you want done}. Deadline: {when}. Break this into tasks, assign each to the right agent, and report back with the plan before anyone starts.'),
  p('management', 'standup', 'Team standup', 'Give me a standup for the whole floor: what each agent finished, what they are doing now, and anything blocked or waiting on me. Keep it short.'),
  p('management', 'launch', 'Plan a feature launch', 'We are launching {feature/product} on {date}. Coordinate the team: dev finishes and tests it, docs are updated, and marketing prepares release notes, 3 social posts and a customer email. Show me drafts before anything goes out.'),
  p('management', 'review', 'Review the team\'s work', 'Review everything the team delivered today. Check it against the original request, list what is done, what needs fixing, and what needs my decision.'),
  p('management', 'prioritize', 'Prioritize the backlog', 'Look at all open tasks and rank them by impact vs effort. Propose the top 5 for this week and who should own each.'),
  p('management', 'hire', 'Suggest who to hire', 'Based on our current goals ({goal}), which roles are missing from the floor? Suggest up to 3 agents to add, with a one-line job description each.'),
  p('management', 'weekly', 'Weekly report', 'Write this week\'s report for {audience, e.g. the owner}: wins, progress on goals, problems, costs, and plan for next week. Plain language, under 300 words.'),

  // Engineering
  p('engineering', 'fix-bug', 'Fix a bug', 'Bug: {what happens}. Expected: {what should happen}. Steps to reproduce: {steps}. Find the root cause, fix it with the smallest change, add a test, and explain the fix.'),
  p('engineering', 'feature', 'Build a small feature', 'Build {feature}. Requirements: {requirements}. Follow the existing code style, add tests, and summarize what changed and how to try it.'),
  p('engineering', 'explain', 'Explain this code', 'Explain how {file / feature} works in plain language: what it does, the main steps, and anything risky or confusing.'),
  p('engineering', 'tests', 'Write missing tests', 'Add tests for {file / feature}. Cover the normal case, edge cases and error cases. Run the suite and report results.'),
  p('engineering', 'refactor', 'Refactor safely', 'Refactor {file / module} to be easier to read and maintain without changing behaviour. Keep changes small and run the tests before and after.'),
  p('engineering', 'review-pr', 'Review my changes', 'Review the current uncommitted changes (or branch {branch}). Look for bugs, missed edge cases and style issues. List findings by severity with file:line.'),
  p('engineering', 'docs', 'Update the docs', 'Update the README and CHANGELOG for {feature}. Explain what it does, how to use it, and any setup needed. Plain language.'),

  // Security
  p('security', 'audit', 'Security audit', 'Audit {folder / feature} for security issues: injection, auth and session flaws, secrets in code or logs, unsafe dependencies, missing input validation. Rank findings by severity with file:line and the fix. Do not change code.'),
  p('security', 'secrets', 'Scan for leaked secrets', 'Scan the project (including config files and git history if available) for API keys, passwords and tokens. List where each is and how to rotate and remove it.'),
  p('security', 'deps', 'Check dependencies', 'List outdated or vulnerable dependencies, what each risk means in plain words, and the safest upgrade path.'),
  p('security', 'privacy', 'Data Privacy Act check', 'Check how {feature} collects, stores and shares personal data. Flag anything that may conflict with the Philippine Data Privacy Act (RA 10173) and suggest fixes.'),
  p('security', 'threat', 'Threat model a feature', 'Threat-model {feature}: who could abuse it, how, what the impact would be, and the top 3 protections to add.'),

  // Marketing
  p('marketing', 'fb-captions', 'Facebook captions (Taglish)', 'Write 5 Facebook captions for {product}. Friendly Taglish, a strong hook in the first line, 1–2 emojis, a clear call to action, under 60 words each.'),
  p('marketing', 'calendar', 'Content calendar', 'Create a {2-week / monthly} content calendar for {brand} on Facebook, Instagram and TikTok: date, platform, post idea, caption draft and visual idea.'),
  p('marketing', 'launch-post', 'Launch announcement', 'Write a launch announcement for {feature/product}: 1 Facebook post, 1 LinkedIn post and 1 short customer email. Benefits first, no jargon.'),
  p('marketing', 'ad-copy', 'Ad copy variations', 'Write 6 ad copy variations for {product} targeting {audience}. Mix pain-point, benefit and social-proof angles. Headline + primary text for each.'),
  p('marketing', 'promo', 'Promo / sale campaign', 'Plan a {payday / 9.9 / holiday} promo for {product}: offer idea, 3 posts, 1 email and a short SMS/Viber blast. Include the urgency angle.'),
  p('marketing', 'product-desc', 'Product description', 'Write a product description for {product} for Shopee/Lazada: title (with keywords), 5 bullet benefits, and a short paragraph. Clear and honest.'),
  p('marketing', 'repurpose', 'Repurpose content', 'Turn this {blog / video / post} into 3 short social posts, 1 carousel outline and 1 email: {paste content}.'),

  // Sales
  p('sales', 'leads', 'Build a lead list', 'Find {number} potential clients in {industry} in {city/area}. For each: company, decision maker (if public), likely pain point, and a personalised opening line. Public info only.'),
  p('sales', 'followup', 'Follow-up message', 'Draft a polite follow-up to {client} who hasn\'t replied in {days} days about {offer}. Short, helpful, one clear next step. Taglish OK.'),
  p('sales', 'pitch', 'Sales pitch', 'Write a 1-minute pitch for {product/service} for {target customer}: problem, solution, proof, price anchor, call to action.'),
  p('sales', 'objections', 'Handle objections', 'List the top 5 objections customers raise about {product} (e.g. "mahal", "pag-iisipan ko pa") and a friendly, honest reply for each.'),
  p('sales', 'proposal', 'Proposal draft', 'Draft a short proposal for {client}: their goal, our solution, scope, timeline, price, and next steps. One page.'),

  // Support
  p('support', 'reply', 'Reply to a customer', 'Draft a reply to this customer message: "{paste message}". Warm, clear, solves the issue, Taglish if they wrote Taglish. Do not promise refunds unless {policy}.'),
  p('support', 'angry', 'Calm an upset customer', 'Draft a calm, empathetic reply to an upset customer about {issue}. Acknowledge, apologise once, give the fix and a timeline.'),
  p('support', 'faq', 'Build an FAQ', 'Create an FAQ for {product/service} from these common questions: {questions}. Short answers, friendly tone.'),
  p('support', 'macros', 'Reply templates', 'Write reply templates for our 10 most common requests: order status, refund, shipping delay, wrong item, payment issue, and others you see in {source}.'),
  p('support', 'complaints', 'Weekly complaints summary', 'Summarize this week\'s customer complaints from {source}: top issues, how often, examples, and suggested fixes.'),

  // Research
  p('research', 'competitors', 'Competitor analysis', 'Research our top competitors for {product} in the Philippines: what they offer, prices, strengths, weaknesses, and 3 gaps we can fill. Cite sources.'),
  p('research', 'pricing', 'Pricing research', 'Research how competitors price {product/service}. Suggest a price range and 3 package options for us, with reasons.'),
  p('research', 'reviews', 'Analyse customer reviews', 'Analyse reviews of {product / competitor}: what customers love, what they hate, and what that means for us.'),
  p('research', 'market', 'Market overview', 'Give me a short market overview of {industry} in the Philippines: size/trends, key players, customer behaviour, opportunities. Cite sources.'),
  p('research', 'summarize', 'Summarize a document', 'Summarize {document/link} in 5 bullet points, then list any action items and open questions.'),

  // Operations
  p('operations', 'meeting', 'Meeting notes → actions', 'Turn these meeting notes into a clear summary, decisions made, and action items with owner and due date: {paste notes}.'),
  p('operations', 'sop', 'Write an SOP', 'Write a step-by-step SOP for {process}. Numbered steps, who does what, and a checklist at the end.'),
  p('operations', 'tickets', 'Break down into tasks', 'Break {project/goal} into small tasks with acceptance criteria and a suggested order. Add them to the task board.'),
  p('operations', 'status', 'Status report', 'Write a status report on {project}: done, in progress, blocked, risks, next steps. Under 200 words.'),
  p('operations', 'checklist', 'Checklist', 'Create a checklist for {task, e.g. store opening / event / launch day}.'),

  // HR
  p('hr', 'job-post', 'Job post', 'Write a job post for {role} in {location / remote}: responsibilities, requirements, benefits, and how to apply. Friendly and clear.'),
  p('hr', 'interview', 'Interview questions', 'Create 10 interview questions for {role}, with what a good answer looks like for each.'),
  p('hr', 'onboarding', 'Onboarding checklist', 'Create a first-week onboarding checklist for a new {role}: accounts, introductions, training and first tasks.'),
  p('hr', 'policy', 'Simple HR policy', 'Draft a simple {leave / WFH / attendance} policy for a small Philippine business, aligned with common local labor practice. Flag anything to confirm with a lawyer.'),
  p('hr', 'screen', 'Screen applicants', 'Screen these applicants against the {role} requirements: {paste}. Rank the top 5 with reasons. Do not make the final decision.'),

  // Finance
  p('finance', 'monthly', 'Monthly summary', 'Prepare a monthly summary from {file}: total sales, expenses by category, net, and cash on hand. Flag anything unusual.'),
  p('finance', 'reconcile', 'Reconcile records', 'Reconcile {sales records} against {bank/GCash statement}. List mismatches with dates and amounts.'),
  p('finance', 'expenses', 'Categorize expenses', 'Categorize these expenses into clear categories and total each: {paste or file}.'),
  p('finance', 'budget', 'Budget plan', 'Draft a {monthly/quarterly} budget for {team/business} based on {last period data}, with a short explanation of each line.'),
  p('finance', 'invoice', 'Invoice / quote draft', 'Draft an invoice/quotation for {client} for {items/services}, with VAT {inclusive/exclusive} and payment terms.'),

  // General — any agent
  p('general', 'status', 'What are you working on?', 'What are you working on right now, how far along are you, and is anything blocking you?'),
  p('general', 'summary', 'Summarize your work', 'Summarize what you did today in plain language, with links/paths to anything you created.'),
  p('general', 'improve', 'Improve this', 'Improve this {text/plan/code}: {paste}. Explain the main changes.'),
  p('general', 'explain', 'Explain simply', 'Explain {topic} to me like I\'m not technical, with an example.')
];

/** Prompts for a category; 'general' prompts are always appended. */
export function promptsFor(category: PromptCategory): PromptItem[] {
  const own = PROMPTS.filter((x) => x.category === category);
  return category === 'general' ? own : [...own, ...PROMPTS.filter((x) => x.category === 'general')];
}

/** Character range of the first `{placeholder}` in a body, or null. */
export function firstPlaceholder(body: string): { start: number; end: number } | null {
  const m = /\{[^}]+\}/.exec(body);
  return m ? { start: m.index, end: m.index + m[0].length } : null;
}
