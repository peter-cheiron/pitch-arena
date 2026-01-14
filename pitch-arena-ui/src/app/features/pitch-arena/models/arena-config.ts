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

export type AttackLibrary = {
  string: string;
  mode: PanelMode;            // discovery or interrogation
  vectors: AttackVector[];
};

export type CriteriaWeight = {
  id: string;
  label: string;
  weightPct: number;
}

export type ArenaRubric = {
  overallFormula: 'weightedAverage';
  scale?: {
    min: number;
    max: number;
    decimals: string;
  }
  criteriaWeights?: CriteriaWeight[]
  source?: {
    name?: string;
    url?:string;
  }
  dimensions: Array<{
    key: string;                 // "fundability"
    label: string;               // "Fundability"
    weight: number;              // 0..1
    guidance: string;            // used inside prompts to avoid repetition
  }>;
};

export type JudgeTone = 'supportive' | 'direct' | 'tough';


export type RequiredSignal =
  | 'named_entity'
  | 'numbers'
  | 'mechanism'
  | 'example'
  | 'next_step';



export type AttackCategory =
  | 'buyer'
  | 'substitute'
  | 'mechanism'
  | 'scope'
  | 'quality'
  | 'repeat';

export type AttackVector = {
  id: string;
  category: AttackCategory;

  // “Concern” is what the judge is worried about (kept short and human)
  concern: string;

 // ✅ NEW: “question form” to avoid repetition (why/how/contrast/quantify/etc.)
  qType?: string;

  // “Ask intent” describes the information needed (not a literal question)
  askIntent: string;

  // Examples show the model what “conversational” looks like.
  // The model must rephrase (not copy verbatim).
  questionExamples: string[];

  forbiddenPhrases: string[];
  requiredSignals: RequiredSignal[];
  triggers?: { minAvgSpecificity?: number; assumptionIncludes?: string[] };
};


export type ArenaJudgeConfig = {
  id: ArenaJudgeId;
  label: string;
  dimension: string; // e.g. "Technical Execution (40%)"
  tone?: JudgeTone;
  focus?: string[];
  rolePrompt?: string;
  vectors?: {
    discovery?: AttackVector[];
    interrogation?: AttackVector[];
  };
};

export type ArenaObjective = {
  thesis:string;
  successDefinition: string[];
  constraints?: {
      maxRounds: number;
      toneFloor: string;
      noInvestorTalk: boolean;
      timeboxPerJudgeSeconds: number;
  }
}

export type ArenaConfig = {
  id: string;
  name: string;
  description?: string;
  objective?: ArenaObjective;
  rubric?: ArenaRubric;
  voices?: Record<string, string>;
  globalStyle?: ArenaGlobalStyle;
  judges: ArenaJudgeConfig[];
};

export type PanelMode = 'discovery' | 'interrogation';

export type Phase = 'intro' | 'judging' | 'answering' | 'results' | 'ended';

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

export type ChatMsg = {
  id: string;
  role: 'judge' | 'user' | 'system';
  judgeId?: string;
  title?: string;
  text: string;

  // voice
  voiceId?: string;
  audioUrl?: string;
  audioState?: 'idle' | 'loading' | 'ready' | 'error';
};

export type JudgeRun = {
  judge: Exclude<string, 'host'>;
  judgeLabel: string;
  dimension: string;
  score: number;
  delta: number | null;
  comment: string;
  question: string;
  answer: string;
};

export type SelectedAttacks = Record<Exclude<string, 'host'>, string>;

export type Claim = {
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
  specificityScore: number; // 0..1
  confidence: number; // 0..1
  tags: string[];
};

export type Assumption = {
  id: string;
  claimId: string;
  category: 'technical' | 'market' | 'product' | 'execution' | 'legal';
  statement: string;
  criticality: 'existential' | 'high' | 'medium' | 'low';
  testability: 'high' | 'medium' | 'low';
  confidence: number; // 0..1
};

export type OpenQuestion = {
  id: string;
  priority: 'p0' | 'p1' | 'p2';
  question: string;
  linkedTo: string[];
};

export type HostJson = {
  phase: 'intro';
  ready: boolean;
  nextQuestion: string;
  profile?: Partial<ArenaProfile>;
  comment?: string;
};

export type JudgeJson = {
  judge: Exclude<string, 'host'>;
  score: number;
  comment: string;
  question: string;
};

export type ArenaMemory = {
  lastScore: number;
  lastQuestion: string;
  lastAnswer: string;
  lastAttackId: string;
  resolvedAttackIds: string[];
  // ✅ NEW
  askedAttackIds?: string[];
};

export type Verdict = 'pass' | 'maybe' | 'fail';

export type EndSummary = {
  finalScore: number;              // overall
  verdict: 'pass' | 'maybe' | 'fail';
  oneLiner: string;                // crisp takeaway

  strengths: string[];             // 3–5 bullets
  biggestRisks: string[];          // 3–5 bullets
  assumptionsToTest: Array<{
    assumption: string;
    test: string;                 // how to test in 7 days
    successMetric: string;         // measurable
  }>;

  next7Days: string[];             // 5–8 steps
  next30Days: string[];            // 5–8 steps

  recommendedMvp: {
    user: string;
    flow: string[];                // steps
    mustCut: string[];             // features to delete
  };

  pricingAndGtm: {
    whoPays: string;
    pricingIdea: string;
    firstChannel: string;
  };
};


export type PitchParse = {
  version: string;
  ideaName: string;
  pitchText: string;
  entities: { buyer: boolean, 
    price: boolean, 
    metric: boolean, 
    data: boolean, 
    time: boolean, 
    wedge: boolean 
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
};