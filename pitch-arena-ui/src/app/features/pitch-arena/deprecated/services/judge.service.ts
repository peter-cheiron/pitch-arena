import { inject, Injectable } from '@angular/core';
import { GeminiService } from '#services/ai/gemini.service';
import { ArenaConfig, ArenaJudgeConfig } from '../models/arena-config';

/**
 * Middle-ground JudgeService:
 * - No attack vectors / no parse
 * - Criteria-driven (like host profileConfig, but "criteriaConfig")
 * - One question per turn
 * - Returns JSON: score, comment, question, coverage (criteria status), and optional deltas
 */

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
  id: CriteriaId;              // e.g. "buyer", "substitute", "distribution"
  description: string;         // short human framing
  signals?: CriteriaSignal[];  // what "good" looks like
};

export type CriteriaCoverage = {
  id: CriteriaId;
  status: 'missing' | 'partial' | 'clear';
  note?: string;              // <= ~80 chars
};

export type JudgeMemoryLite = {
  // keep it tiny to stay fast + avoid loops
  askedCriteriaIds?: CriteriaId[];    // last N
  covered?: CriteriaCoverage[];       // last known
  lastQuestion?: string;
  lastScore?: number;
};

export type JudgeTurnArgs = {
  // what the judge sees
  profile: Record<string, any>;
  // optionally provide a short delta since last turn/round (preferred over full transcript)
  lastDelta?: string; // e.g. last judge Q + founder A
  // minimal memory
  memory?: JudgeMemoryLite;
  // optionally, force mode
  mode?: 'discovery' | 'interrogation' | 'impact';
  round?: number;
  maxRounds?: number;
  lastQ?: string;
  lastA?: string;
};

export type JudgeTurnResult = {
  judge: string;
  score: number;                // 1–10
  comment: string;              // <= ~85 words
  question: string;             // one sentence max
  coverage: CriteriaCoverage[]; // per criteria
  askedCriteriaId?: CriteriaId; // what this question targets (for anti-repeat)
  verdictHint?: 'pass' | 'maybe' | 'fail'; // optional (you can ignore)
};

@Injectable({ providedIn: 'root' })
export class JudgeService {
  gemini = inject(GeminiService);

  runPrompt(user: string, system: string, usage?: any) {
    return this.gemini.textPrompt(user, system);
  }

  /**
   * Build a single combined prompt for a judge turn.
   * This is designed to be FAST:
   * - no vector selection
   * - minimal memory
   * - optional lastDelta, not full transcript
   */
  getPrompt(
    config: ArenaConfig,
    judge: ArenaJudgeConfig,
    args: JudgeTurnArgs
  ): string {
    const objectiveText = config.objective
      ? [
          'ARENA OBJECTIVE:',
          `- ${config.objective.thesis}`,
          ...(config.objective.successDefinition?.length
            ? [
                '- Success means:',
                ...config.objective.successDefinition.map((x) => `  • ${x}`),
              ]
            : []),
          '',
        ].join('\n')
      : '';

    const safety: string[] = [];
    if ((config as any).safety) safety.push(String((config as any).safety));

    const mode = args.mode ?? 'discovery';

    // Expect you add this to ArenaJudgeConfig (middle ground)
    // If you haven't yet, you can keep it optional and fallback.
    console.log(judge)
    const criteriaConfig: JudgeCriteria[] =
      (judge as any).criteriaConfig ??
      this.defaultCriteriaForJudge(judge.id);

    const forbid = [
      ...((config.globalStyle?.bannedPhrases as any) ?? []),
      ...((config.globalStyle?.bannedCliches as any) ?? []),
    ].filter(Boolean);

    const asked = (args.memory?.askedCriteriaIds ?? []).slice(-6);
    const covered = args.memory?.covered ?? [];

    const hardRules = config.globalStyle?.conversationRules;

    const maxWords = hardRules?.maxCommentWords ?? 85;
    const qMaxSentences = hardRules?.questionMaxSentences ?? 1;

    const schemaExample: JudgeTurnResult = {
      judge: judge.id,
      score: 6.5,
      comment: 'Short, specific, constructive.',
      question: 'One sharp question?',
      coverage: criteriaConfig.map((c) => ({
        id: c.id,
        status: 'missing',
        note: '',
      })),
      askedCriteriaId: criteriaConfig[0]?.id ?? 'unknown',
      verdictHint: 'maybe',
    };

    return [
      `ROLE: You are ${judge.label} in Pitch Arena.`,
      objectiveText,
      `STYLE: ${judge.tone ?? 'direct'}`,
      `MODE: ${mode}`,
      safety.length
        ? `SAFETY: If safety concerns apply, politely narrow scope and ask for safer framing.\n${safety.join(
            '\n'
          )}`
        : '',
      '',
      'YOUR JOB THIS TURN:',
      '- Evaluate coverage of each criterion as: missing / partial / clear.',
      '- Ask ONE question that improves the *weakest* or *most important missing* criterion.',
      '- Avoid repeating the same criterion you asked recently.',
      '- Score 1–10 based on clarity + credibility across criteria (not vibes).',
      '',
      'HARD RULES:',
      `- Comment <= ${maxWords} words.`,
      `- Ask exactly ONE question (max ${qMaxSentences} sentence).`,
      forbid.length ? `- Avoid these phrases: ${forbid.join(' | ')}` : '',
      '',
      'CRITERIA (you must assess all):',
      ...criteriaConfig.map((c) => {
        const sig = c.signals?.length ? ` [signals: ${c.signals.join(', ')}]` : '';
        return `- ${c.id}: ${c.description}${sig}`;
      }),
      '',
      'ANTI-REPEAT MEMORY:',
      asked.length ? `- Recently asked criteria: ${asked.join(', ')}` : '- Recently asked criteria: (none)',
      covered.length
        ? `- Last known coverage: ${JSON.stringify(covered)}`
        : '- Last known coverage: (none)',
      '',
      'OUTPUT:',
      '- Return ONLY valid JSON matching the schema below (no markdown, no code fences).',
      JSON.stringify(schemaExample),
      '',
      'STATE:',
      'FOUNDER PROFILE:',
      JSON.stringify(args.profile ?? {}),
      args.lastDelta ? '' : '',
      args.lastDelta ? 'LAST DELTA (most recent Q/A):' : '',
      args.lastDelta ? String(args.lastDelta).slice(0, 1500) : '',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * Execute one judge turn (prompt + parse + normalization).
   * Keep this cheap; do NOT do second calls.
   */
  async runTurn(
    config: ArenaConfig,
    judge: ArenaJudgeConfig,
    args: JudgeTurnArgs
  ): Promise<JudgeTurnResult> {
    const prompt = this.getPrompt(config, judge, args);
    const raw = await this.gemini.textPrompt(prompt, ''); // you’re already embedding system inside one prompt
    const json = this.coerceJson(raw, null);

    const criteriaConfig: JudgeCriteria[] =
      (judge as any).criteriaConfig ??
      this.defaultCriteriaForJudge(judge.id);

    const fallback: JudgeTurnResult = {
      judge: judge.id,
      score: 6.0,
      comment: 'Quick fallback: need one sharper detail.',
      question: `What’s one concrete example of a user using this end-to-end (who, when, outcome)?`,
      coverage: criteriaConfig.map((c) => ({ id: c.id, status: 'missing' })),
      askedCriteriaId: criteriaConfig[0]?.id,
      verdictHint: 'maybe',
    };

    if (!json || typeof json !== 'object') return fallback;

    const asString = (x: any) => String(x ?? '').trim();
    const score = this.clampScore(Number((json as any).score ?? fallback.score));
    const comment = asString((json as any).comment) || fallback.comment;
    const question = this.oneSentence(asString((json as any).question) || fallback.question);

    const askedCriteriaId = asString((json as any).askedCriteriaId) || fallback.askedCriteriaId;

    const coverage = this.normalizeCoverage(
      (json as any).coverage,
      criteriaConfig
    );

    const verdictHint = this.normalizeVerdictHint((json as any).verdictHint);

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

  // ---------------- helpers ----------------

  private defaultCriteriaForJudge(judgeId: string): JudgeCriteria[] {
    // safe defaults so you can migrate gradually
    if (judgeId === 'vc') {
      return [
        { id: 'buyer', description: 'Who pays and why they care', signals: ['named_entity', 'example'] },
        { id: 'substitute', description: 'What they do today instead', signals: ['example'] },
        { id: 'distribution', description: 'How first users arrive', signals: ['channel'] },
        { id: 'pricing', description: 'Rough price anchor tied to value', signals: ['numbers'] },
      ];
    }
    if (judgeId === 'cto') {
      return [
        { id: 'mechanism', description: 'End-to-end flow and boundaries', signals: ['mechanism'] },
        { id: 'risk', description: 'Key technical risk + mitigation', signals: ['risk'] },
        { id: 'sequencing', description: 'Smallest complete v1 / first slice', signals: ['timeline', 'constraint'] },
      ];
    }
    return [
      { id: 'moment', description: 'When/why the user uses it', signals: ['example'] },
      { id: 'value', description: 'What “good” looks like', signals: ['example'] },
      { id: 'repeat', description: 'Why they return', signals: ['example'] },
    ];
  }

  private coerceJson(raw: any, fallback: any) {
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

  private normalizeCoverage(input: any, criteria: JudgeCriteria[]): CriteriaCoverage[] {
    const map = new Map<string, CriteriaCoverage>();

    if (Array.isArray(input)) {
      for (const row of input) {
        const id = String(row?.id ?? '').trim();
        if (!id) continue;
        const statusRaw = String(row?.status ?? '').toLowerCase();
        const status: CriteriaCoverage['status'] =
          statusRaw.includes('clear') ? 'clear' :
          statusRaw.includes('partial') ? 'partial' :
          'missing';
        const note = row?.note ? String(row.note).trim().slice(0, 120) : undefined;
        map.set(id, { id, status, note });
      }
    }

    // Ensure all criteria exist in output, in order
    return criteria.map((c) => map.get(c.id) ?? ({ id: c.id, status: 'missing' }));
  }

  private clampScore(n: number) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
  }

  private oneSentence(q: string): string {
    // enforce your “one sentence” rule even if model violates
    const s = String(q ?? '').trim();
    if (!s) return s;
    // split on sentence end; keep first
    const m = s.match(/^(.+?[.!?])(\s|$)/);
    return m ? m[1].trim() : s;
  }

  private normalizeVerdictHint(v: any): 'pass' | 'maybe' | 'fail' | undefined {
    const s = String(v ?? '').toLowerCase();
    if (!s) return undefined;
    if (s.includes('pass') || s.includes('go') || s.includes('strong')) return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject')) return 'fail';
    return 'maybe';
  }

  /**
   * Update judge memory after a turn (tiny, fast).
   * Call this from PitchArena after you receive JudgeTurnResult.
   */
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
}
