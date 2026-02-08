import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { JsonPipe } from '@angular/common';
import { ArenaConfig, ArenaConstraints, ArenaCriterion, ArenaGlobalStyle, ArenaJudgeConfig, ArenaObjective, RoundIntent } from '../arena-models';
import { ArenaService } from '../services/arena-service';
import { UiTabComponent } from 'src/app/ui/ui-tab/ui-tab.component';
import { UiButtonPillComponent, UiInputComponent, UiTextAreaComponent } from '#ui';
import { UIChips } from 'src/app/ui/ui-chips/ui-chips.component';
import { UiToggleButtonComponent } from 'src/app/ui/ui-toggle-button/ui-toggle-button.component';
import { downloadJson } from '../arena/ui/ui-utils';

type ArenaDesignerConstraints = Pick<ArenaConstraints, 'hostEnabled' | 'maxRounds'>;

type ArenaDesignerObjective = Pick<ArenaObjective, 'thesis' | 'successDefinition' | 'constraints'> & {
  constraints: ArenaDesignerConstraints;
};

type ArenaDesignerGlobalStyle = Pick<ArenaGlobalStyle, 'bannedPhrases' | 'conversationRules'> & {
  conversationRules: Pick<ArenaGlobalStyle['conversationRules'], 'maxCommentWords' | 'questionMaxSentences'>;
};

type ArenaDesignerPhase = RoundIntent & { id?: string };

type ArenaDesignerCriterion = Pick<ArenaCriterion, 'id' | 'label' | 'description' | 'signals'>;

type ArenaJudgePersona = {
  archetype?: string;
  petPeeves?: string[];
  defaultStance?: string;
  speakingStyle?: {
    voice?: string;
    bannedPhrases?: string[];
  };
};

type ArenaDesignerJudgeCriteria = {
  id: string;
  weight?: number;
};

type ArenaDesignerJudge = Omit<ArenaJudgeConfig, 'dimension' | 'criteriaConfig' | 'focus' | 'safety' | 'rolePrompt'> & {
  role?: string;
  persona?: ArenaJudgePersona;
  criteria?: ArenaDesignerJudgeCriteria[];
};

type ArenaDesignerConfig = Omit<ArenaConfig, 'objective' | 'globalStyle' | 'judges' | 'phases' | 'criteria'> & {
  objective: ArenaDesignerObjective;
  globalStyle: ArenaDesignerGlobalStyle;
  phases: ArenaDesignerPhase[];
  judges: ArenaDesignerJudge[];
  criteria: ArenaDesignerCriterion[];
};

@Component({
  selector: 'app-arena-designer',
  imports: [
    UiTabComponent,
    UiInputComponent,
    UiTextAreaComponent,
    UIChips,
    UiToggleButtonComponent,
    UiButtonPillComponent,
    JsonPipe
  ],
  templateUrl: './arena-designer.html',
  standalone: true
})
export class ArenaDesigner {
  route = inject(ActivatedRoute);
  arenaService = inject(ArenaService);

  arenaConfig = signal<ArenaDesignerConfig | null>(null);
  loading = signal(false);

  arenaPath = 'gemini-clean';

  tabs = [
    { key: 'details', label: 'Details' },
    { key: 'phases', label: 'Phases' },
    { key: 'global', label: 'Global Style' },
    { key: 'criteria', label: 'Criteria' },
    { key: 'judges', label: 'Judges' },
    { key: 'test', label: 'Test' },
  ];

  tab = 'details';

  ngOnInit() {
    const path = this.route.snapshot.queryParamMap.get('path');
    if (path) {
      this.arenaPath = path;
    }
    this.loadArena(this.arenaPath);
  }

  async loadArena(path: string) {
    this.loading.set(true);
    const cfg = await this.arenaService.getArenaConfig(path);
    if (cfg) {
      this.arenaConfig.set(this.normalizeConfig(cfg));
    } else {
      this.arenaConfig.set(this.normalizeConfig({ id: `arena_${path}`, name: 'New Arena' } as ArenaConfig));
    }
    this.loading.set(false);
  }

  reloadArena() {
    const path = this.arenaPath.trim() || 'gemini-clean';
    this.loadArena(path);
  }

  downloadConfig() {
    const cfg = this.arenaConfig();
    if (!cfg) return;
    downloadJson(cfg, `${cfg.id || 'arena-config'}.json`);
  }

  addJudge() {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const judges = [...cfg.judges, this.newJudge()];
      return { ...cfg, judges };
    });
  }

  removeJudge(index: number) {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const judges = cfg.judges.filter((_, i) => i !== index);
      return { ...cfg, judges };
    });
  }

  addCriteria(judgeIndex: number) {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const judges = [...cfg.judges];
      const judge = { ...judges[judgeIndex] };
      const criteria = [...(judge.criteria ?? []), this.newJudgeCriteria()];
      judge.criteria = criteria;
      judges[judgeIndex] = judge;
      return { ...cfg, judges };
    });
  }

  removeCriteria(judgeIndex: number, criteriaIndex: number) {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const judges = [...cfg.judges];
      const judge = { ...judges[judgeIndex] };
      judge.criteria = (judge.criteria ?? []).filter((_, i) => i !== criteriaIndex);
      judges[judgeIndex] = judge;
      return { ...cfg, judges };
    });
  }

  addCriterion() {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const criteria = [...cfg.criteria, this.newCriterion()];
      return { ...cfg, criteria };
    });
  }

  removeCriterion(index: number) {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const criteria = cfg.criteria.filter((_, i) => i !== index);
      return { ...cfg, criteria };
    });
  }

  addPhase() {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const phases = [...cfg.phases, this.newPhase()];
      return { ...cfg, phases };
    });
  }

  removePhase(index: number) {
    this.arenaConfig.update((cfg) => {
      if (!cfg) return cfg;
      const phases = cfg.phases.filter((_, i) => i !== index);
      return { ...cfg, phases };
    });
  }

  private normalizeConfig(raw: ArenaConfig): ArenaDesignerConfig {
    const cfg = raw as ArenaDesignerConfig;
    cfg.goal ??= '';
    cfg.description ??= '';
    cfg.safety = Array.isArray(cfg.safety) ? cfg.safety : [];
    cfg.criteria = (Array.isArray(cfg.criteria) ? cfg.criteria : []).map((criteria) => ({
      id: criteria.id ?? '',
      label: criteria.label ?? '',
      description: criteria.description ?? '',
      signals: Array.isArray(criteria.signals) ? criteria.signals : [],
    }));
    cfg.phases = (Array.isArray(cfg.phases) ? cfg.phases : []).map((phase) => {
      const next = { ...(phase as ArenaDesignerPhase) };
      const id = (next as any).id ?? next.phase ?? '';
      next.id = id || '';
      next.phase = next.phase ?? next.id ?? '';
      next.goal = next.goal ?? '';
      next.primaryCriteria = Array.isArray(next.primaryCriteria) ? next.primaryCriteria : [];
      next.secondaryCriteria = Array.isArray(next.secondaryCriteria) ? next.secondaryCriteria : [];
      next.aggressiveness = next.aggressiveness ?? 'medium';
      return next;
    });
    cfg.judges = (Array.isArray(cfg.judges) ? cfg.judges : []).map((judge) => this.ensureJudge(judge as ArenaDesignerJudge));
    cfg.objective = this.ensureObjective(cfg.objective as ArenaDesignerObjective | undefined);
    cfg.globalStyle = this.ensureGlobalStyle(cfg.globalStyle as ArenaDesignerGlobalStyle | undefined);
    return cfg;
  }

  private ensureObjective(objective?: ArenaDesignerObjective): ArenaDesignerObjective {
    const next = objective ?? ({ thesis: '', successDefinition: [], constraints: { hostEnabled: true, maxRounds: 2 } } as ArenaDesignerObjective);
    next.thesis ??= '';
    next.successDefinition = Array.isArray(next.successDefinition) ? next.successDefinition : [];
    next.constraints = this.ensureConstraints(next.constraints);
    return next;
  }

  private ensureConstraints(constraints?: ArenaDesignerConstraints): ArenaConstraints & ArenaDesignerConstraints {
    return {
      hostEnabled: constraints?.hostEnabled ?? true,
      maxRounds: constraints?.maxRounds ?? 2,
      toneFloor: (constraints as any)?.toneFloor ?? 0,
      noInvestorTalk: (constraints as any)?.noInvestorTalk ?? false,
      timeboxPerJudgeSeconds: (constraints as any)?.timeboxPerJudgeSeconds ?? 0,
    };
  }

  private ensureGlobalStyle(style?: ArenaDesignerGlobalStyle): ArenaDesignerGlobalStyle {
    const next = style ?? {
      bannedPhrases: [],
      conversationRules: {
        maxCommentWords: 45,
        questionMaxSentences: 1,
        oneQuestionOnly: false,
        deEscalateIfDefensive: false,
        avoidRepetitiveTemplates: false,
        avoidCategoricalLanguage: false,
      },
    };
    next.bannedPhrases = Array.isArray(next.bannedPhrases) ? next.bannedPhrases : [];
    next.conversationRules = next.conversationRules ?? {
      maxCommentWords: 45,
      questionMaxSentences: 1,
      oneQuestionOnly: false,
      deEscalateIfDefensive: false,
      avoidRepetitiveTemplates: false,
      avoidCategoricalLanguage: false,
    };
    next.conversationRules.maxCommentWords = next.conversationRules.maxCommentWords ?? 45;
    next.conversationRules.questionMaxSentences = next.conversationRules.questionMaxSentences ?? 1;
    next.conversationRules.oneQuestionOnly = next.conversationRules.oneQuestionOnly ?? false;
    next.conversationRules.deEscalateIfDefensive = next.conversationRules.deEscalateIfDefensive ?? false;
    next.conversationRules.avoidRepetitiveTemplates = next.conversationRules.avoidRepetitiveTemplates ?? false;
    next.conversationRules.avoidCategoricalLanguage = next.conversationRules.avoidCategoricalLanguage ?? false;
    return next;
  }

  private ensureJudge(judge?: ArenaDesignerJudge): ArenaDesignerJudge {
    const next = { ...(judge ?? {}) } as ArenaDesignerJudge;
    next.role ??= '';
    next.profileConfig = Array.isArray(next.profileConfig) ? next.profileConfig : [];
    next.criteria = Array.isArray(next.criteria)
      ? next.criteria.map((criteria) => ({
          id: String(criteria.id ?? ''),
          weight: criteria.weight ?? undefined,
        }))
      : [];

    if (!next.criteria.length) {
      const legacyCriteria = (next as any).criteriaConfig;
      if (Array.isArray(legacyCriteria)) {
        next.criteria = legacyCriteria.map((criteria: any) => ({
          id: String(criteria.id ?? ''),
          weight: criteria.weight ?? undefined,
        }));
      }
    }

    const persona = (next.persona ?? {}) as ArenaJudgePersona;
    persona.archetype ??= '';
    persona.defaultStance ??= '';
    persona.petPeeves = Array.isArray(persona.petPeeves) ? persona.petPeeves : [];
    const speakingStyle = persona.speakingStyle ?? {};
    speakingStyle.voice ??= '';
    speakingStyle.bannedPhrases = Array.isArray(speakingStyle.bannedPhrases) ? speakingStyle.bannedPhrases : [];
    persona.speakingStyle = speakingStyle;
    next.persona = persona;

    return next;
  }

  private newJudge(): ArenaDesignerJudge {
    return {
      id: `judge_${Date.now()}`,
      label: 'New Judge',
      role: 'judge',
      tone: 'direct',
      profileConfig: [],
      criteria: [],
      persona: {
        archetype: '',
        defaultStance: '',
        petPeeves: [],
        speakingStyle: {
          voice: '',
          bannedPhrases: [],
        },
      },
    };
  }

  private newCriterion(): ArenaDesignerCriterion {
    return {
      id: '',
      label: '',
      description: '',
      signals: [],
    };
  }

  private newJudgeCriteria(): ArenaDesignerJudgeCriteria {
    return {
      id: '',
      weight: 1,
    };
  }

  private newPhase(): RoundIntent {
    return {
      id: '',
      phase: '',
      goal: '',
      primaryCriteria: [],
      secondaryCriteria: [],
      aggressiveness: 'medium',
    };
  }
}
