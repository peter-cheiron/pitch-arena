import { inject, Injectable } from '@angular/core';
import { ArenaConfig, ArenaJudgeConfig } from '../arena-models';
import { GeminiService } from '#services/ai/gemini.service';
import {
  JudgeCriteria,
  JudgeTurnArgs,
  JudgeTurnResult,
} from './new-judge.service';
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

export type PanelTurnResult = {
  panel: JudgeTurnResult[];
};

@Injectable({ providedIn: 'root' })
export class PanelJudgeService {
  gemini = inject(GeminiService);

  private clampScore = clampScore;
  private compact = compact;
  private joinLines = joinLines;
  private normalizeCoverage = normalizeCoverage;
  private normalizeVerdictHint = normalizeVerdictHint;
  private oneSentence = oneSentence;
  private parseJson = parseJson;
  private str = str;

  antiTemplate = [
    'ANTI-TEMPLATE RULES:',
    '- Do NOT over use the words "specific, exact, concrete" etc.',
    '- Do NOT start questions with: "What specific", "Outline your", "To deliver", "What steps".',
    '- Vary phrasing; prefer one of: "Walk me through…", "What would I see…", "In the demo…", "If I’m a judge watching…".',
    '- Avoid repeating the same structure used in the previous 2 questions.',
  ].join('\n');

  private buildPanelUser(args: JudgeTurnArgs): string {
  const delta = args.lastDelta ? String(args.lastDelta) : '';
  const safeDelta = delta.length > 2500 ? delta.slice(0, 2500) : delta; // 900 is too low for maps

  return this.joinLines(
    'Founder profile:',
    JSON.stringify(args.profile ?? {}),
    safeDelta ? '' : '',
    safeDelta ? 'Context:' : '',
    safeDelta ? safeDelta : ''
  );
}

  async runPanelTurn(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
  ): Promise<PanelTurnResult> {
    const system = this.buildPanelSystem(cfg, judges, args);
    const user = this.buildPanelUser(args);

    // ✅ IMPORTANT: use system for the big instruction, user for the content
    const raw = await this.gemini.textPrompt(user, system);
    const obj = this.parseJson(raw);

    //console.log(obj)

    // Fallback: if parsing fails, degrade gracefully by calling your per-judge fallback builder
    if (!obj?.panel || !Array.isArray(obj.panel)) {
      return { panel: judges.map((j) => this.fallbackFor(j)) };
    }

    // Normalize each judge result exactly like your runTurn does
    const normalized = judges.map((j) => this.normalizeOne(obj.panel, j));
    console.log(normalized)
    return { panel: normalized };
  }

  private buildPanelSystem(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
  ): string {
    const banned = this.compact([
      ...(cfg.globalStyle?.bannedPhrases ?? []),
      ...(cfg.globalStyle?.bannedCliches ?? []),
    ]);

    const rules = cfg.globalStyle?.conversationRules;
    const maxWords = rules?.maxCommentWords ?? 80;
    const qMaxSentences = rules?.questionMaxSentences ?? 1;

    const intent = args.intent ?? {};
    const intentLine = this.compact([
      intent.goal ? `Goal: ${intent.goal}` : '',
      intent.phase ? `Phase: ${intent.phase}` : '',
      intent.aggressiveness ? `Pressure: ${intent.aggressiveness}` : '',
      intent.primaryCriteria?.length
        ? `Focus: ${intent.primaryCriteria.join(', ')}`
        : '',
    ]).join(' | ');

    const objectiveLine = cfg.objective?.thesis
      ? `Objective: ${cfg.objective.thesis}`
      : '';

    const safetyLines = Array.isArray((cfg as any).safety)
      ? (cfg as any).safety
      : [];
    const safetyBlock = safetyLines?.length
      ? `Safety constraints: ${safetyLines.join(' | ')}`
      : '';

    const judgeBlocks = judges
      .map((j) => {
        const criteria = this.getCriteria(j);
        const criteriaBlock = criteria
          .map((c) => {
            const sig = c.signals?.length ? ` (${c.signals.join(', ')})` : '';
            return `- ${c.id}: ${c.description}${sig}`;
          })
          .join('\n');

        return this.joinLines(
          `JUDGE ${j.id}: ${j.label}`,
          `Tone: ${j.tone ?? 'direct'}`,
          `Criteria:\n${criteriaBlock}`,
        );
      })
      .join('\n\n');

    return this.joinLines(
      `You are a panel of ${judges.length} judges. Produce ONE result per judge.`,
      objectiveLine,
      intentLine ? `Chair guidance: ${intentLine}` : '',
      safetyBlock,
      '',
      'Rules (apply to EACH judge):',
      `- Comment <= ${maxWords} words.`,
      `- Ask EXACTLY ONE question (<= ${qMaxSentences} sentence).`,
      banned.length ? `- Avoid: ${banned.join(' | ')}` : '',
      'Conversation context:',
      '- The user message may contain either:',
      '  (a) a single previous panel Q/A, OR',
      '  (b) `LastDeltaByJudge:` followed by a JSON object keyed by judgeId.',
      '- If `LastDeltaByJudge` is present, each judge MUST use ONLY their own entry (by judgeId).',
      this.antiTemplate,
      '',
      'Output ONLY valid JSON in this exact shape:',
      '{ "panel": [',
      '  { "judge": "<judgeId>", "score": 0, "comment": "", "question": "", "coverage": [{"id":"","status":"missing|partial|clear","note?":""}], "askedCriteriaId": "", "verdictHint": "pass|maybe|fail" }',
      '] }',
      'No markdown. No extra keys.',
      '',
      judgeBlocks,
    );
  }

  private normalizeOne(
    panelArr: any[],
    judgeCfg: ArenaJudgeConfig,
  ): JudgeTurnResult {
    const criteria = this.getCriteria(judgeCfg);
    const fallback = this.fallbackFor(judgeCfg);

    const raw =
      panelArr.find(
        (x) => x?.judge === judgeCfg.id || x?.judgeId === judgeCfg.id,
      ) ?? null;
    if (!raw) return fallback;

    return {
      judge: judgeCfg.id,
      score: this.clampScore(Number(raw.score ?? fallback.score)),
      comment: this.str(raw.comment) || fallback.comment,
      question: this.oneSentence(this.str(raw.question) || fallback.question),
      coverage: this.normalizeCoverage(raw.coverage, criteria),
      askedCriteriaId:
        this.str(raw.askedCriteriaId) || fallback.askedCriteriaId,
      verdictHint: this.normalizeVerdictHint(raw.verdictHint),
    };
  }

  private fallbackFor(judge: ArenaJudgeConfig): JudgeTurnResult {
    const criteria = this.getCriteria(judge);
    return {
      judge: judge.id,
      score: 6.0,
      comment: 'Quick fallback: need one sharper detail.',
      question: 'What’s one concrete end-to-end example (who, when, outcome)?',
      coverage: criteria.map((c) => ({ id: c.id, status: 'missing' })),
      askedCriteriaId: criteria[0]?.id,
      verdictHint: 'maybe',
    };
  }

  private getCriteria(judge: ArenaJudgeConfig): JudgeCriteria[] {
    const c = (judge as any).criteriaConfig;
    return Array.isArray(c) ? c : [];
  }
}
