export type ArenaJudgeId = string; // config-driven (e.g. "tech", "innovation")

//TODO check 

export type HostProfile = {
  founderName?: string;
  ideaName?: string;
  pitch?: string;
  targetUser?: string;
  targetContext?: string;
  firstValue?: string;
  acquisitionPath?: string;
  inputSource?: string;
};


//eof
export type ArenaGlobalStyle = {
  toneDefault: JudgeTone;
  //modes: Record<PanelMode, { label: string; goal: string }>;
  bannedPhrases: string[];
  //bannedCliches: string[];
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
  image?: string;
  label: string;
  dimension: string; // e.g. "Technical Execution (40%)"
  safety?: string[];
  tone?: JudgeTone | string;
  profileConfig?: string[];//technically only the 
  focus?: string[];
  rolePrompt?: string;
  persona?: {
    archetype?: string;
    petPeeves?: string[];
    defaultStance?: string;
    speakingStyle?: {
      voice?: string;
      bannedPhrases?: string[];
    };
  };

    // ✅ NEW (optional)
  criteriaConfig?: Array<{
    id: string;
    //description: string;
    //signals?: string[];
    weight?: number;
   // questionStarters?: string[];
  }>;

};

export type ArenaConstraints = {
  hostEnabled: boolean;
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

export type ArenaCriterion = {
  id: string;
  label?: string;
  description: string;
  signals?: string[];
  questionStarters?: string[];
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
  criteria?: ArenaCriterion[];
};

export type RoundIntent = {
  id?: string;
  phase: string;//the intent phase above
  goal: string; // human-readable
  primaryCriteria: string[];
  secondaryCriteria?: string[];
  aggressiveness: 'light' | 'medium' | 'hard';
};


//export type PanelMode = 'discovery' | 'interrogation';

export type Verdict = 'pass' | 'maybe' | 'fail';
