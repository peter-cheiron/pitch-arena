import { AttackVector, JudgeTone, PanelMode } from './pitch';

export type ArenaJudgeId = string; // config-driven (e.g. "tech", "innovation")

export type ArenaRubric = {
  scale: { min: number; max: number; decimals: number };
  criteriaWeights: Array<{ id: string; label: string; weightPct: number }>;
  source?: { name: string; url: string };
};

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
