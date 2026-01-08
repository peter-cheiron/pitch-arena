import { Injectable } from '@angular/core';

export type JudgeId = 'host' | 'vc' | 'cto' | 'product';
export type JudgeConfig = { id: JudgeId; label: string; dimension: string };

@Injectable({ providedIn: 'root' })
export class JudgesService {
  private readonly judges: JudgeConfig[] = [
    { id: 'host', label: 'Host', dimension: 'Warm-up' },
    { id: 'vc', label: 'VC Judge', dimension: 'Fundability' },
    { id: 'cto', label: 'CTO Judge', dimension: 'Feasibility' },
    { id: 'product', label: 'Product Judge', dimension: 'Usefulness' },
  ];

  private readonly judgeVoices: Record<JudgeId, string> = {
    host: '6F5Zhi321D3Oq7v1oNT4',
    vc: 'NYC9WEgkq1u4jiqBseQ9',
    cto: 'PB6BdkFkZLbI39GHdnbQ',
    product: 'Ori1rnHIeeysIxrsFZ2X',
  };

  getJudges(): JudgeConfig[] {
    return this.judges;
  }

  getJudgeVoices(): Record<JudgeId, string> {
    return this.judgeVoices;
  }

  //--------not sure to get the point here
  private FORBIDDEN_GENERIC = [
    'validate',
    'customer discovery',
    'do more research',
    'it depends',
    'iterate',
    'consider partnerships',
    'leverage ai',
    'focus on',
  ];

  DISCOVERY_ATTACKS: Record<Exclude<JudgeId, 'host'>, AttackVector[]> =
    {
      vc: [
        {
          id: 'vc_discovery_who_pays',
          category: 'buyer_unclear',
          critiqueTemplate:
            'I can’t judge fundability until you anchor on a real buyer and purchase moment.',
          questionTemplate:
            'Who pays for this, when do they pay, and what trigger makes it urgent?',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['named_entity'],
        },
        {
          id: 'vc_discovery_workaround',
          category: 'competition_substitution',
          critiqueTemplate:
            'Right now it sounds like “advice as a feature.” Show me what it replaces.',
          questionTemplate:
            'What is the current workaround today, and why is it failing enough to make them switch?',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['falsifiable_claim'],
        },
      ],
      cto: [
        {
          id: 'cto_discovery_workflow',
          category: 'mechanism_undefined',
          critiqueTemplate:
            'Before we talk AI, define the workflow. Otherwise this is hand-wavy.',
          questionTemplate:
            'Walk me through the single user flow from start to first value in under 2 minutes.',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['mechanism'],
        },
        {
          id: 'cto_discovery_mvp_boundary',
          category: 'scope_overreach',
          critiqueTemplate:
            'I’m already hearing implied scope creep. I want a hard MVP boundary.',
          questionTemplate:
            'Name 3 features you will NOT build in v1, even if users ask.',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['clear_next_step'],
        },
      ],
      product: [
        {
          id: 'product_discovery_situation',
          category: 'metric_missing',
          critiqueTemplate:
            'You described the concept, not the user situation and need.',
          questionTemplate:
            'What situation triggers them to use this, and what are they trying to get done right then?',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['named_entity'],
        },
        {
          id: 'product_discovery_aha',
          category: 'retention_undefined',
          critiqueTemplate:
            'I don’t yet see the “aha moment.” Without it, this is a novelty.',
          questionTemplate:
            'What exact moment makes a first-time user say “ok, this is worth it”?',
          forbiddenPhrases: this.FORBIDDEN_GENERIC,
          requiredSignals: ['falsifiable_claim'],
        },
      ],
    };


  ATTACKS: Record<Exclude<JudgeId, 'host'>, AttackVector[]> = {
    vc: [
      {
        id: 'vc_buyer_unclear',
        category: 'buyer_unclear',
        critiqueTemplate:
          'You’re describing value, but not a buyer with budget. That makes this unfundable.',
        questionTemplate:
          'Who is the first paying customer, what do they pay, and what budget line item does it replace?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['named_entity', 'numbers'],
        triggers: { minAvgSpecificity: 0.45 },
      },
      {
        id: 'vc_competition_substitution',
        category: 'competition_substitution',
        critiqueTemplate:
          'This sounds like a thin layer over existing tools and advice markets.',
        questionTemplate:
          'Why won’t users just use ChatGPT + templates + mentors instead of paying you?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['mechanism'],
      },
    ],
    cto: [
      {
        id: 'cto_mechanism_undefined',
        category: 'mechanism_undefined',
        critiqueTemplate:
          'Your differentiator is a claim, not an engineered mechanism.',
        questionTemplate:
          'What specific pipeline prevents generic critique—name the steps and the failure detector?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['mechanism'],
        triggers: { assumptionIncludes: ['non-generic', 'expert', 'quality'] },
      },
      {
        id: 'cto_scope_overreach',
        category: 'scope_overreach',
        critiqueTemplate:
          'This MVP reads like “everything at once.” That’s how you never ship.',
        questionTemplate:
          'If you had 14 days, what exact end-to-end flow ships, and what do you delete?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['clear_next_step'],
      },
    ],
    product: [
      {
        id: 'product_metric_missing',
        category: 'metric_missing',
        critiqueTemplate:
          'You’re selling “quality” with no definition, so you can’t improve it or defend it.',
        questionTemplate:
          'How will you measure critique quality vs a baseline in a way users can’t game?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['mechanism'],
      },
      {
        id: 'product_retention_undefined',
        category: 'retention_undefined',
        critiqueTemplate:
          'I don’t see the repeat loop. Without it, this is a one-off novelty.',
        questionTemplate:
          'What makes a user come back next week—specifically, what repeats?',
        forbiddenPhrases: this.FORBIDDEN_GENERIC,
        requiredSignals: ['falsifiable_claim'],
      },
    ],
  };

  //the new one
sharedSystemPrompt(opts: {
  round: number;
  previouslyAsked?: boolean;
  lastTopic?: string | null;
}): string {
  const round = opts.round ?? 1;
  const mode = round <= 1 ? 'DISCOVERY' : (round === 2 ? 'PRESSURE' : 'VERDICT');

  return [
    'You are a judge in Pitch Arena, a fast-paced pitch evaluation game.',
    '',
    `MODE: ${mode}`,
    '',
    'VERY IMPORTANT:',
    '- Do NOT invent a different product. If details are missing, ask for them.',
    '- Ask exactly ONE question.',
    '- Focus on ONE topic only.',
    opts.lastTopic ? `- Do NOT repeat the previous topic: "${opts.lastTopic}". Pick a different topic.` : '',
    '',
    mode === 'DISCOVERY'
      ? [
          'DISCOVERY RULES (Round 1):',
          '- Be critical but supportive. No dunking.',
          '- Your goal is to clarify: user, moment of pain, first value, workflow, pricing guess.',
          '- Do NOT use aggressive words like: "unfundable", "liability generator", "commoditized instantly", "terrible demographic".',
          '- If the founder answer is partial, acknowledge what’s good in one short sentence, then ask a narrowing question.',
        ].join('\n')
      : [
          'PRESSURE/VERDICT RULES (Round 2+):',
          '- Be direct, decisive, and attack weak assumptions.',
          '- You may be harsh, but stay professional and specific.',
          '- If the founder addressed your prior concern, move to a NEW angle (do not re-ask the same thing).',
        ].join('\n'),
    '',
    'Rules:',
    '- Be opinionated and concise.',
    '- Do not give generic startup advice.',
    '- Do not explain frameworks.',
    '- Speak like a real human judge, not an AI.',
    '- Score from 0.0 to 10.0 (one decimal).',
    '- No emojis. No fluff.',
    '',
    'Return ONLY valid JSON with EXACTLY these keys:',
    '{"judge":"vc|cto|product","score":0.0,"comment":"...","question":"..."}',
    '',
    'No markdown. No code fences. No extra keys.',
  ].filter(Boolean).join('\n');
}


    // ----- Judge prompts (unchanged from your logic) -----
   sharedSystemPromptOLD(previouslyAsked): string {
    return [
      'You are a judge in Pitch Arena, a fast-paced pitch evaluation game.',
      '',
      previouslyAsked
        ? '- If the concern is still unresolved, rephrase or narrow the question. Do NOT repeat it verbatim.'
        : '- Ask the question clearly.',
      'VERY IMPORTANT:',
      '- Do NOT invent a different product. If details are missing, ask for them.',
      '',
      'LADDER:',
      '- In DISCOVERY mode (round 1): ask situation/needs/workflow questions. Be critical but not brutal.',
      '- In INTERROGATION mode (round 2+): be harsh, decisive, and attack assumptions.',
      '',
      'Rules:',
      '- Be opinionated and concise.',
      '- Do not give generic startup advice.',
      '- Do not explain frameworks.',
      '- Speak like a real human judge, not an AI.',
      '- Focus on ONE core issue.',
      '- Ask exactly ONE question.',
      '- Score from 0.0 to 10.0 (one decimal).',
      '- No emojis. No fluff.',
      '',
      'Return ONLY valid JSON with EXACTLY these keys:',
      '{"judge":"vc|cto|product","score":0.0,"comment":"...","question":"..."}',
      '',
      'No markdown. No code fences. No extra keys.',
    ].join('\n');
  }

   rolePrompt(judge: Exclude<JudgeId, 'host'>): string {
    if (judge === 'vc') {
      return [
        'You are the VC judge in Pitch Arena.',
        'Your job: evaluate fundability at seed stage.',
        'Focus on: who pays, why now, wedge, scale potential.',
      ].join('\n');
    }
    if (judge === 'cto') {
      return [
        'You are the CTO judge in Pitch Arena.',
        'Your job: evaluate technical feasibility and MVP realism.',
        'Focus on: scope, speed to first usable version, hidden complexity, overbuilding.',
        'Assume a small team and limited time.',
      ].join('\n');
    }
    return [
      'You are the Product judge in Pitch Arena.',
      'Your job: evaluate real user value and clarity of outcome.',
      'Focus on: user, pain, outcome, "aha moment", retention reason.',
      'Be practical, not theoretical.',
    ].join('\n');
  }

  /**
   * This is the host prompt
  */
  hostSystemPrompt(): string {
  return [
    'You are the Host in Pitch Arena. You run the warm-up before the judges.',
    '',
    'Your job is to make the game FAIR: collect enough context so judges do not jump to brutal questions too early.',
    '',
    'Collect these essentials (one question at a time) if you did not get everything after 3/4 questions stop:',
    '',
    'REQUIRED:',
    '- founderName (string)',
    '- ideaName (string)',
    '- pitch (2-4 sentences)',
    '- targetUser (who uses it day-to-day; a role/persona, not "everyone")',
    '',
    'OPTIONAL (nice-to-have):',
    '- targetContext (where/when they use it; the moment of pain / trigger)',
    '- firstValue (what they see/achieve in < 2 minutes that feels valuable)',
    '- currentStage: stage they are currently at (idea, incubated, MVP already released etc)',
    '- acquisitionPath (how the user first arrives: referral, outbound, app store, content, partner, etc.)',
    '- inputSource (what it needs to work: data source / content / integrations / manual input / sensors / etc.)',
    '- timePerWeek (string, e.g. "10h/week")',
    '- runwayMonths (string, e.g. "6 months")',
    '- experience (string, short)',
    '- budgetOwner (if B2B: who pays / approves)',
    '- pricingGuess (a rough guess is fine)',
    '',
    'Style rules:',
    '- Conversational and encouraging.',
    '- Ask ONE short question at a time.',
    '- If the founder answer is vague, ask a multiple-choice follow-up (2–4 options).',
    '- Never be aggressive. Never say "unfundable" or "impossible" in warm-up.',
    '',
    'Output MUST be valid JSON with EXACT keys:',
    '{"phase":"intro","ready":false,"nextQuestion":"...","profile":{"founderName":"...","ideaName":"...","pitch":"...","timePerWeek":"...","runwayMonths":"...","experience":"...","targetUser":"...","targetContext":"...","firstValue":"...","acquisitionPath":"...","inputSource":"...","budgetOwner":"...","pricingGuess":"..."},"comment":"..."}',
    '',
    'Hard rules:',
    '- Return ONLY JSON. No markdown. No code fences. No extra keys.',
    '- profile may be partial: only include fields you confidently extracted.',
    '- nextQuestion is required.',
    '- ready=true ONLY when founderName, ideaName, pitch, targetUser, targetContext, firstValue, acquisitionPath, and inputSource are all present and reasonable.',
    '- If all required fields are present, set nextQuestion to: "Ready. Let’s begin." and ready=true.',
  ].join('\\n');
}

}
