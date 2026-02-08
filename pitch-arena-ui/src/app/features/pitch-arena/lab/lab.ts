import { Component, effect, inject, signal } from '@angular/core';
import { ArenaConfig, ArenaJudgeConfig, HostProfile } from '../arena-models';
import { ArenaService } from '../services/arena-service';
import { JudgeTurnArgs, JudgeTurnResult, PanelJudgeService, PanelPrompt } from '../services/panel-judge.service';
import { GeminiService } from '#services/ai/gemini.service';
import { UiButtonPillComponent, UiInputComponent, UiTextAreaComponent } from '#ui';
import { pitch_pitch_arena } from '../services/utilities';
import { DbPitchService, Pitch } from '#services/db/db-pitch.service';
import { Pitches } from '../pitches/pitches';
import { UiToggleButtonComponent } from "src/app/ui/ui-toggle-button/ui-toggle-button.component";

@Component({
  selector: 'app-lab',
  imports: [UiInputComponent,
    //UiTextAreaComponent, 
    UiButtonPillComponent, UiToggleButtonComponent],
  templateUrl: './lab.html',
  standalone: true
})
export class Lab {
  arenaService = inject(ArenaService);
  panelJudgeService = inject(PanelJudgeService);
  geminiService = inject(GeminiService);

  pitchService = inject(DbPitchService)
  pitches = signal<Pitch[]>([])

  arenaPath = 'gemini-clean';
  pitchText = pitch_pitch_arena;
  selectedPitchIndex: number | null = null;

  arenaConfig: ArenaConfig | null = null;
  results: JudgeTurnResult[] = [];
  selectedTurn: JudgeTurnResult | null = null;
  panelPrompt: PanelPrompt | null = null;

  editableSystemPrompt = '';
  editableUserPrompt = '';
  promptResponse = '';
  promptError = '';
  promptLoading = false;

  loading = false;
  error = '';

  constructor(){
    effect(() => {
      this.pitchService.listDocs().then(docs => {
        this.pitches.set(docs)
      })
    })
  }

  async loadArena() {
    const path = this.arenaPath.trim() || 'gemini-clean';
    this.loading = true;
    this.error = '';
    this.results = [];

    try {
      const cfg = await this.arenaService.getArenaConfig(path);
      if (!cfg) {
        this.arenaConfig = null;
        this.error = `Arena not found: ${path}`;
        return;
      }
      this.arenaPath = path;
      this.arenaConfig = cfg;
    } finally {
      this.loading = false;
    }
  }

  run(pitch:Pitch){
    this.pitchText = pitch.content;
  }

  selectPitch(pitch: Pitch, index: number, selected: boolean) {
    if (!selected) {
      if (this.selectedPitchIndex === index) {
        this.selectedPitchIndex = null;
      }
      return;
    }

    this.selectedPitchIndex = index;
    this.pitchText = pitch.content;
  }

  async createPrompt() {
    const data = await this.buildPanelArgs();
    if (!data) return;

    const { cfg, judges, args } = data;

    this.selectedTurn = null;
    this.panelPrompt = this.panelJudgeService.getPanelPrompt(cfg, judges, args);
    this.editableSystemPrompt = this.panelPrompt.system ?? '';
    this.editableUserPrompt = this.panelPrompt.user ?? '';
    this.promptResponse = '';
    this.promptError = '';
    this.promptLoading = false;
  }

  async runJudges() {
    const data = await this.buildPanelArgs();
    if (!data) return;

    const { cfg, judges, args } = data;

    this.selectedTurn = null;
    this.panelPrompt = this.panelJudgeService.getPanelPrompt(cfg, judges, args);
    this.editableSystemPrompt = this.panelPrompt.system ?? '';
    this.editableUserPrompt = this.panelPrompt.user ?? '';
    this.promptResponse = '';
    this.promptError = '';

    const globalCriteriaIds = (cfg.criteria ?? [])
      .map((criteria) => criteria.id)
      .filter(Boolean);

    const runs: Array<{ judge: ArenaJudgeConfig; criteriaId?: string }> = [];

    for (const judge of judges) {
      const judgeCriteriaIds = (judge.criteriaConfig ?? [])
        .map((criteria) => criteria.id)
        .filter(Boolean);
      const criteriaIds = judgeCriteriaIds.length ? judgeCriteriaIds : globalCriteriaIds;
      const uniqueCriteriaIds = Array.from(new Set(criteriaIds));

      if (!uniqueCriteriaIds.length) {
        runs.push({ judge, criteriaId: undefined });
        continue;
      }

      for (const criteriaId of uniqueCriteriaIds) {
        runs.push({ judge, criteriaId });
      }
    }

    this.loading = true;
    try {
      const panelRuns = await Promise.all(
        runs.map(async ({ judge, criteriaId }) => {
          const intent = criteriaId
            ? { ...(args.intent ?? {}), primaryCriteria: [criteriaId] }
            : args.intent;
          const runArgs: JudgeTurnArgs = { ...args, intent };
          const res = await this.panelJudgeService.runPanelTurn(cfg, [judge], runArgs, null);
          const [turn] = this.orderResults(res.panel, [judge]);
          if (criteriaId && !turn.askedCriteriaId) {
            return { ...turn, askedCriteriaId: criteriaId };
          }
          return turn;
        })
      );

      this.results = panelRuns;
    } catch (err) {
      console.error(err);
      this.error = 'Failed to generate judge questions.';
    } finally {
      this.loading = false;
    }
  }

  clearResults() {
    this.results = [];
    this.selectedTurn = null;
    this.panelPrompt = null;
    this.editableSystemPrompt = '';
    this.editableUserPrompt = '';
    this.promptResponse = '';
    this.promptError = '';
    this.promptLoading = false;
    this.error = '';
  }

  selectQuestion(turn: JudgeTurnResult) {
    this.selectedTurn = turn;
  }

  getJudgeLabel(id: string): string {
    return this.arenaConfig?.judges?.find((judge) => judge.id === id)?.label ?? id;
  }

  private async buildPanelArgs(): Promise<{
    cfg: ArenaConfig;
    judges: ArenaJudgeConfig[];
    args: JudgeTurnArgs;
  } | null> {
    this.error = '';

    if (!this.arenaConfig) {
      await this.loadArena();
    }

    const cfg = this.arenaConfig;
    if (!cfg) return null;

    const pitch = this.pitchText.trim();
    if (!pitch) {
      this.error = 'Paste a pitch before running the judges.';
      return null;
    }

    const judges = this.pickJudges(cfg);
    if (!judges.length) {
      this.error = 'No judges configured for this arena.';
      return null;
    }

    const intent = this.pickIntent(cfg);
    const profile: HostProfile = {
      pitch,
      ideaName: cfg.name || 'Idea',
      founderName: 'Founder'
    };

    const args: JudgeTurnArgs = {
      profile,
      mode: 'discovery',
      round: 1,
      maxRounds: cfg.objective?.constraints?.maxRounds ?? 3,
      intent
    };

    return { cfg, judges, args };
  }

  private pickJudges(cfg: ArenaConfig): ArenaJudgeConfig[] {
    const judges = (cfg.judges ?? []).filter((judge) => judge.id !== 'host');
    return judges.length ? judges : (cfg.judges ?? []);
  }

  private pickIntent(cfg: ArenaConfig): JudgeTurnArgs['intent'] {
    const phase = cfg.phases?.[0];
    if (!phase) return undefined;
    return {
      phase: phase.phase as any,
      goal: phase.goal,
      primaryCriteria: phase.primaryCriteria,
      aggressiveness: phase.aggressiveness
    };
  }

  private orderResults(
    panel: JudgeTurnResult[],
    judges: ArenaJudgeConfig[]
  ): JudgeTurnResult[] {
    return judges.map((judge) => {
      return (
        panel.find((turn) => turn.judge === judge.id) ??
        panel.find((turn) => (turn as any).judgeId === judge.id) ?? {
          judge: judge.id,
          score: 6,
          comment: 'Quick fallback: need one sharper detail.',
          question: 'What is one real example of someone using this this week?',
          coverage: [],
          askedCriteriaId: undefined,
          verdictHint: 'maybe'
        }
      );
    });
  }

  async executePrompt() {
    this.promptError = '';
    this.promptResponse = '';

    const system = (this.editableSystemPrompt ?? '').trim();
    const user = (this.editableUserPrompt ?? '').trim();

    if (!system && !user) {
      this.promptError = 'Add a system or user prompt before running.';
      return;
    }

    this.promptLoading = true;
    try {
      const res = await this.geminiService.textPrompt(user, system, { purpose: 'dev' });
      this.promptResponse = typeof res === 'string' ? res : JSON.stringify(res, null, 2);
    } catch (err) {
      console.error(err);
      this.promptError = 'Failed to run prompt.';
    } finally {
      this.promptLoading = false;
    }
  }

  copyPrompt(){
    if (!this.panelPrompt) return;
    const text = [
      'Prompt (system)',
      this.panelPrompt.system ?? '',
      '',
      'Prompt (user)',
      this.panelPrompt.user ?? ''
    ].join('\n');
    navigator.clipboard.writeText(text);
  }
}
