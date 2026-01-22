import { inject, Injectable } from '@angular/core';
import { GeminiService } from '#services/ai/gemini.service';
import { ArenaConfig, ArenaJudgeConfig } from '../arena-models';
import { ArenaMemory } from './arena-service';
import {
  clampScore,
  compact,
  joinLines,
  normalizeCoverage,
  normalizeVerdictHint,
  oneSentence,
  parseJson,
  str,
} from './utilities';

export type CriteriaId = string;

export type CriteriaSignal =
  | 'named_entity'
  | 'example'
  | 'numbers'
  | 'channel'
  | 'mechanism'
  | 'tradeoff'
  | 'risk'
  | 'timeline'
  | 'constraint';

export type JudgeCriteria = {
  id: CriteriaId;
  description: string;
  signals?: CriteriaSignal[];
};

export type CriteriaCoverage = {
  id: CriteriaId;
  status: 'missing' | 'partial' | 'clear';
  note?: string;
};

export type JudgeMemoryLite = {
  askedCriteriaIds?: CriteriaId[];
  covered?: CriteriaCoverage[];
  lastQuestion?: string;
  lastScore?: number;
};

export type JudgeIntent = {
  phase?: 'clarify_core' | 'stress_weakest' | 'decision_ready';
  goal?: string;
  primaryCriteria?: CriteriaId[];
  aggressiveness?: 'light' | 'medium' | 'hard';
};

export type JudgeTurnArgs = {
  profile: Record<string, any>;
  lastDelta?: string;
  memory?: ArenaMemory;
  mode?: 'discovery' | 'interrogation';// | 'impact';
  round?: number;
  maxRounds?: number;

  // optional “round intent” injection (keeps rounds less gamey; feels like a chair guiding focus)
  intent?: JudgeIntent;
};

export type JudgeTurnResult = {
  judge: string;
  score: number;
  comment: string;
  question: string;
  coverage: CriteriaCoverage[];
  askedCriteriaId?: CriteriaId;
  verdictHint?: 'pass' | 'maybe' | 'fail';
};

@Injectable({ providedIn: 'root' })
export class NewJudgeService {
  private gemini = inject(GeminiService);

  antiTemplate = [
  'ANTI-TEMPLATE RULES:',
  '- Do NOT over use the words "specific, exact, concrete" etc.',
  '- Do NOT start questions with: "What specific", "Outline your", "To deliver", "What steps".',
  '- Vary phrasing; prefer one of: "Walk me through…", "What would I see…", "In the demo…", "If I’m a judge watching…".',
  '- Avoid repeating the same structure used in the previous 2 questions.',
].join('\n');

  async runTurn(
    cfg: ArenaConfig,
    judge: ArenaJudgeConfig,
    args: JudgeTurnArgs
  ): Promise<JudgeTurnResult> {
    //I have the impression that I do it all twice 
    //const prompt = promptOverride ?? this.buildPrompt(cfg, judge, args);

    const startedAt = performance.now();
    const system = this.buildSystemPrompt(cfg, judge, args);
    const user = this.buildUserText(args);

    // ✅ user goes first, system goes second
    const raw = await this.gemini.textPrompt(user, system);
    //const raw = await this.gemini.textPrompt(prompt, ''); // single call

    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log("host time taken", elapsedMs)

    const obj = parseJson(raw);

    const criteria = this.getCriteria(judge);

    const fallback: JudgeTurnResult = {
      judge: judge.id,
      score: 6.0,
      comment: 'Quick fallback: need one sharper detail.',
      question: 'What’s one concrete end-to-end example (who, when, outcome)?',
      coverage: criteria.map((c) => ({ id: c.id, status: 'missing' })),
      askedCriteriaId: criteria[0]?.id,
      verdictHint: 'maybe',
    };

    if (!obj) return fallback;

    const score = clampScore(Number(obj.score ?? fallback.score));
    const comment = str(obj.comment) || fallback.comment;
    const question = oneSentence(str(obj.question) || fallback.question);

    const askedCriteriaId =
      str(obj.askedCriteriaId) || fallback.askedCriteriaId;

    const coverage = normalizeCoverage(obj.coverage, criteria);
    const verdictHint = normalizeVerdictHint(obj.verdictHint);

    return {
      judge: judge.id,
      score,
      comment,
      question,
      coverage,
      askedCriteriaId,
      verdictHint,
    };
  }

  nextMemory(prev: JudgeMemoryLite | undefined, res: JudgeTurnResult): JudgeMemoryLite {
    const asked = (prev?.askedCriteriaIds ?? []).slice();
    if (res.askedCriteriaId) asked.push(res.askedCriteriaId);

    const MAX = 6;
    while (asked.length > MAX) asked.shift();

    return {
      askedCriteriaIds: asked,
      covered: res.coverage,
      lastQuestion: res.question,
      lastScore: res.score,
    };
  }

  // ---------------- prompt ----------------

  /**
   * 
   * @param cfg 
   * @param judge 
   * @param args 
   * @returns 
   * @deprecated
   */
  getPrompt(cfg: ArenaConfig, judge: ArenaJudgeConfig, args: JudgeTurnArgs): string {
    return this.buildPrompt(cfg, judge, args);
  }

private buildSystemPrompt(cfg: ArenaConfig, judge: ArenaJudgeConfig, args: JudgeTurnArgs): string {
  const criteria = this.getCriteria(judge);

  const banned = compact([
    ...(cfg.globalStyle?.bannedPhrases ?? []),
    ...(cfg.globalStyle?.bannedCliches ?? []),
  ]);

  const rules = cfg.globalStyle?.conversationRules;
  const maxWords = rules?.maxCommentWords ?? 80;
  const qMaxSentences = rules?.questionMaxSentences ?? 1;

  const askedRecent = (args.memory?.askedCriteriaIds ?? []);
  const intent = args.intent ?? {};
  const intentLine = compact([
    intent.goal ? `Goal: ${intent.goal}` : '',
    intent.phase ? `Phase: ${intent.phase}` : '',
    intent.aggressiveness ? `Pressure: ${intent.aggressiveness}` : '',
    intent.primaryCriteria?.length ? `Focus: ${intent.primaryCriteria.join(', ')}` : '',
  ]).join(' | ');

  const objectiveLine = cfg.objective?.thesis ? `Objective: ${cfg.objective.thesis}` : '';

  const safetyLines = Array.isArray((cfg as any).safety) ? (cfg as any).safety : [];
  const safetyBlock = safetyLines?.length ? `Safety constraints: ${safetyLines.join(' | ')}` : '';

  const criteriaBlock = criteria
    .map((c) => {
      const sig = c.signals?.length ? ` (${c.signals.join(', ')})` : '';
      return `- ${c.id}: ${c.description}${sig}`;
    })
    .join('\n');

  const outputContract = [
    'Return ONLY JSON with keys:',
    'judge, score, comment, question, coverage, askedCriteriaId, verdictHint',
    'coverage = [{id,status,note?}] where status is missing|partial|clear',
    'No markdown. No extra text.',
  ].join('\n');

  const mode = args.mode ?? 'discovery';
  const roundInfo =
    args.round && args.maxRounds
      ? `Round ${args.round}/${args.maxRounds}`
      : args.round
        ? `Round ${args.round}`
        : '';

  return joinLines(
    `You are ${judge.label}. Tone: ${judge.tone ?? 'direct'}.`,
    roundInfo ? `Context: ${roundInfo}. Mode: ${mode}.` : `Mode: ${mode}.`,
    objectiveLine,
    intentLine ? `Chair guidance: ${intentLine}` : '',
    safetyBlock,
    '',
    'Rules:',
    `- Comment <= ${maxWords} words.`,
    `- Ask EXACTLY ONE question (<= ${qMaxSentences} sentence).`,
    banned.length ? `- Avoid: ${banned.join(' | ')}` : '',
    this.antiTemplate,
    '',
    'Your job:',
    '- Update coverage across ALL criteria.',
    '- Ask ONE question that improves the weakest criterion (prefer not recently asked).',
    '- Score 0–10 based on clarity + credibility (not vibes).',
    '',
    'Criteria:',
    criteriaBlock,
    '',
    `Recently asked: ${askedRecent.length ? askedRecent.join(', ') : '(none)'}`,
    '',
    outputContract
  );
}

private buildUserText(args: JudgeTurnArgs): string {
  return joinLines(
    'Founder profile:',
    JSON.stringify(args.profile ?? {}),
    args.lastDelta ? '' : '',
    args.lastDelta ? 'Latest Q/A:' : '',
    args.lastDelta ? String(args.lastDelta).slice(0, 900) : ''
  );
}

  /**
   * 
   * @param cfg 
   * @param judge 
   * @param args 
   * @returns 
   * @deprecated
   */
  private buildPrompt(cfg: ArenaConfig, judge: ArenaJudgeConfig, args: JudgeTurnArgs): string {
    const criteria = this.getCriteria(judge);

    // keep prompt short and stable
    const banned = compact([
      ...(cfg.globalStyle?.bannedPhrases ?? []),
      ...(cfg.globalStyle?.bannedCliches ?? []),
    ]);

    const rules = cfg.globalStyle?.conversationRules;
    const maxWords = rules?.maxCommentWords ?? 80;
    const qMaxSentences = rules?.questionMaxSentences ?? 1;

    console.log(args.memory)

    const askedRecent = (args.memory?.askedCriteriaIds ?? []);//.slice(-4);
    //const lastCoverage = args.memory?.covered ?? [];

    const intent = args.intent ?? {};
    const intentLine = compact([
      intent.goal ? `Goal: ${intent.goal}` : '',
      intent.phase ? `Phase: ${intent.phase}` : '',
      intent.aggressiveness ? `Pressure: ${intent.aggressiveness}` : '',
      intent.primaryCriteria?.length ? `Focus: ${intent.primaryCriteria.join(', ')}` : '',
    ]).join(' | ');

    // IMPORTANT: don’t dump huge “objective + successDefinition” every time.
    // Keep it to one line + optional deliverables if you need it.
    const objectiveLine = cfg.objective?.thesis ? `Objective: ${cfg.objective.thesis}` : '';

    // SAFETY: your cfg.safety is already array; stringify nicely
    const safetyLines = Array.isArray((cfg as any).safety) ? (cfg as any).safety : [];
    const safetyBlock = safetyLines?.length
      ? `Safety constraints: ${safetyLines.join(' | ')}`
      : '';

    // criteria as compact list
    const criteriaBlock = criteria
      .map((c) => {
        const sig = c.signals?.length ? ` (${c.signals.join(', ')})` : '';
        return `- ${c.id}: ${c.description}${sig}`;
      })
      .join('\n');

    // output contract: short, no schema example blob
    const outputContract = [
      'Return ONLY JSON with keys:',
      'judge, score, comment, question, coverage, askedCriteriaId, verdictHint',
      'coverage = [{id,status,note?}] where status is missing|partial|clear',
    ].join('\n');

    const mode = args.mode ?? 'discovery';
    const roundInfo =
      args.round && args.maxRounds
        ? `Round ${args.round}/${args.maxRounds}`
        : args.round
          ? `Round ${args.round}`
          : '';

    return joinLines(
      `You are ${judge.label}. Tone: ${judge.tone ?? 'direct'}.`,
      roundInfo ? `Context: ${roundInfo}. Mode: ${mode}.` : `Mode: ${mode}.`,
      objectiveLine,
      intentLine ? `Chair guidance: ${intentLine}` : '',
      safetyBlock,
      '',
      'Rules:',
      `- Comment <= ${maxWords} words.`,
      `- Ask EXACTLY ONE question (<= ${qMaxSentences} sentence).`,
      banned.length ? `- Avoid: ${banned.join(' | ')}` : '',
      this.antiTemplate,
      '',
      'Your job:',
      '- Update coverage across ALL criteria.',
      '- Ask ONE question that improves the weakest criterion (prefer not recently asked).',
      '- Score 0–10 based on clarity + credibility (not vibes).',
      '',
      'Criteria:',
      criteriaBlock,
      '',
      `Recently asked: ${askedRecent.length ? askedRecent.join(', ') : '(none)'}`,
      //`Last coverage: ${lastCoverage.length ? JSON.stringify(lastCoverage) : '(none)'}`,
      '',
      outputContract,
      '',
      'Founder profile:',
      JSON.stringify(args.profile ?? {}),
      args.lastDelta ? '' : '',
      args.lastDelta ? 'Latest Q/A:' : '',
      args.lastDelta ? String(args.lastDelta).slice(0, 900) : '' // keep short for speed
    );
  }

  // ---------------- criteria ----------------

  private getCriteria(judge: ArenaJudgeConfig): JudgeCriteria[] {
    return (judge as any).criteriaConfig; // ?? this.defaultCriteriaForJudge(judge.id);
  }

  private defaultCriteriaForJudge(judgeId: string): JudgeCriteria[] {
    if (judgeId === 'vc') {
      return [
        { id: 'buyer_value', description: 'Who cares, who pays, and what they get', signals: ['named_entity', 'example'] },
        { id: 'moment_trigger', description: 'Trigger + moment of use', signals: ['example'] },
        { id: 'substitute_break', description: 'What they do today and where it fails', signals: ['example'] },
        { id: 'pricing_anchor', description: 'Rough price anchor tied to value', signals: ['numbers', 'example'] },
      ];
    }
    if (judgeId === 'product') {
      return [
        { id: 'user_moment', description: 'User situation and trigger', signals: ['example'] },
        { id: 'value_moment', description: 'What “good” looks like', signals: ['example'] },
        { id: 'repeat_loop', description: 'Why they return', signals: ['example'] },
        { id: 'trust', description: 'Why they trust it', signals: ['example'] },
      ];
    }
    if (judgeId === 'cto') {
      return [
        { id: 'mechanism', description: 'End-to-end flow and boundaries', signals: ['mechanism'] },
        { id: 'risk', description: 'Key technical risk + mitigation', signals: ['risk'] },
        { id: 'sequencing', description: 'First slice / sequencing', signals: ['timeline', 'constraint'] },
      ];
    }
    return [
      { id: 'clarity', description: 'Is the idea understandable', signals: ['example'] },
      { id: 'value', description: 'Is value concrete', signals: ['example'] },
      { id: 'next_step', description: 'Is next step clear', signals: ['timeline'] },
    ];
  }


}
