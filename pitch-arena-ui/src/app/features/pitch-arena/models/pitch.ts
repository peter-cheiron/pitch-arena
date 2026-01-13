//type SelectedAttacks = Record<Exclude<string, 'host'>, string>; // attackId per judge

/*
type VerifierResult = {
  ok: boolean;
  failures: Array<{
    judge: Exclude<string, 'host'>;
    reason: 'generic' | 'schema' | 'persona' | 'divergence';
  }>;
};*/

export type PanelMode = 'discovery' | 'interrogation';

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

  // “Ask intent” describes the information needed (not a literal question)
  askIntent: string;

  // Examples show the model what “conversational” looks like.
  // The model must rephrase (not copy verbatim).
  questionExamples: string[];

  forbiddenPhrases: string[];
  requiredSignals: RequiredSignal[];
  triggers?: { minAvgSpecificity?: number; assumptionIncludes?: string[] };
};

export type PitchParse = {
  version: '1.0';
  ideaName: string;
  pitchText: string;
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

//export type string = 'host' | 'vc' | 'tech' | 'product' | 'impact'  | 'operations' | 'finance' | 'innovation';

//type Phase = 'idle' | 'intro' | 'judging' | 'answering' | 'results' | 'ended'
//type JudgeConfig = { id: string; label: string; dimension: string };

type ArenaProfile = {
  founderName: string;
  ideaName: string;
  pitch: string;

  timePerWeek?: string;
  runwayMonths?: string;
  experience?: string;

  targetUser?: string;
  targetContext?: string;
  firstValue?: string;
  acquisitionPath?: string;
  inputSource?: string;
  currentStage?: string;

  budgetOwner?: string;
  pricingGuess?: string;
};

type ChatMsg = {
  id: string;
  role: 'judge' | 'user' | 'system';
  string?: string;
  title?: string;
  text: string;

  // voice
  voiceId?: string; // which voice to use
  audioUrl?: string | null; // storage mp3 url
  audioState?: 'idle' | 'loading' | 'ready' | 'error';
};

type EndSummary = {
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

export type ArenaDefinition = {
  id: string;                 // "incubator-proptech-2026"
  label: string;              // "PropTech Incubator Arena"
  description?: string;

  theme: {
    tags: string[];           // ["proptech", "climate", "women-in-tech"]
    thesis?: string;          // "We back founders improving housing access..."
    doNotFund?: string[];     // optional exclusions
  };

  tone: {
    base: ArenaTone;          // default tone
    bannedPhrases?: string[]; // global banned phrases (helps your “annoying repetition”)
    questionStyle?: 'conversational' | 'direct';
  };

  flow: {
    maxRounds: number;        // 3
    warmup: WarmupConfig;
    scoring: {
      scaleMin: number;       // 0
      scaleMax: number;       // 10
      labelLow?: string;      // "Not ready"
      labelHigh?: string;     // "Strong candidate"
    };
  };

  judges: JudgeDefinition[];   // host + panel judges
  attackLibraries: AttackLibrary[]; // optional, per judge and mode
  rubric: ArenaRubric;         // how to score overall + what matters
};

export type ArenaTone = 'supportive' | 'neutral' | 'tough';

export type WarmupConfig = {
  requiredFields: Array<keyof ArenaProfile>;
  maxQuestions: number;          // prevents endless warmup
  hostPromptId: string;          // points to prompt template (or inline prompt)
};

export type JudgeConfig = { id: string; label: string; dimension: string };


export type JudgeDefinition = {
  id: string;                // "vc-proptech", "cto", "impact-judge"
  label: string;              // "PropTech Partner"
  role: 'host' | 'panel';
  dimension?: string;         // "Fundability" / "Impact" / "Execution"
  voiceId?: string;

  persona: {
    tagline?: string;
    values?: string[];        // what they care about
    blindSpots?: string[];    // optional realism
    toneOverride?: ArenaTone; // per judge
  };

  prompt: {
    system: string;           // the judge system prompt template (can be short)
    constraints?: {
      maxCommentWords?: number;
      forbid?: string[];      // judge-specific forbidden phrases
    };
  };

  scoringWeight?: number;     // default 1
};

export type AttackLibrary = {
  string: string;
  mode: PanelMode;            // discovery or interrogation
  vectors: AttackVector[];
};

export type ArenaRubric = {
  overallFormula: 'weightedAverage';
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


