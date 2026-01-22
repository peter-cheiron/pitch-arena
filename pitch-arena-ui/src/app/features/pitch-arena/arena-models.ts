export type ArenaJudgeId = string; // config-driven (e.g. "tech", "innovation")

export type ArenaGlobalStyle = {
  toneDefault: JudgeTone;
  modes: Record<PanelMode, { label: string; goal: string }>;
  bannedPhrases: string[];
  bannedCliches: string[];
  conversationRules: {
    maxCommentWords: number;
    oneQuestionOnly: boolean;
    questionMaxSentences: number;
    deEscalateIfDefensive: boolean;
    avoidRepetitiveTemplates: boolean;
    avoidCategoricalLanguage: boolean;
  };
};

export type JudgeTone = 'supportive' | 'direct' | 'tough';

export type ArenaJudgeConfig = {
  id: ArenaJudgeId;
  label: string;
  dimension: string; // e.g. "Technical Execution (40%)"
  safety?: string[];
  tone?: JudgeTone;
  profileConfig?: string[];//technically only the 
  focus?: string[];
  rolePrompt?: string;

    // ✅ NEW (optional)
  criteriaConfig?: Array<{
    id: string;
    description: string;
    signals?: string[];
    weight?: number;
    questionStarters?: string[];
  }>;

  // ✅ NEW (optional): lets the judge feel stage-aware without “round game”
  stageHints?: Partial<Record<'clarify' | 'pressure' | 'decision', {
    goal: string;
    preferCriteriaIds?: string[];
    avoidCriteriaIds?: string[];
  }>>;
};

export type ArenaConstraints = {
  maxRounds: number;
  toneFloor: string;
  noInvestorTalk: boolean;
  timeboxPerJudgeSeconds: number;
  fastMode?: boolean;
  parseMode?: 'none' | 'fast' | 'full';
  summaryMode?: 'none' | 'template' | 'llm';
  llmTimeoutMs?: number;
};

export type ArenaObjective = {
  thesis: string;
  successDefinition: string[];
  constraints?: ArenaConstraints;
};

export type ArenaConfig = {
  id: string;
  name: string;
  goal?: string;
  description?: string;
  objective?: ArenaObjective;
  phases: RoundIntent[];
  //rubric?: ArenaRubric;
  safety?: string[];
  voices?: Record<string, string>;
  globalStyle?: ArenaGlobalStyle;
  judges: ArenaJudgeConfig[];
  
  // ✅ NEW optional
  lineup?: Partial<Record<'clarify' | 'pressure' | 'decision', string[]>>;

  // ✅ NEW optional
  stages?: Array<{ id: 'clarify' | 'pressure' | 'decision'; label: string }>;

};

//the idea is to have a notion of intentions and phases where we question on a topic for a bit
//these are examples but its adjustable
type IntentPhase =
  | 'clarify_core'
  | 'stress_weakest'
  | 'decision_ready';

export type RoundIntent = {
  phase: string;//the intent phase above
  goal: string; // human-readable
  primaryCriteria: string[];
  secondaryCriteria?: string[];
  aggressiveness: 'light' | 'medium' | 'hard';
};


export type PanelMode = 'discovery' | 'interrogation';

//export type Phase = 'intro' | 'judging' | 'answering' | 'results' | 'ended';

export type ArenaProfile = {
  founderName: string;
  ideaName: string;
  pitch: string;

  targetUser?: string;
  targetContext?: string;
  firstValue?: string;
  acquisitionPath?: string;
  inputSource?: string;
};

export type Verdict = 'pass' | 'maybe' | 'fail';

/*
export type EndSummary = {
  finalScore: number; // overall
  verdict: 'pass' | 'maybe' | 'fail';
  oneLiner: string; // crisp takeaway

  strengths: string[]; // 3–5 bullets
  biggestRisks: string[]; // 3–5 bullets
  assumptionsToTest: Array<{
    assumption: string;
    test: string; // how to test in 7 days
    successMetric: string; // measurable
  }>;

  next7Days: string[]; // 5–8 steps
  next30Days: string[]; // 5–8 steps

  recommendedMvp: {
    user: string;
    flow: string[]; // steps
    mustCut: string[]; // features to delete
  };

  pricingAndGtm: {
    whoPays: string;
    pricingIdea: string;
    firstChannel: string;
  };
};*/

/*
export type PitchParse = {
  version: string;
  ideaName: string;
  pitchText: string;
  entities: {
    buyer: boolean;
    price: boolean;
    metric: boolean;
    data: boolean;
    time: boolean;
    wedge: boolean;
  };
  claims: Array<{
    id: string;
    type:
      | 'value'
      | 'user'
      | 'market'
      | 'technical'
      | 'goToMarket'
      | 'pricing'
      | 'competition'
      | 'ops';
    text: string;
    quote?: string;
    specificityScore: number;
    confidence: number;
    tags?: string[];
  }>;
  assumptions: Array<{
    id: string;
    claimId: string;
    category: 'technical' | 'market' | 'product' | 'execution' | 'legal';
    statement: string;
    criticality: 'existential' | 'high' | 'medium' | 'low';
    testability: 'high' | 'medium' | 'low';
    confidence: number;
  }>;
  openQuestions?: Array<{
    id: string;
    priority: 'p0' | 'p1' | 'p2';
    question: string;
    linkedTo: string[];
  }>;
};*/
