import { Component, NgZone, inject, signal, computed, TemplateRef, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Dialog } from '@angular/cdk/dialog';
import { ChatUIMessage, ChatUiComponent } from './ui/chat-ui';
import { ChatUiHorizontalComponent } from './ui/chat-ui-horizontal';
import { buildInteractions, downloadJson } from './ui/ui-utils';
import { ArenaConfig, ArenaJudgeConfig } from '../arena-models';
import { HostService } from '../services/host.service';
import {
  ArenaMemory,
  ArenaService,
  newArenaMemory,
  updateArenaMemory,
} from '../services/arena-service';

import { GeminiService } from '#services/ai/gemini.service';
import {
  avg,
  buildEndSummary,
  coerceJson,
  createAIMessage,
  createMessage,
  detectMicroTurn,
  EndSummary,
  getPitchArenaPitch,
  normalizeVerdict,
} from './helpers';
import { UiToggleButtonComponent } from 'src/app/ui/ui-toggle-button/ui-toggle-button.component';
import { JudgeCard } from './ui/judge-card/judge-card';
import {
  JudgeTurnArgs,
  JudgeTurnResult,
} from '../services/panel-judge.service';
import { UiButtonPillComponent } from '#ui';
import { SimpleDialogComponent } from 'src/app/ui/simple-dialog/simple-dialog.component';
import { PanelJudgeService } from '../services/panel-judge.service';
import { CoachService } from '../services/coach.service';
import { Report } from '../report/report';

//we need to pad the room out a bit
type Phase = 'asking' | 'awaitingAnswer' | 'hostFiller' | 'ended' | 'awaitingPitch';

export type JudgeRun = {
  judgeId: string;
  judgeLabel?: string;
  round: number;
  score: number;
  comment: string;
  question: string;
  answer: string;
  askedCriteriaId?: string;
  coverage?: any;
};

type StageId = 'clarify' | 'pressure' | 'decision';

type RoundIntent = {
  phaseId: string;
  goal: string;
  primaryCriteria: string[];
  judgeIds: string[]; // who speaks this round (ordered)
};

@Component({
  selector: 'chat-page',
  imports: [
    //ts-ignore its used dippo
    ChatUiHorizontalComponent,
    JudgeCard,
    UiToggleButtonComponent,
    UiButtonPillComponent,
    ChatUiComponent
],
  templateUrl: './arena-page.html',
})
export class ArenaPage {
  // services
  gemini = inject(GeminiService);
  hostService = inject(HostService);
  arenaService = inject(ArenaService);
  dialog = inject(Dialog);

  //lets see if its at least faster with a mutli panel round
  panelJudgeService = inject(PanelJudgeService);
  coachService = inject(CoachService);
  // buffer: the results for the current round, computed once
  roundJudges = signal<ArenaJudgeConfig[]>([]);
  roundTurns = signal<JudgeTurnResult[]>([]);

  // angular
  route = inject(ActivatedRoute);
  router = inject(Router);
  zone = inject(NgZone);

  // config + setup
  arenaConfig = signal<ArenaConfig | null>(null);
  arenaLoaded = signal<boolean>(false);

  host: ArenaJudgeConfig | null = null;
  judgeOrder: ArenaJudgeConfig[] = []; // all judges excluding host

  // how many judges participate per round
  // 0 => all judges
  judgesPerRound = signal<number>(0);

  // rounds
  maxRounds = signal<number>(3);
  round = signal<number>(1);

  // flow state
  HOST_DONE = false;
  phase = signal<Phase>('asking');

  // host state
  profile: any = null;
  lastQuestion: string | null = null;

  // judge state
  currentTurn = signal<JudgeTurnResult | null>(null);
  currentJudgeIndexInRound = signal<number>(0);

  // --- panel compute orchestration (parallel with filler)
  private panelPromise: Promise<void> | null = null;

  // host filler orchestration
  private fillerActiveRound: number | null = null; // ensures we only ask once per round

  //new global arena style
  arenaMemory = signal<ArenaMemory>(newArenaMemory());

  private scoreFromTurn = (turn: Pick<JudgeTurnResult, 'score' | 'coverage'>): number => {
    const raw = Number(turn?.score ?? 0);
    if (Number.isFinite(raw) && raw > 0) return raw;
    const coverage = Array.isArray(turn?.coverage) ? turn.coverage : [];
    if (!coverage.length) return 0;
    const total = coverage.reduce((sum, c) => {
      const status = String((c as any)?.status ?? '').toLowerCase();
      if (status.includes('clear')) return sum + 9;
      if (status.includes('partial')) return sum + 6;
      return sum + 3;
    }, 0);
    return Math.round((total / coverage.length) * 10) / 10;
  };

  // history
  judgeRuns = signal<JudgeRun[]>([]);
  endSummary = signal<EndSummary | null>(null);
  coachReport = signal<any | null>(null);
  summarizing = signal(false);

  // log
  eventLog = signal<
    Array<{
      ts: number;
      type: string;
      payload: unknown;
    }>
  >([]);

  // UI messages
  messages = signal<ChatUIMessage[]>([]);

  @ViewChild('conversationOptions') conversationOptionsTemplate?: TemplateRef<unknown>;

  //some config
  liveScoring = false;
  seeThinking = true;
  judgesOnSide = false;

  // derived
  roundLabel = computed(() => `Round ${this.round()} / ${this.maxRounds()}`);
  activeJudgeId = computed(() => this.getActiveJudgeForThisTurn()?.id ?? null);

  isJudgeSpeaking(judgeId: string): boolean {
    //console.log(judgeId, this.activeJudgeId(), this.phase(), this.HOST_DONE)
    return !this.HOST_DONE ? false : this.phase() !== 'ended' && this.activeJudgeId() === judgeId;
  }

  //micro chat
  

  openConversationOptions() {
    if (!this.conversationOptionsTemplate) return;

    this.dialog.open(SimpleDialogComponent, {
      data: {
        title: 'Conversation Options',
        template: this.conversationOptionsTemplate,
      },
    });
  }

  quitArena() {
    //TODO use an actual dialog not an alert
    const confirmed = window.confirm('Leave the arena? Your session will end.');
    if (!confirmed) return;
    this.router.navigateByUrl('/arenas');
  }

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path') ?? 'gemini';

    // demo=1 starts with a static pitch + first judge question immediately (no host)
    const demo = this.route.snapshot.queryParamMap.get('demo') === '1';

    // judgesPerRound=0 means all judges; otherwise N judges per round
    /*
    const jprRaw = this.route.snapshot.queryParamMap.get('judgesPerRound');
    const jpr = jprRaw ? Number(jprRaw) : 0;
    this.judgesPerRound.set(Number.isFinite(jpr) && jpr >= 0 ? jpr : 0);
    */

    var preparse = false
    const from = this.route.snapshot.queryParamMap.get('from');
    if (from === 'preparse') {
      preparse = true;
    }

    this.loadArena(path, demo, preparse);
  }

  private async loadArena(path: string, demo: boolean, preparse: boolean) {
    try {
      this.logEvent('arena.load.start', { path, demo });

      const cfg = await this.arenaService.getArenaConfig(path);
      this.arenaConfig.set(cfg);
      this.logEvent('arena.load.config', { cfg });

      this.addMessage('system', 'system', 'Goal:' + cfg.goal);

      // rounds
      const maxRoundsFromCfg = cfg.objective?.constraints?.maxRounds;
      if (
        typeof maxRoundsFromCfg === 'number' &&
        Number.isFinite(maxRoundsFromCfg) &&
        maxRoundsFromCfg > 0
      ) {
        this.maxRounds.set(maxRoundsFromCfg);
        if (this.round() > maxRoundsFromCfg) this.round.set(maxRoundsFromCfg);
      }

      // ✅ host enabled flag
      const hostEnabled = cfg.objective?.constraints?.hostEnabled !== false;

      // host (optional)
      this.host = hostEnabled
        ? (cfg.judges.find((j) => j.id === 'host') ?? null)
        : null;
      this.logEvent('arena.load.host', { host: this.host, hostEnabled });

      // judges (excluding host)
      this.judgeOrder = (cfg.judges ?? []).filter((j) => j.id !== 'host');
      this.logEvent('arena.load.judges', {
        judgeIds: this.judgeOrder.map((j) => j.id),
      });

      if (!this.judgeOrder.length) {
        this.addMessage(
          'system',
          'system',
          'No judges found in this arena config (excluding host).',
        );
      }

      // init state
      this.judgeRuns.set([]);
      this.endSummary.set(null);
      this.phase.set('asking');
      this.currentTurn.set(null);
      this.currentJudgeIndexInRound.set(0);
      this.round.set(1);

      // ✅ demo path unchanged
      if (demo) {
        this.profile = getPitchArenaPitch();
        this.HOST_DONE = true;
        this.arenaLoaded.set(true);
        await this.startJudgeTurn();
        return;
      }

      //TODO not sure about this one ...
      if (!hostEnabled || !this.host?.profileConfig?.length) {
        this.profile = {}; // or schema init if you want
        this.HOST_DONE = true;
        this.arenaLoaded.set(true);

        // ✅ founder speaks first
        this.phase.set('awaitingPitch');
        this.addMessage('system', 'system', 'Lift doors closing. Give a 1–2 sentence pitch.');
        return;
      }

      if(preparse){
        const raw = localStorage.getItem('arena:pending');
        if (raw) {
          try {
            const payload = JSON.parse(raw);
            this.profile = payload.profile ?? {};
            this.logEvent('arena.profile.init', { profile: this.profile });
            // optional: clear after use
            //TODO don't forget to remove it
            //localStorage.removeItem('arena:pending');

            const hostWelcome =
              'thanks we took a look at your deck';
            this.lastQuestion = hostWelcome;
            this.addMessage('system', 'system', hostWelcome);
            this.logEvent('message.system', { text: hostWelcome });

            this.runChatAsHost("");

          } catch {}
        }
      }else{
        // host-driven flow (normal arenas)
        this.profile = this.hostService.getNewProfile(this.host.profileConfig);
        this.logEvent('arena.profile.init', { profile: this.profile });

        const hostWelcome =
          'Welcome so who are you, and what are you trying to build?';
        this.lastQuestion = hostWelcome;
        this.addMessage('ai', 'host', hostWelcome);
        this.logEvent('message.ai', { text: hostWelcome });
      }

      this.arenaLoaded.set(true);
    } finally {
    }
  }

  /**
   * 
   * @param type 
   * @param text 
   */
  addMessage(type, title, text) {
    this.messages.update((messages) => [
      ...messages,
      createAIMessage(type, title, text)
    ]);
  }

  updateMessageList(message) {
    this.messages.update((m) => [...m, message]);
  }



  /**
   * Unified message handler from Chat UI.
   * - If host not done: run host turn
   * - Else: treat it as answer to current judge question and advance
   */
  async gotMessage(message: string) {
    const promptStartedAt = performance.now();
    const answer = (message ?? '').trim();
    if (!answer) return;

    //test if we cand do small talk
    const micro = detectMicroTurn(answer);

  if (micro.kind === 'repeat') {
    this.addMessage('ai', 'host', micro.prompt);
    return; // do NOT advance judges
  }

  if (micro.kind === 'clarify') {
    this.addMessage('ai', 'host', micro.prompt);
    return;
  }

  if (micro.kind === 'ack' || micro.kind === 'smalltalk') {
    this.addMessage('ai', 'host', micro.text);
    // continue into normal flow (don’t return)
  }



    // ✅ First user pitch (no host arenas)
    if (this.phase() === 'awaitingPitch') {
      // minimal: store raw pitch
      this.profile = {
        ...(this.profile ?? {}),
        pitch: answer,
      };

      // optional vibe line
      this.addMessage('system', 'system', 'Got it.');

      this.phase.set('asking');
      this.startJudgeTurn(promptStartedAt);
      return;
    }

    if (this.phase() === 'hostFiller') {
  // echo user message
  const chat = createMessage('user', answer);
  this.updateMessageList(chat);
  this.logEvent('message.user', { message: chat, hostFiller: true });

  // store host filler Q/A
  this.arenaMemory.update((m) => ({
    ...m,
    hostNotes: [
      ...(m.hostNotes ?? []),
      {
        type: 'counter',
        q: this.pendingHostQuestion,
        a: answer,
        round: this.round(),
      },
    ],
  }));

  this.pendingHostQuestion = null;

  // While user was answering, we should already have started compute,
  // but ensure it is running
  this.kickoffPanelCompute(promptStartedAt);

  // Wait for panel result if still computing
  if (this.panelPromise) await this.panelPromise;

  // Now move into judge mode
  this.phase.set('asking');
  await this.startJudgeTurn(promptStartedAt);
  return;
}


    // echo user message
    const chat = createMessage('user', answer);
    this.updateMessageList(chat);
    this.logEvent('message.user', { message: chat });

    if (!this.HOST_DONE) {
      this.runChatAsHost(answer, promptStartedAt);
      return;
    }

    // judge answer path
    if (this.phase() !== 'awaitingAnswer') return;
    const turn = this.currentTurn();
    if (!turn) return;

    const activeJudge = this.getActiveJudgeForThisTurn();
    if (!activeJudge) return;

    // save run
    this.judgeRuns.update((runs) => [
      ...runs,
      {
        judgeId: activeJudge.id,
        judgeLabel: activeJudge.label,
        round: this.round(),
        score: turn.score,
        comment: turn.comment,
        question: turn.question,
        answer, //need to track this as its the user prompt
        askedCriteriaId: (turn as any).askedCriteriaId,
        coverage: (turn as any).coverage,
      },
    ]);

    this.arenaMemory.set(
      updateArenaMemory(this.arenaMemory(), activeJudge.id, turn, answer, {
        keepLastCriteria: 10,
        keepLastQuestions: 12,
      }),
    );

    // advance within the round (next judge in this round), otherwise end round
    //const judgesThisRound = this.getJudgesForRound();
    const judgesThisRound = this.roundJudges();

    const nextIdx = this.currentJudgeIndexInRound() + 1;

    if (nextIdx < judgesThisRound.length) {
      this.currentJudgeIndexInRound.set(nextIdx);
      this.phase.set('asking');
      this.startJudgeTurn(promptStartedAt);
      return;
    }

    // end of round
    if (this.round() >= this.maxRounds()) {
      this.finish();
      return;
    }

    this.round.set(this.round() + 1);
    this.currentJudgeIndexInRound.set(0);

    // reset buffers for the new round
    this.roundTurns.set([]);
    this.roundJudges.set([]);

    // kickoff compute + filler
    this.kickoffPanelCompute(promptStartedAt);
    this.startHostFillerIfNeeded(); // phase=hostFiller, asks question

    // don't start judges yet; filler answer will trigger it
    return;

  }

  /**
   * Host turn: merges profile + asks next question until ready=true
   */
  private runChatAsHost(answer: string, promptStartedAt?: number) {
    const cfg = this.arenaConfig();
    if (!cfg || !this.host) return;

    console.log("status", this.profile)

    const prompt = this.hostService.getPrompt(cfg, this.host, {
      profile: this.profile,
      lastQ: this.lastQuestion ?? '',
      lastA: answer,
    });

    this.logEvent('host.prompt.created', { prompt });

    const startedAt = promptStartedAt ?? performance.now();

    this.hostService.runPrompt(answer, prompt, null).then((raw) => {
      this.logEvent('host.prompt.response.raw', { raw });
      const elapsedMs = Math.round(performance.now() - startedAt);
      this.logEvent('host.prompt.duration', { elapsedMs });

      console.log('host time taken', elapsedMs);

      let obj: any = null;
      try {
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        obj = null;
      }

      this.logEvent('host.prompt.response.parsed', { obj });

      if (obj?.ready) {
        this.addMessage('system', 'system', 'Warm-up complete. Judges start now.');

        this.HOST_DONE = true;
        this.currentJudgeIndexInRound.set(0);

        // reset round buffers so panel recomputes cleanly
        this.roundTurns.set([]);
        this.roundJudges.set([]);

        // start compute in parallel and ask filler
        this.kickoffPanelCompute();
        this.startHostFillerIfNeeded(); // sets phase=hostFiller and asks

        // DO NOT startJudgeTurn() now — filler will lead into it
        return;

      }

      this.profile = this.hostService.mergeProfiles(this.profile, obj?.profile);
      this.lastQuestion = String(
        obj?.nextQuestion ?? 'Tell me one more detail.',
      );

      this.addMessage('ai', 'Host', this.lastQuestion!);
    });
  }

  //its a filler idea
  HOST_FILLER_QUESTIONS = [
    'What’s the one thing you deliberately cut from the demo?',
    'What assumption would you test first if you had a week?',
    'Which part is the most fragile technically?',
    'Who would hate this product?',
    'What surprised you while building this?',
  ];

  pendingHostQuestion: string = '';

  pickCounterQuestionForPhase(round: number, stageId: StageId) {
    const idx = Math.max(0, (round - 1) % this.HOST_FILLER_QUESTIONS.length);
    return this.HOST_FILLER_QUESTIONS[idx];
  }


  /**
   * 
   */
  private askHostCounterQuestion() {
    const q = this.pickCounterQuestionForPhase(
      this.round(),
      this.stageForRound(this.round(), this.maxRounds()),
    );
    this.pendingHostQuestion = q;
    this.addMessage('ai', 'Host', `${q}`);
  }

  private kickoffPanelCompute(promptStartedAt?: number) {
  // already running or already computed
  if (this.panelPromise) return;
  if (this.roundTurns().length && this.roundJudges().length) return;

  this.panelPromise = this.ensureRoundTurns(promptStartedAt)
    .catch((err) => {
      console.error('panel compute failed', err);
    })
    .finally(() => {
      this.panelPromise = null;
    });
}

/**
 * 
 * @returns 
 */
private startHostFillerIfNeeded() {
  // only if host is enabled AND we haven't asked filler for this round
  const hostEnabled = this.arenaConfig()?.objective?.constraints?.hostEnabled !== false;
  if (!hostEnabled) return;

  if (this.fillerActiveRound === this.round()) return; // already asked this round
  this.fillerActiveRound = this.round();

  this.phase.set('hostFiller');
  this.askHostCounterQuestion();
}


  /**
   * the idea now would be to have filler questions in order to
   * hide the pauses ...
   * @param promptStartedAt
   * @returns
   */
  private async ensureRoundTurns(promptStartedAt?: number) {

    const cfg = this.arenaConfig();
    if (!cfg) return;

    // already computed
    if (this.roundTurns().length && this.roundJudges().length) return;

    const judgesThisRound = this.getJudgesForRound();
    this.roundJudges.set(judgesThisRound);

    if (!judgesThisRound.length) return;

    const mem = this.arenaMemory();
    const intent = this.planNextIntent(
      cfg,
      this.round(),
      this.judgesPerRound(),
    );

    const judgeArgs: JudgeTurnArgs = {
      profile: this.profile ?? {},
      lastDelta: this.buildLastDeltaPackedForPanel(judgesThisRound),
      memory: mem ?? undefined,
      mode: this.round() <= 1 ? 'discovery' : 'interrogation',
      round: this.round(),
      maxRounds: this.maxRounds(),
      intent,
    };

    const startedAt = promptStartedAt ?? performance.now();
    const res = await this.panelJudgeService.runPanelTurn(
      cfg,
      judgesThisRound,
      judgeArgs,
      (type, event) => {
        this.logEvent(type, event)
      }
    );

    const ordered: JudgeTurnResult[] = judgesThisRound.map((j) => {
      return (
        res.panel.find((p) => p.judge === j.id) ??
        res.panel.find((p) => (p as any).judgeId === j.id) ?? {
          judge: j.id,
          score: 6,
          comment: 'Quick fallback: need one sharper detail.',
          question:
            'What’s one concrete end-to-end example (who, when, outcome)?',
          coverage: [],
          askedCriteriaId: undefined,
          verdictHint: 'maybe',
        }
      );
    });
    const scored = ordered.map((turn) => ({
      ...turn,
      score: this.scoreFromTurn(turn),
    }));
    this.roundTurns.set(scored);

    const elapsedMs = Math.round(performance.now() - startedAt);
    this.logEvent('judge.panel.duration', {
      elapsedMs,
      round: this.round(),
      judgeIds: judgesThisRound.map((j) => j.id),
    });
  }

private async startJudgeTurn(promptStartedAt?: number) {
  if (this.phase() === 'ended') return;

  // If we're in hostFiller, DO NOT push judge message yet.
  // We only push judge question after filler answer.
  if (this.phase() === 'hostFiller') {
    // ensure compute is running
    this.kickoffPanelCompute(promptStartedAt);
    return;
  }

  // Ensure we have round turns (await if needed)
  await this.ensureRoundTurns(promptStartedAt);

  const judgesThisRound = this.roundJudges();
  const idx = this.currentJudgeIndexInRound();

  const judge = judgesThisRound[idx] ?? null;
  const res = this.roundTurns()[idx] ?? null;

  if (!judge || !res) {
    this.finish();
    return;
  }

  this.currentTurn.set(res);

  let judgeReply = "";//`${judge.label}`;
  if (this.liveScoring) judgeReply += ` • Score ${res.score.toFixed(1)}\n`;
  if (this.seeThinking) judgeReply += `${res.comment}\n`;
  judgeReply += `${res.question}`;

  this.addMessage('ai', judge.label, judgeReply);
  this.phase.set('awaitingAnswer');
}


  /**
   * Judges participating in the current round.
   * - judgesPerRound=0 => all judges
   * - otherwise, select N judges, rotating each round through the judgeOrder
   */
  private getJudgesForRound(): ArenaJudgeConfig[] {
    const all = this.judgeOrder ?? [];
    if (!all.length) return [];

    const stage = this.stageForRound(this.round(), this.maxRounds());

    const lineup = (this.arenaConfig() as any)?.lineup?.[stage] as
      | string[]
      | undefined;
    if (lineup?.length) {
      const map = new Map(all.map((j) => [j.id, j]));
      return lineup
        .map((id) => map.get(id))
        .filter(Boolean) as ArenaJudgeConfig[];
    }

    // fallback to your old logic (judgesPerRound rotation)
    const n = this.judgesPerRound();
    if (!n || n >= all.length) return all;

    const start = ((this.round() - 1) * n) % all.length;
    const picked: ArenaJudgeConfig[] = [];
    for (let i = 0; i < n; i++) picked.push(all[(start + i) % all.length]);
    return picked;
  }

  private getActiveJudgeForThisTurn(): ArenaJudgeConfig | null {
    const judges = this.roundJudges().length
      ? this.roundJudges()
      : this.getJudgesForRound();
    if (!judges.length) return null;

    const idx = this.currentJudgeIndexInRound();
    return judges[idx] ?? judges[0] ?? null;
  }

  private buildLastDeltaPackedForPanel(
    judgesThisRound: ArenaJudgeConfig[],
  ): string | undefined {
    const map: Record<string, string> = {};
    for (const j of judgesThisRound) {
      const d = this.buildLastDeltaForJudge(j.id);
      if (d) map[j.id] = d;
    }
    const any = Object.keys(map).length > 0;
    if (!any) return undefined;

    // keep it short-ish
    return `LastDeltaByJudge:\n${JSON.stringify(map)}`;
  }

  private buildLastDeltaForJudge(judgeId: string): string | undefined {
    // most recent run from THIS judge
    const runs = this.judgeRuns();
    for (let i = runs.length - 1; i >= 0; i--) {
      if (runs[i].judgeId === judgeId) {
        const r = runs[i];
        return `Previous (same judge):\nQ: ${r.question}\nA: ${r.answer}`;
      }
    }

    // fallback: previous overall run
    const last = runs.at(-1);
    if (!last) return undefined;
    return `Previous (panel):\nQ: ${last.question}\nA: ${last.answer}`;
  }

  //-------------- intentional methods :-|

  private stageForRound(round: number, maxRounds: number): StageId {
    if (maxRounds <= 1) return 'decision';
    if (round <= 1) return 'clarify';
    if (round >= maxRounds) return 'decision';
    return 'pressure';
  }

  /**
   * question aren't we just heading back to where we were before?
   * @param cfg
   * @param round
   * @param judgesPerRound
   * @returns
   */
  planNextIntent(
    cfg: ArenaConfig,
    round: number,
    judgesPerRound: number,
  ): RoundIntent {
    const phases = (cfg as any).phases ?? [];
    const phase = phases[Math.min(round - 1, phases.length - 1)] ?? {
      id: 'default',
      goal: 'Clarify the idea with friendly precision.',
      primaryCriteria: [],
    };

    const judges = (cfg.judges ?? []).filter((j) => j.id !== 'host');

    const matches = (j: any) => {
      const ids = (j.criteriaConfig ?? []).map((c: any) => c.id);
      const wanted = phase.primaryCriteria ?? [];
      return wanted.filter((x: string) => ids.includes(x)).length;
    };

    const ordered = [...judges].sort(
      (a: any, b: any) => matches(b) - matches(a),
    );
    let picked = ordered.filter((j: any) => matches(j) > 0);

    if (!picked.length) picked = ordered.slice(0, 1); // fallback at least one judge

    if (judgesPerRound > 0) picked = picked.slice(0, judgesPerRound);

    return {
      phaseId: phase.id,
      goal: phase.goal,
      primaryCriteria: phase.primaryCriteria ?? [],
      judgeIds: picked.map((j: any) => j.id),
    };
  }

  // ---------------- ending + summary ----------------

  private async finish() {
    if (this.phase() === 'ended') return;
    this.phase.set('ended');

    const finalScore = avg(this.judgeRuns().map((r) => r.score));

    this.addMessage('system', 'system', `Ended • Final score: ${finalScore.toFixed(1)}`);

    await this.generateSummary(finalScore);
  }

  private async generateSummary(finalScore: number) {
    const cfg = this.arenaConfig();
    if (!cfg) return;

    this.summarizing.set(true);
    try {
      const judgeRuns = this.judgeRuns();
      const interactions = buildInteractions(this.messages());
      const recentInteractions = interactions.slice(-20);
      const pitchFromProfile = String(this.profile?.pitch ?? '').trim();
      const pitchFallback = String(
        recentInteractions.find((i) => i.responder === 'user')?.answer ?? '',
      ).trim();
      const pitch = pitchFromProfile || pitchFallback;

      const summaryPromise = buildEndSummary({
        finalScore,
        cfg,
        profile: this.profile ?? {},
        judgeRuns,
        textPrompt: (user, system) => this.gemini.textPrompt(user, system),
        coerceJson: (raw, fallback) => coerceJson(raw, fallback),
        normalizeVerdict: (v) => normalizeVerdict(v),
      });

      const coachPromise =
        pitch && recentInteractions.length
          ? this.coachService.run(cfg, pitch, {
              exportedAt: new Date().toISOString(),
              interactions: recentInteractions,
            })
          : Promise.resolve(null);

      const [summaryResult, coachRaw] = await Promise.all([
        summaryPromise,
        coachPromise,
      ]);

      this.endSummary.set(summaryResult.summary);

      if (summaryResult.messageText) {
        this.addMessage('system', 'system', summaryResult.messageText);
      }

      const coachJson = coachRaw ? coerceJson(coachRaw, null) : null;
      const coach = coachJson?.coach ?? null;

      if (coach) {
        this.coachReport.set(coachJson);
        this.logEvent('coach.report', { coach: coachJson });

        const strengths = Array.isArray(coach.strength)
          ? coach.strength.filter(Boolean)
          : [];
        const fixes = Array.isArray(coach.fixes)
          ? coach.fixes.filter(Boolean)
          : [];
        const gaps = Array.isArray(coach.gaps)
          ? coach.gaps.filter(Boolean)
          : [];
        const criteriaLines = Array.isArray(coach.criteria)
          ? coach.criteria
              .filter((c) => c?.label || c?.id)
              .map((c) => {
                const label = String(c.label ?? c.id ?? '').trim();
                const score = Number(c.score ?? 0);
                const note = String(c.note ?? '').trim();
                return label
                  ? `${label}: ${score}/10${note ? ` - ${note}` : ''}`
                  : '';
              })
              .filter(Boolean)
          : [];

        const coachMessage = [
          `Coach score: ${Number(coach.overallScore ?? 0)}/10`,
          coach.summary ? `Summary: ${String(coach.summary).trim()}` : '',
          strengths.length ? `Strengths: ${strengths.join(' | ')}` : '',
          fixes.length ? `Fixes: ${fixes.join(' | ')}` : '',
          coach.drill ? `Drill: ${String(coach.drill).trim()}` : '',
          gaps.length ? `Gaps: ${gaps.join(' | ')}` : '',
          criteriaLines.length ? `Criteria:\n${criteriaLines.join('\n')}` : '',
        ]
          .filter(Boolean)
          .join('\n');

        if (coachMessage) {
          this.addMessage('system', 'Coach', coachMessage);
        }
      }
    } finally {
      const cfg = this.arenaConfig();

      this.dialog.open(Report, {
        data: {
          title: cfg?.name ? `${cfg.name} Report` : 'Arena Report',
          summary: this.endSummary(),
          coachReport: this.coachReport(),
          judgeRuns: this.judgeRuns(),
          profile: this.profile ?? {},
        },
      });

      this.summarizing.set(false);
    }
  }

  // ---------------- utils ----------------

  exportConversation() {
    const interactions = buildInteractions(this.messages());

    const payload = {
      exportedAt: new Date().toISOString(),
      interactions,
    };

    downloadJson(payload, `pitch-arena-conversation-${Date.now()}.json`);
  }

  exportPrompts() {
    const interactions = buildInteractions(this.messages());

    const promptEvents = this.eventLog().filter((event) =>
      String(event.type).includes('prompt'),
    );

    const payload = {
      exportedAt: new Date().toISOString(),
      interactions,
      prompts: promptEvents,
    };

    downloadJson(payload, `pitch-arena-prompts-${Date.now()}.json`);
  }

  exportEndReport() {
    const summary = this.endSummary();
    const cfg = this.arenaConfig();

    const payload = {
      exportedAt: new Date().toISOString(),
      arenaId: cfg?.id ?? null,
      arenaName: cfg?.name ?? null,
      summary,
      coachReport: this.coachReport(),
      judgeRuns: this.judgeRuns(),
      profile: this.profile ?? {},
    };

    downloadJson(payload, `pitch-arena-report-${Date.now()}.json`);
  }

  private logEvent(type: string, payload: unknown) {
    this.eventLog.update((events) => [
      ...events,
      {
        ts: Date.now(),
        type,
        payload,
      },
    ]);
  }

}
