import { inject, Injectable } from '@angular/core';
import { ArenaConfig, ArenaJudgeConfig } from '../arena-models';
import { GeminiService } from '#services/ai/gemini.service';
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
import { ArenaMemory } from './arena-service';

export type PanelTurnResult = { panel: JudgeTurnResult[] };

export type PanelPrompt = {
  system: string;
  user: string;
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

export type CriteriaCoverage = {
  id: CriteriaId;
  status: 'missing' | 'partial' | 'clear';
  note?: string;
};

type JudgeIntent = {
  phase?: 'clarify_core' | 'stress_weakest' | 'decision_ready';
  goal?: string;
  primaryCriteria?: CriteriaId[];
  aggressiveness?: 'light' | 'medium' | 'hard';
};

export type JudgeCriteria = {
  id: CriteriaId;
  description: string;
  signals?: CriteriaSignal[];
};

export type JudgeTurnArgs = {
  profile: Record<string, any>;
  lastDelta?: string;
  memory?: ArenaMemory;
  mode?: 'discovery' | 'interrogation';
  round?: number;
  maxRounds?: number;
  intent?: JudgeIntent;
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

  //- If the question does not sound like it follows directly from the comment, rewrite it.
  // ✅ small “voice line” extracted from config (you can extend this)
  private getVoiceLine(j: ArenaJudgeConfig): string | null {
    const persona = (j as any)?.persona;
    const style = persona?.speakingStyle?.voice;
    const voice = style ? `Style: ${style}` : '';
    const tone = j.tone ? `Tone: ${j.tone}` : '';

    const line = [tone, voice].filter(Boolean).join(' | '); //removed sig
    return line || null;
  }

  private buildPanelUser(args: JudgeTurnArgs): string {
    const delta = args.lastDelta ? String(args.lastDelta) : '';
    const safeDelta = delta.length > 2500 ? delta.slice(0, 2500) : delta;

    return this.joinLines(
      'Founder profile:',
      JSON.stringify(args.profile ?? {}),
      safeDelta ? '' : '',
      safeDelta ? 'Context:' : '',
      safeDelta ? safeDelta : '',
    );
  }

  getRules(maxWords) {
    // Hard rules that force “thinking-like” continuity.
    var turnTextRules = [
      'TURN TEXT RULES (hard):',
      `- Produce exactly ONE field called "turnText" per judge (no separate comment/question).`,
      `- "turnText" MUST be exactly 2 sentences, total <= ${maxWords} words.`,
      `- Sentence 1 = your natural reaction (human, spoken, in-character).`,
      `- Sentence 2 = your ONE question (human, spoken, in-character),`,
      //'and it MUST start with one of: "So—", "Okay—", "Right—", "Alright—", "Quick one—".`,
      `- The question must follow naturally from sentence 1 (same vibe).`,
      '',
      'FORBIDDEN (never say):',
      '- "walk me through", "logic flow", "pipeline", "architecture", "within scope", "48-hour".',
      '- "as a judge", "if I’m watching your demo", "demo viewer", "on screen from the moment".',
      //'- Gemini, AI models, personas, hidden agendas, prompts, system instructions, caching.',
      '- Anything that sounds like a spec or implementation discussion.',
    ].join('\n');
    return turnTextRules;
  }

  getOldRules(maxWords, qMaxSentences) {
    //TODO move these into the config gemini-clean is the current reference
    var STYLE_RULES = [
      'Generate the comment first.',
      'Then generate the question as a continuation of the same thought.',
      '- Write like spoken conversation in a room.',
      '- The comment is your thought out loud.',
      '- The question is the very next sentence you say.',
      '- Do NOT reset tone or framing between comment and question.',
      '',
      'Rules (apply to EACH judge):',
      `- Comment <= ${maxWords} words.`,
      `- Ask EXACTLY ONE question (<= ${qMaxSentences} sentence).`,
    ];
    return STYLE_RULES;
  }

  /**
   *
   * @param j
   * @returns
   */
  private personaBlock(j: ArenaJudgeConfig): string {
    const p = (j as any).persona;
    if (!p) return '';

    const pick = (arr?: string[], n = 3) => (arr ?? []).slice(0, n);

    //const sig = pick(p.speakingStyle?.signaturePhrases, 3);
    const never = pick(p.speakingStyle?.bannedPhrases, 5);
    const peeves = pick(p.petPeeves, 3);

    return this.joinLines(
      'Persona:',
      p.archetype ? `Archetype: ${p.archetype}` : '',
      p.defaultStance ? `Stance: ${p.defaultStance}` : '',
      p.speakingStyle?.voice ? `Voice: ${p.speakingStyle.voice}` : '',
      peeves.length ? `Pet peeves: ${peeves.join(' | ')}` : '',
      //sig.length ? `Openers: ${sig.join(' ')}` : '',
      never.length ? `Never say: ${never.join(' | ')}` : '',
    ).trim();
  }

  /**
   *
   * @param cfg
   * @param judges
   * @param args
   * @param logEvent
   * @returns
   */
  async runPanelTurn(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
    logEvent: Function,
  ): Promise<PanelTurnResult> {
    const system = this.buildPanelSystem(cfg, judges, args);
    const user = this.buildPanelUser(args);

    const raw = await this.gemini.textPrompt(user, system);
    const obj = this.parseJson(raw);

    if (logEvent) {
      logEvent('panel.prompt', {
        system: system,
        user: user,
      });
    }

    if (!obj?.panel || !Array.isArray(obj.panel)) {
      //if we are here something went wrong
      console.log('Judge Failure', obj);
      return { panel: judges.map((j) => this.fallbackFor(cfg, j)) };
    }

    // normalize + then enforce quality gates
    const normalized = judges.map((j) => this.normalizeOne(cfg, obj.panel, j));
    return { panel: normalized };
  }

  /**
   *
   * @param cfg
   * @param judges
   * @param args
   * @returns
   */
  getPanelPrompt(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
  ): PanelPrompt {
    return {
      system: this.buildPanelSystem(cfg, judges, args),
      user: this.buildPanelUser(args),
    };
  }

  private newbuildPanelSystem(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
  ): string {
    const banned = this.compact([
      ...(cfg.globalStyle?.bannedPhrases ?? []),
      // optionally include cliches too if you want:
      // ...(cfg.globalStyle?.bannedCliches ?? []),
    ]);

    const rules = cfg.globalStyle?.conversationRules;
    const maxWords = rules?.maxCommentWords ?? 80;

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
        const criteria = this.getCriteria(cfg, j);
        const criteriaBlock = criteria
          .map((c) => {
            const sig = c.signals?.length ? ` (${c.signals.join(', ')})` : '';
            return `- ${c.description}${sig}`;
          })
          .join('\n');

        const persona = this.personaBlock(j);

        return this.joinLines(
          `JUDGE ${j.id}: ${j.label}`,
          `Tone: ${j.tone ?? 'direct'}`,
          persona ? persona : '',
          `Criteria:\n${criteriaBlock}`,
        );
      })
      .join('\n\n');

    // Hard rules that force “thinking-like” continuity.
    const turnTextRules = [
      'TURN TEXT RULES (hard):',
      `- Produce exactly ONE field called "turnText" per judge (no separate comment/question).`,
      `- "turnText" MUST be exactly 2 sentences, total <= ${maxWords} words.`,
      `- Sentence 1 = your natural reaction (human, spoken, in-character).`,
      `- Sentence 2 = your ONE question (human, spoken), and it MUST start with one of: "So—", "Okay—", "Right—", "Alright—", "Quick one—".`,
      `- The question must follow naturally from sentence 1 (same vibe).`,
      '',
      'FORBIDDEN (never say):',
      '- "walk me through", "logic flow", "pipeline", "architecture", "within scope", "48-hour".',
      '- "as a judge", "if I’m watching your demo", "demo viewer", "on screen from the moment".',
      '- Gemini, AI models, personas, hidden agendas, prompts, system instructions, caching.',
      '- Anything that sounds like a spec or implementation discussion.',
    ].join('\n');

    return this.joinLines(
      `You are a panel of ${judges.length} judges. Produce ONE result per judge.`,
      objectiveLine,
      intentLine ? `Chair guidance: ${intentLine}` : '',
      safetyBlock,
      '',
      'Rules (apply to EACH judge):',
      banned.length ? `- Avoid: ${banned.join(' | ')}` : '',
      '',
      turnTextRules,
      '',
      'Conversation context:',
      '- The user message may contain either:',
      '  (a) a single previous panel Q/A, OR',
      '  (b) `LastDeltaByJudge:` followed by a JSON object keyed by judgeId.',
      '- If `LastDeltaByJudge` is present, each judge MUST use ONLY their own entry (by judgeId).',
      '',
      'Output ONLY valid JSON in this exact shape:',
      '{ "panel": [',
      '  { "judge": "<judgeId>", "score": 0, "turnText": "", "coverage": [{"id":"","status":"missing|partial|clear","note?":""}], "askedCriteriaId": "", "verdictHint": "pass|maybe|fail" }',
      '] }',
      'No markdown. No extra keys.',
      '',
      judgeBlocks,
    );
  }

  /**
   *
   * @param cfg
   * @param judges
   * @param args
   * @returns
   */
  private buildPanelSystem(
    cfg: ArenaConfig,
    judges: ArenaJudgeConfig[],
    args: JudgeTurnArgs,
  ): string {
    const banned = this.compact([...(cfg.globalStyle?.bannedPhrases ?? [])]);

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
        const criteria = this.getCriteria(cfg, j);
        const criteriaBlock = criteria
          .map((c) => {
            const sig = c.signals?.length ? ` (${c.signals.join(', ')})` : '';
            return `- ${c.description}${sig}`;
          })
          .join('\n');

        const persona = this.personaBlock(j);
        const voiceLine = this.getVoiceLine(j);
        //const personaLine = voiceLine ? `Voice: ${voiceLine}` : '';

        return this.joinLines(
          `JUDGE ${j.id}: ${j.label}`,
          `Tone: ${j.tone ?? 'direct'}`,
          persona ? persona : '',
          `Criteria:\n${criteriaBlock}`,
        );
      })
      .join('\n\n');

    // ✅ tighter “spoken” rules + explicit forbidden examples
    const spokenRules = [
      'STYLE RULES (hard):',
      ...this.getRules(maxWords),
    ].join('\n');

    return this.joinLines(
      `You are a panel of ${judges.length} judges. Produce ONE result per judge.`,
      objectiveLine,
      intentLine ? `Chair guidance: ${intentLine}` : '',
      safetyBlock,

      banned.length ? `- Avoid: ${banned.join(' | ')}` : '',
      '',
      spokenRules,
      '',
      'Conversation context:',
      '- The user message may contain either:',
      '  (a) a single previous panel Q/A, OR',
      '  (b) `LastDeltaByJudge:` followed by a JSON object keyed by judgeId.',
      '- If `LastDeltaByJudge` is present, each judge MUST use ONLY their own entry (by judgeId).',
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
    cfg: ArenaConfig,
    panelArr: any[],
    judgeCfg: ArenaJudgeConfig,
  ): JudgeTurnResult {
    const criteria = this.getCriteria(cfg, judgeCfg);
    const fallback = this.fallbackFor(cfg, judgeCfg);

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

  private fallbackFor(cfg, judge: ArenaJudgeConfig): JudgeTurnResult {
    const criteria = this.getCriteria(cfg, judge);
    return {
      judge: judge.id,
      score: 6.0,
      comment: 'Quick fallback: need one sharper detail.',
      question: 'Okay—what’s one real example of someone using this this week?',
      coverage: criteria.map((c) => ({ id: c.id, status: 'missing' })),
      askedCriteriaId: criteria[0]?.id,
      verdictHint: 'maybe',
    };
  }

  private getCriteria(
    cfg: ArenaConfig,
    judge: ArenaJudgeConfig,
  ): JudgeCriteria[] {
    const judgeList =
      (judge as any).criteriaConfig ?? (judge as any).criteria ?? []; // ✅ support your JSON

    const jCriteria = Array.isArray(judgeList) ? judgeList : [];

    const globalList = (cfg as any).criteria;
    const gCriteria = Array.isArray(globalList) ? globalList : [];
    const gMap = new Map<string, any>(gCriteria.map((c: any) => [c.id, c]));

    return jCriteria.map((jc: any) => {
      const gc = gMap.get(jc.id);
      return {
        id: String(jc.id),
        description: String(
          gc?.description ?? 'Clarify this area with one concrete question.',
        ),
        signals: (gc?.signals ?? []) as any,
      };
    });
  }
}
