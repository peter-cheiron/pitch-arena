type SelectedAttacks = Record<Exclude<JudgeId, 'host'>, string>; // attackId per judge

type VerifierResult = {
  ok: boolean;
  failures: Array<{
    judge: Exclude<JudgeId, 'host'>;
    reason: 'generic' | 'schema' | 'persona' | 'divergence';
  }>;
};

type PanelMode = 'discovery' | 'interrogation';

type AttackCategory =
  | 'mechanism_undefined'
  | 'metric_missing'
  | 'data_dependency'
  | 'scope_overreach'
  | 'distribution_missing'
  | 'buyer_unclear'
  | 'retention_undefined'
  | 'competition_substitution'
  | 'unit_economics_handwave'
  | 'time_to_mvp_unrealistic';

type AttackVector = {
  id: string;
  category: AttackCategory;
  critiqueTemplate: string;
  questionTemplate: string;
  forbiddenPhrases: string[];
  requiredSignals: Array<
    | 'falsifiable_claim'
    | 'numbers'
    | 'named_entity'
    | 'clear_next_step'
    | 'mechanism'
  >;
  triggers?: {
    minAvgSpecificity?: number;
    assumptionIncludes?: string[];
  };
};

type PitchParse = {
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

type JudgeId = 'host' | 'vc' | 'cto' | 'product';
type Phase = 'idle' | 'intro' | 'judging' | 'answering' | 'results' | 'ended';

type JudgeConfig = { id: JudgeId; label: string; dimension: string };

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


type HostJson = {
  phase: 'intro';
  ready: boolean;
  nextQuestion: string;
  // optional, partial updates
  profile?: Partial<ArenaProfile>;
  comment?: string; // short
};

type JudgeJson = {
  judge: Exclude<JudgeId, 'host'>;
  score: number;
  comment: string;
  question: string;
};

type JudgeRun = {
  judge: Exclude<JudgeId, 'host'>;
  judgeLabel: string;
  dimension: string;
  score: number;
  delta: number | null;
  comment: string;
  question: string;
  answer: string;
};

type ArenaMemory = {
  lastScore: number;
  lastQuestion: string;
  lastAnswer: string;
  lastAttackId: string;

  resolvedAttackIds: string[]; // ✅ NEW
};

type ChatMsg = {
  id: string;
  role: 'judge' | 'user' | 'system';
  judgeId?: JudgeId;
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