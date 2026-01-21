import { Injectable } from '@angular/core';
import {
  ArenaConfig,
  ArenaJudgeConfig,
  ArenaJudgeId,
  AttackVector,
  JudgeTone,
  PanelMode,
} from '../models/arena-config';

type SharedPromptOpts = {
  round: number;
  previouslyAsked: boolean;
  lastTopic: string | null;
  tone: JudgeTone;
  mode: PanelMode;
};

type HostProfile = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class JudgesService {
  private cfg: ArenaConfig | null = null;

  // --------- public: load / swap arena ----------
  useArenaConfig(cfg: ArenaConfig) {
    this.cfg = this.normalize(cfg);
  }

  getArena(): ArenaConfig {
    if (!this.cfg)
      throw new Error(
        'JudgesService: no arena config loaded. Call useArenaConfig().'
      );
    return this.cfg;
  }

  // --------- public: judges / voices ----------
  getJudges(): Array<{ id: ArenaJudgeId; label: string; dimension: string }> {
    const c = this.getArena();
    return c.judges.map((j) => ({
      id: j.id,
      label: j.label,
      dimension: j.dimension,
    }));
  }

  getJudgeVoices(): Record<string, string> {
    return this.getArena().voices ?? {};
  }

  getJudge(id: ArenaJudgeId): ArenaJudgeConfig | null {
    const c = this.getArena();
    return c.judges.find((j) => j.id === id) ?? null;
  }

  // --------- public: vectors ----------
  getVectors(judgeId: ArenaJudgeId, mode: PanelMode): AttackVector[] {
    const j = this.getJudge(judgeId);
    if (!j?.vectors) return [];

    if (mode === 'discovery') return j.vectors.discovery ?? [];
    return j.vectors.interrogation ?? [];
  }

  // --------- public: prompts ----------
  hostSystemPrompt(): string {
    const obj = this.getArena().objective;
    const objectiveText = obj
      ? [
          'ARENA OBJECTIVE:',
          `- ${obj.thesis}`,
          ...(obj.successDefinition?.length
            ? [
                '- Success means:',
                ...obj.successDefinition.map((x) => `  • ${x}`),
              ]
            : []),
          '',
        ].join('\n')
      : '';
    return [
      'You are the Host in Pitch Arena. Run a warm-up before judges.',
      objectiveText, // ✅ HERE
      'Be friendly, playful, concise. No hype. No negativity.',
      '',
      'Collect essentials (one question at a time):',
      '- founderName, ideaName, pitch, targetUser, targetContext, firstValue, acquisitionPath, inputSource',
      '',
      'Output MUST be valid JSON with EXACT keys:',
      '{"phase":"intro","ready":false,"nextQuestion":"...","profile":{"founderName":"...","ideaName":"...","pitch":"...","targetUser":"...","targetContext":"...","firstValue":"...","acquisitionPath":"...","inputSource":"..."},"comment":"..."}',
      '',
      'Hard rules:',
      '- Return ONLY JSON. No markdown. No code fences. No extra keys.',
      '- If ready=true, nextQuestion must be: "Ready. Let’s begin."',
    ].join('\n');
  }

  hostUserPrompt(profile: HostProfile, lastQ: string, lastA: string): string {
    return [
      'CURRENT PROFILE (may be incomplete):',
      JSON.stringify(profile),
      '',
      `LAST HOST QUESTION: ${lastQ}`,
      `FOUNDER ANSWER: ${lastA}`,
      '',
      'TASK:',
      '- Update profile fields if the answer provides them.',
      '- Ask the next single warm-up question.',
      '- If basics are complete, set ready=true and nextQuestion must be: "Ready. Let’s begin."',
    ].join('\n');
  }

  checkAnswerPrompt(profile: HostProfile, question: string, answer: string): string {
    return [
      'CURRENT PROFILE (may be incomplete):',
      JSON.stringify(profile),
      '',
      `LAST HOST QUESTION: ${question}`,
      `FOUNDER ANSWER: ${answer}`,
      '',
      'TASK:',
      '- Update profile fields if the answer provides them.',
      '- If basics are complete, set ready=true and nextQuestion must be: "Ready. Let’s begin."',
    ].join('\n');
  }

  sharedSystemPrompt(opts: SharedPromptOpts): string {
    const c = this.getArena();
    const gs = c.globalStyle;

    const banned = [
      ...(gs?.bannedPhrases ?? []),
      ...(gs?.bannedCliches ?? []),
    ].filter(Boolean);

    const maxWords = gs?.conversationRules?.maxCommentWords ?? 85;

    const toneBlock =
      opts.tone === 'supportive'
        ? [
            'TONE: Supportive coach.',
            '- Warm, curious, constructive.',
            '- Challenge assumptions gently; no dunking.',
          ].join('\n')
        : opts.tone === 'direct'
        ? [
            'TONE: Direct but friendly.',
            '- Clear concern, no theatrics.',
            '- Treat the founder like a competent peer.',
          ].join('\n')
        : [
            'TONE: Tough but fair.',
            '- Push firmly on weak logic.',
            '- No insults, no doom language.',
          ].join('\n');

    const modeGoal =
      gs?.modes?.[opts.mode]?.goal ??
      (opts.mode === 'discovery'
        ? 'Clarify missing context; help the founder be specific.'
        : 'Go deeper on one weak spot without theatrics.');

    return [
      'You are a judge in Pitch Arena.',
      `ROUND: ${opts.round}`,
      opts.lastTopic ? `LAST TOPIC (avoid repeating): ${opts.lastTopic}` : '',
      '',
      this.objectiveBlock(), // ✅ HERE
      '',
      toneBlock,
      `MODE: ${opts.mode}. ${modeGoal}`,
      '',
      'Style:',
      '- Use everyday language. Sound like a smart human, not a template.',
      '- Prefer curiosity over interrogation.',
      '- Avoid categorical statements (“this is impossible”, “this will never work”).',
      '- Don’t repeat the same question pattern between rounds.',
      opts.previouslyAsked
        ? '- You already asked something similar earlier — reframe or switch angle.'
        : '- Ask a fresh, natural question.',
      '',
      'HARD RULES:',
      '- ONE core concern.',
      '- Ask exactly ONE question (one sentence max).',
      `- Comment must be under ${maxWords} words.`,
      '- Score 0.0 to 10.0 with one decimal.',
      banned.length
        ? `- Do not use these phrases or close paraphrases: ${banned.join(
            ' | '
          )}`
        : '',
      '',
      'Return ONLY JSON with EXACT keys:',
      '{"judge":"...","score":0.0,"comment":"...","question":"..."}',
      'No markdown. No code fences. No extra keys.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  /**
   * if the arena has an objective then it needs to be in the prompt
   * for the judges to have a global objective.
   * @returns
   */
  private objectiveBlock(): string {
    const obj = this.getArena().objective;
    if (!obj) return '';

    return [
      'ARENA OBJECTIVE (follow this):',
      `- Thesis: ${obj.thesis}`,
      ...(obj.successDefinition?.length
        ? [
            '- Success definition:',
            ...obj.successDefinition.map((x) => `  • ${x}`),
          ]
        : []),
    ].join('\n');
  }

  rolePrompt(judgeId: ArenaJudgeId): string {
    const j = this.getJudge(judgeId);
    const focus = j?.focus?.length ? `\nFocus:\n- ${j.focus.join('\n- ')}` : '';
    const role = j?.rolePrompt
      ? `ROLE:\n${j.rolePrompt}`
      : `ROLE: ${j?.label ?? judgeId}`;
    return `${role}${focus}`.trim();
  }

  /**
   *
   * @param opts
   * @returns
   */
  attackSystemPrompt(opts: {
    judgeId: ArenaJudgeId;
    vector: AttackVector;
    round: number;
    previouslyAsked: boolean;
    lastTopic: string | null;
    tone: JudgeTone;
    mode: PanelMode;
  }): string {
    const c = this.getArena();
    const gs = c.globalStyle;

    const maxWords = gs?.conversationRules?.maxCommentWords ?? 85;
    const requiredMax = opts.vector.requiredSignals?.includes('numbers')
      ? Math.max(maxWords, 90)
      : maxWords;

    const forbidden = [
      ...(gs?.bannedPhrases ?? []),
      ...(gs?.bannedCliches ?? []),
      ...(opts.vector.forbiddenPhrases ?? []),
    ].filter(Boolean);

    // ✅ qType is the *form* of the question (not the topic)
    const qType = String((opts.vector as any)?.qType ?? 'generic').trim();

    // ✅ tiny cookbook: short, concrete forms the model can obey
    const qTypeCookbook: Record<string, string> = {
      // buyer/value
      buyer_actor:
        'Ask for the named buyer/decision-maker (a role + example org).',
      invoice:
        'Ask for the first invoice story (who pays + what outcome it buys).',
      willingness:
        'Ask what they would pay *instead* of doing today (price anchor in plain terms).',

      // substitute/switching
      substitute_map:
        'Ask what they do today step-by-step (tool + habit), and where it breaks.',
      switching_pain:
        'Ask for the specific breaking moment that forces switching (a real scenario).',

      // wedge & scope
      wedge_first_job:
        'Ask for the smallest first job/use-case (narrow group + why must-have).',
      wedge_expand:
        'Ask what comes second after the wedge (adjacent expansion and why).',
      scope_boundary: 'Ask what is explicitly out-of-scope for v1 and why.',

      // distribution
      channel_first20:
        'Ask where the first 20 users come from (exact place/community/partner).',
      distribution_constraint:
        'Ask for the biggest acquisition bottleneck and the workaround.',

      // retention
      retention_loop:
        'Ask what changes over time that makes users return (weekly trigger).',

      // defensibility / competition
      competitor_diff:
        'Ask to name the closest alternative and the 1 defensible difference.',

      // numbers
      numbers_value:
        'Ask for one rough number: time/cost/errors saved per user per week/month.',

      // trust
      trust_failure:
        'Ask what single failure would break trust instantly and how they prevent it.',

      // generic fallback
      generic:
        'Ask for one concrete end-to-end example (who/when/inputs/outputs/outcome).',
    };

    const formRule =
      qTypeCookbook[qType] ??
      'Pick a distinct question form (numbers, example, counterfactual, or step-by-step).';

    // ✅ If previously asked, force a different *form*
    const antiRepeat = opts.previouslyAsked
      ? [
          'ANTI-REPETITION (MANDATORY):',
          '- You have already asked something too similar recently.',
          '- Choose a DIFFERENT QUESTION FORM now (do not rephrase the same ask).',
          `- Current required form (qType=${qType}): ${formRule}`,
        ]
      : [
          'QUESTION FORM (MANDATORY):',
          `- qType=${qType}`,
          `- Form rule: ${formRule}`,
        ];

    // ✅ Special guard that stops the model repeating your exact failure mode
    const avoidSameAsk = [
      'AVOID THIS DEFAULT TEMPLATE unless qType=switching_pain:',
      '- Do NOT ask variants of: “what makes the current approach unacceptable / untenable / forces switching?”',
    ];

    return [
      this.sharedSystemPrompt({
        round: opts.round,
        previouslyAsked: opts.previouslyAsked,
        lastTopic: opts.lastTopic,
        tone: opts.tone,
        mode: opts.mode,
      }),
      '',
      this.rolePrompt(opts.judgeId),
      '',
      'ATTACK VECTOR (MANDATORY):',
      'ALIGNMENT:',
      '- Make your question move the founder closer to the arena success definition.',
      `- Concern: ${opts.vector.concern ?? ''}`,
      `- Ask intent: ${opts.vector.askIntent ?? ''}`,
      ...(opts.vector.questionExamples?.length
        ? [
            '- Example question styles (rephrase; do not copy):',
            ...opts.vector.questionExamples.map((x) => `  • ${x}`),
          ]
        : []),
      '',
      ...antiRepeat,
      '',
      ...avoidSameAsk,
      '',
      'HARD RULES:',
      `- Comment must be under ${requiredMax} words.`,
      '- Ask exactly ONE question (one sentence max).',
      '- Make the question specific (use a named role, concrete example, or a number prompt).',
      forbidden.length
        ? `- Do not use these phrases: ${forbidden.join(' | ')}`
        : '',
      '',
      'Return ONLY JSON with keys: judge, score, comment, question.',
    ]
      .filter(Boolean)
      .join('\n');
  }

  // --------- normalization ----------
  private normalize(cfg: ArenaConfig): ArenaConfig {
    // Ensure every vector has forbiddenPhrases array (so calling code doesn’t explode)
    const gs = cfg.globalStyle ?? null;

    return {
      ...cfg,
      judges: (cfg.judges ?? []).map((j) => ({
        ...j,
        tone: j.tone ?? gs?.toneDefault ?? 'direct',
        vectors: j.vectors
          ? {
              discovery: (j.vectors.discovery ?? []).map((v) => ({
                ...v,
                forbiddenPhrases: Array.isArray(v.forbiddenPhrases)
                  ? v.forbiddenPhrases
                  : [],
                requiredSignals: Array.isArray(v.requiredSignals)
                  ? v.requiredSignals
                  : [],
                questionExamples: Array.isArray((v as any).questionExamples)
                  ? (v as any).questionExamples
                  : [],
              })) as any,
              interrogation: (j.vectors.interrogation ?? []).map((v) => ({
                ...v,
                forbiddenPhrases: Array.isArray(v.forbiddenPhrases)
                  ? v.forbiddenPhrases
                  : [],
                requiredSignals: Array.isArray(v.requiredSignals)
                  ? v.requiredSignals
                  : [],
                questionExamples: Array.isArray((v as any).questionExamples)
                  ? (v as any).questionExamples
                  : [],
              })) as any,
            }
          : undefined,
      })),
    };
  }
}
