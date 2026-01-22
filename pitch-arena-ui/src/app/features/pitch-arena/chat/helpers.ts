import { ArenaConfig } from "../arena-models";
import { JudgeRun } from "./arena-page";
import { ChatUIMessage } from "./ui/chat-ui";

/**
 * 
 * @returns a hard coded pitch that can be used to accelerate the demo
 */
export function getPitchArenaPitch() {
  //temporary
  var pitch = `
      pitch arena is an ai run space where founders and creators can test their 
      ideas in a hackathon/shark tank style space. The arena has an overall objective 
      and the judges are aligned with that ojective but also they have their own 
      characters and goals. This allow people to test out their ideas in a real q&a 
      space rather than just testing in front or friends and family or a mirror.
      `;

  // profile init:
  // If you already have a HostPage producing a profile, you can pass it in query params or local storage.
  // Here we default to a minimal profile that still makes judge prompts work.
  var profile = {
    founderName: 'peter',
    ideaName: 'pitch arena',
    pitch: pitch,
    targetUser: 'Early Founders, creators, hackers etc ',
    targetContext: 'preparing and perfecting a pitch',
    firstValue: 'realistic practise',
    acquisitionPath: 'via incubators',
    inputSource: 'Personal pain',
  };
  return profile;
}

//--------------- new intentional mode -------------------//

// plan-next-intent.ts
// Minimal, deterministic “round intent” planner.
// Works with your current JudgeService output shape (coverage + askedCriteriaId + score).
// No LLM calls. Fast. Predictable.

export type IntentPhase = 'clarify_core' | 'stress_weakest' | 'decision_ready';

export type RoundIntent = {
  phase: IntentPhase;
  goal: string;
  primaryCriteria: string[];
  secondaryCriteria?: string[];
  aggressiveness: 'light' | 'medium' | 'hard';
  // optional: UI/debug
  reason?: string;
};

export type CriteriaCoverageStatus = 'missing' | 'partial' | 'clear';

export type CriteriaCoverage = {
  id: string;
  status: CriteriaCoverageStatus;
  note?: string;
};

export type JudgeRunLite = {
  round: number;
  judge?: string;
  score: number;
  askedCriteriaId?: string;
  coverage?: CriteriaCoverage[];
};

export type IntentPlannerState = {
  round: number;
  maxRounds: number;

  // Your arena config’s VC criteriaConfig ids (or any judge criteria list)
  criteriaIds: string[];

  // Flattened “best known” coverage across judges so far
  // (you can compute this from your last JudgeTurnResult coverage)
  coverage: CriteriaCoverage[];

  // history
  runs: JudgeRunLite[];

  // Optional knobs
  objectiveGoal?: string; // e.g. "Gemini hackathon readiness"
  fastMode?: boolean;     // if true, bias to 1–2 intents
};

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

function statusScore(s: CriteriaCoverageStatus): number {
  // higher is better
  if (s === 'clear') return 1;
  if (s === 'partial') return 0.5;
  return 0;
}

function normalizeCoverage(criteriaIds: string[], cov: CriteriaCoverage[] | undefined | null): CriteriaCoverage[] {
  const map = new Map<string, CriteriaCoverage>();
  for (const c of cov ?? []) {
    const id = String(c?.id ?? '').trim();
    if (!id) continue;
    const st = String(c?.status ?? '').toLowerCase();
    const status: CriteriaCoverageStatus =
      st.includes('clear') ? 'clear' : st.includes('partial') ? 'partial' : 'missing';
    map.set(id, { id, status, note: c?.note ? String(c.note).slice(0, 140) : undefined });
  }
  return criteriaIds.map((id) => map.get(id) ?? ({ id, status: 'missing' }));
}



function lastAskedSet(runs: JudgeRunLite[], n = 3): Set<string> {
  const out = new Set<string>();
  const recent = runs.slice(-n);
  for (const r of recent) {
    if (r.askedCriteriaId) out.add(r.askedCriteriaId);
  }
  return out;
}

function pickByNeed(
  cov: CriteriaCoverage[],
  wanted: string[],
  recentlyAsked: Set<string>,
  count: number
): string[] {
  const wantedSet = new Set(wanted);
  const candidates = cov
    .filter((c) => wantedSet.has(c.id))
    .slice()
    .sort((a, b) => statusScore(a.status) - statusScore(b.status)); // missing first

  const picked: string[] = [];
  for (const c of candidates) {
    if (picked.length >= count) break;
    if (recentlyAsked.has(c.id)) continue;
    picked.push(c.id);
  }

  // if everything is “recently asked”, allow repeats but still pick the weakest
  if (picked.length < count) {
    for (const c of candidates) {
      if (picked.length >= count) break;
      if (!picked.includes(c.id)) picked.push(c.id);
    }
  }

  return picked;
}

/**
 * Default “core” and “deep” groups.
 * Tweak these ids to match your criteriaConfig ids.
 */
function defaultGroups(criteriaIds: string[]) {
  // common ids you’ve used
  const CORE = ['buyer_value', 'moment_trigger', 'substitute_break', 'wedge_entry'];
  const VIABILITY = ['channel_realism', 'pricing_anchor', 'retention_loop'];
  const RISK = ['scope_slice', 'trust_boundary'];

  const core = CORE.filter((id) => criteriaIds.includes(id));
  const viability = VIABILITY.filter((id) => criteriaIds.includes(id));
  const risk = RISK.filter((id) => criteriaIds.includes(id));

  // Fallback: if ids differ, just treat first half as “core” and rest as “risk”
  if (!core.length) {
    const half = Math.max(1, Math.floor(criteriaIds.length / 2));
    return {
      core: criteriaIds.slice(0, half),
      viability: [],
      risk: criteriaIds.slice(half),
    };
  }

  return { core, viability, risk };
}

/**
 * Decide what the *next* intent should be, based on coverage + simple progression.
 * - clarify_core until core is mostly clear
 * - stress_weakest once core is clear but gaps remain
 * - decision_ready once most criteria are clear OR you’re at maxRounds
 */
export function planNextIntent(state: IntentPlannerState): RoundIntent {
  const criteriaIds = state.criteriaIds ?? [];
  const cov = normalizeCoverage(criteriaIds, state.coverage);
  const groups = defaultGroups(criteriaIds);

  const recentAsked = lastAskedSet(state.runs ?? [], 4);

  const coreAvg = avg(cov.filter((c) => groups.core.includes(c.id)).map((c) => statusScore(c.status)));
  const allAvg = avg(cov.map((c) => statusScore(c.status)));

  const roundsLeft = Math.max(0, state.maxRounds - state.round + 1);
  const fast = !!state.fastMode;

  // thresholds: tune these (they matter a lot)
  const CORE_OK = 0.75;   // mostly clear
  const READY_OK = 0.80;  // basically ready
  const MIN_READY = 0.65; // if time is up, accept “good enough”

  // If we're out of rounds, force decision_ready
  if (roundsLeft <= 1) {
    const primary = pickByNeed(cov, criteriaIds, recentAsked, 2);
    return {
      phase: 'decision_ready',
      goal: state.objectiveGoal
        ? `Make a decision against: ${state.objectiveGoal}`
        : 'Make a decision: is this ready given what we know?',
      primaryCriteria: primary.length ? primary : criteriaIds.slice(0, 2),
      aggressiveness: allAvg >= READY_OK ? 'light' : allAvg >= MIN_READY ? 'medium' : 'hard',
      reason: `Rounds left=${roundsLeft}, forcing decision. coreAvg=${coreAvg.toFixed(2)} allAvg=${allAvg.toFixed(2)}`
    };
  }

  // 1) clarify_core until you can “say what it is” clearly
  if (coreAvg < CORE_OK) {
    const primary = pickByNeed(cov, groups.core.length ? groups.core : criteriaIds, recentAsked, 2);
    const secondary = groups.viability.length
      ? pickByNeed(cov, groups.viability, recentAsked, 1)
      : [];

    return {
      phase: 'clarify_core',
      goal: state.objectiveGoal
        ? `Clarify the core so it matches: ${state.objectiveGoal}`
        : 'Clarify the core: who it’s for, when used, and why it matters.',
      primaryCriteria: primary.length ? primary : groups.core,
      secondaryCriteria: secondary.length ? secondary : undefined,
      aggressiveness: 'light',
      reason: `coreAvg=${coreAvg.toFixed(2)} below CORE_OK=${CORE_OK}`
    };
  }

  // 2) If we're in fastMode, go straight to decision once core is OK
  if (fast) {
    const primary = pickByNeed(cov, criteriaIds, recentAsked, 2);
    return {
      phase: 'decision_ready',
      goal: state.objectiveGoal
        ? `Decide readiness for: ${state.objectiveGoal}`
        : 'Decide: is it compelling + plausible enough to proceed?',
      primaryCriteria: primary.length ? primary : criteriaIds.slice(0, 2),
      aggressiveness: allAvg >= READY_OK ? 'light' : 'medium',
      reason: `fastMode=true and coreAvg=${coreAvg.toFixed(2)} >= CORE_OK`
    };
  }

  // 3) stress_weakest: pick the weakest remaining criteria (prefer risk group)
  const riskFirst = groups.risk.length ? groups.risk : criteriaIds;
  const primary = pickByNeed(cov, riskFirst, recentAsked, 2);
  const secondary = groups.viability.length
    ? pickByNeed(cov, groups.viability, recentAsked, 1)
    : [];

  // If almost everything is clear, go to decision
  if (allAvg >= READY_OK) {
    const p = pickByNeed(cov, criteriaIds, recentAsked, 2);
    return {
      phase: 'decision_ready',
      goal: state.objectiveGoal
        ? `Finalize against: ${state.objectiveGoal}`
        : 'Finalize decision and next steps.',
      primaryCriteria: p.length ? p : criteriaIds.slice(0, 2),
      aggressiveness: 'light',
      reason: `allAvg=${allAvg.toFixed(2)} >= READY_OK=${READY_OK}`
    };
  }

  // Otherwise, keep pressing where it breaks
  const aggressiveness: RoundIntent['aggressiveness'] =
    allAvg < 0.55 ? 'hard' : allAvg < 0.7 ? 'medium' : 'medium';

  return {
    phase: 'stress_weakest',
    goal: state.objectiveGoal
      ? `Stress the weakest points relative to: ${state.objectiveGoal}`
      : 'Stress the weakest points: feasibility, trust, scope, or real-world constraints.',
    primaryCriteria: primary.length ? primary : criteriaIds.slice(0, 2),
    secondaryCriteria: secondary.length ? secondary : undefined,
    aggressiveness,
    reason: `coreAvg ok (${coreAvg.toFixed(2)}), allAvg=${allAvg.toFixed(2)}`
  };
}



//------------------- EXPORT END SUMMARY ------------------//

export type EndSummary = {
  finalScore: number;
  verdict: 'pass' | 'maybe' | 'fail';
  oneLiner: string;
  topStrength: string;
  topRisk: string;
  nextStep24h: string;
};

export type GenerateSummaryParams = {
  finalScore: number;
  cfg: ArenaConfig | null;
  profile: any;
  judgeRuns: JudgeRun[];
  textPrompt: (user: string, system: string) => Promise<any>;
  coerceJson: (raw: any, fallback: any) => any;
  normalizeVerdict: (v: any) => 'pass' | 'maybe' | 'fail';
};

export type GenerateSummaryResult = {
  summary: EndSummary;
  messageText?: string;
};

export async function buildEndSummary({
  finalScore,
  cfg,
  profile,
  judgeRuns,
  textPrompt,
  coerceJson,
  normalizeVerdict,
}: GenerateSummaryParams): Promise<GenerateSummaryResult> {
  const roundedFinalScore = Number(finalScore.toFixed(1));

  const system = [
    'You are the Pitch Arena panel chair.',
    'Return ONLY valid JSON. No markdown. No code fences.',
    'Use short practical language.',
    '',
    'JSON schema:',
    JSON.stringify({
      finalScore: 0,
      verdict: 'maybe',
      oneLiner: '...',
      topStrength: '...',
      topRisk: '...',
      nextStep24h: '...',
    }),
    '',
    'Verdict must be one of: pass, maybe, fail.',
  ].join('\n');

  const user = [
    `ARENA: ${cfg?.name ?? ''}`,
    `OBJECTIVE: ${cfg?.objective?.thesis ?? ''}`,
    '',
    'FOUNDER PROFILE:',
    JSON.stringify(profile ?? {}),
    '',
    `FINAL SCORE: ${roundedFinalScore}`,
    '',
    'ROUNDS:',
    JSON.stringify(judgeRuns.slice(-6)), // keep short
  ].join('\n');

  const raw = await textPrompt(user, system);
  const json = coerceJson(raw, null);

  const fallback: EndSummary = {
    finalScore: roundedFinalScore,
    verdict: 'maybe',
    oneLiner: 'Summary unavailable.',
    topStrength: '',
    topRisk: '',
    nextStep24h: 'Run 5 quick founder interviews on the core pain point.',
  };

  if (!json || typeof json !== 'object') {
    return { summary: fallback };
  }

  const verdict = normalizeVerdict((json as any).verdict);
  const summary: EndSummary = {
    finalScore: roundedFinalScore,
    verdict,
    oneLiner: String((json as any).oneLiner ?? fallback.oneLiner).trim(),
    topStrength: String((json as any).topStrength ?? '').trim(),
    topRisk: String((json as any).topRisk ?? '').trim(),
    nextStep24h: String(
      (json as any).nextStep24h ?? fallback.nextStep24h
    ).trim(),
  };

  const messageText = `${summary.verdict.toUpperCase()} • ${summary.oneLiner}

Strength: ${summary.topStrength}
Risk: ${summary.topRisk}
Next 24h: ${summary.nextStep24h}`;

  return { summary, messageText };
}

  

  export function normalizeVerdict(v: any): 'pass' | 'maybe' | 'fail' {
    const s = String(v ?? '').toLowerCase();
    if (s.includes('pass') || s.includes('go') || s.includes('strong'))
      return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject'))
      return 'fail';
    return 'maybe';
  }

  export function coerceJson(raw: any, fallback: any) {
    if (raw && typeof raw === 'object') return raw;
    const s = String(raw ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```[\s\r\n]*$/i, '')
      .trim();
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  export function createMessage(role: 'system' | 'user' | 'ai', text: string): ChatUIMessage {
    return {
      id: generateID(),
      text,
      role,
    };
  }

  export function generateID() {
    return crypto.randomUUID();
  }

  export function avg(nums: number[]) {
    return nums.reduce((a, n) => a + n, 0) / Math.max(1, nums.length);
  }
