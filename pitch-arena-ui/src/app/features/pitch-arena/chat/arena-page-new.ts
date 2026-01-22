import { Component, NgZone, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatUIMessage } from './ui/chat-ui';
import { ChatUiHorizontalComponent } from './ui/chat-ui-horizontal';
import { buildInteractions, downloadJson } from './ui/ui-utils';
import {
  ArenaConfig,
  ArenaJudgeConfig,
} from '../arena-models';
import { HostService } from '../services/host.service';
import { ArenaMemory, ArenaService, newArenaMemory, updateArenaMemory } from '../services/arena-service';

import { GeminiService } from '#services/ai/gemini.service';
import { avg, buildEndSummary, coerceJson, createMessage, EndSummary, getPitchArenaPitch, normalizeVerdict } from './helpers';
import { UiToggleButtonComponent } from 'src/app/ui/ui-toggle-button/ui-toggle-button.component';
import { JudgeCard } from './ui/judge-card/judge-card';
import { JudgeTurnArgs, JudgeTurnResult, NewJudgeService } from '../services/new-judge.service';
import { UiButtonPillComponent } from "#ui";
import { PanelJudgeService } from '../services/panel-judge.service';

//we need to pad the room out a bit
type Phase = 'asking' | 'awaitingAnswer' | 'hostFiller' | 'ended';

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
    ChatUiHorizontalComponent,
    JudgeCard,
    UiToggleButtonComponent,
    UiButtonPillComponent
],
  templateUrl: './arena-page-alt.html',
})
export class ArenaPageNew {
  // services
  gemini = inject(GeminiService);
  hostService = inject(HostService);
  arenaService = inject(ArenaService);
  judgeService = inject(NewJudgeService);

  //lets see if its at least faster with a mutli panel round
  panelJudgeService = inject(PanelJudgeService);
  // buffer: the results for the current round, computed once
  roundJudges = signal<ArenaJudgeConfig[]>([]);
  roundTurns  = signal<JudgeTurnResult[]>([]);

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

  // per-judge memory (critical)
  //judgeMemory = new Map<string, JudgeMemoryLite>();

  //new global arena style
  arenaMemory = signal<ArenaMemory>(newArenaMemory());

  // history
  judgeRuns = signal<JudgeRun[]>([]);
  endSummary = signal<EndSummary | null>(null);
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

  //some config
  liveScoring = false;
  seeThinking = false;

  // derived
  roundLabel = computed(() => `Round ${this.round()} / ${this.maxRounds()}`);
  activeJudgeId = computed(() => this.getActiveJudgeForThisTurn()?.id ?? null);

  isJudgeSpeaking(judgeId: string): boolean {
    return this.phase() !== 'ended' && this.activeJudgeId() === judgeId;
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
    const jprRaw = this.route.snapshot.queryParamMap.get('judgesPerRound');
    const jpr = jprRaw ? Number(jprRaw) : 0;
    this.judgesPerRound.set(Number.isFinite(jpr) && jpr >= 0 ? jpr : 0);

    this.loadArena(path, demo);
  }

  private async loadArena(path: string, demo: boolean) {
    try {
      this.logEvent('arena.load.start', { path, demo });

      const cfg = await this.arenaService.getArenaConfig(path);
      this.arenaConfig.set(cfg);
      this.logEvent('arena.load.config', { cfg });

      this.addMessage("system", "Goal:" + this.arenaConfig().goal)

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

      // host
      this.host = cfg.judges.find((j) => j.id === 'host') ?? null;
      this.logEvent('arena.load.host', { host: this.host });

      // judges (excluding host)
      this.judgeOrder = (cfg.judges ?? []).filter((j) => j.id !== 'host');
      this.logEvent('arena.load.judges', {
        judgeIds: this.judgeOrder.map((j) => j.id),
      });

      // basic safety: if there are no judges, keep usable
      if (!this.judgeOrder.length) {
        this.addMessage("system", 'No judges found in this arena config (excluding host).')
      }

      // init state
      //this.judgeMemory.clear();
      this.judgeRuns.set([]);
      this.endSummary.set(null);
      this.phase.set('asking');
      this.currentTurn.set(null);
      this.currentJudgeIndexInRound.set(0);
      this.round.set(1);

      if (demo) {
        this.profile = getPitchArenaPitch();
        this.HOST_DONE = true;

        this.arenaLoaded.set(true);

        // start round 1 immediately (no welcome)
        await this.startJudgeTurn();
        return;
      }

      // host-driven flow
      if (!this.host?.profileConfig?.length) {
        // If host is missing, fallback to demo-like start but with empty profile
        this.profile = {};
        this.HOST_DONE = true;
        this.arenaLoaded.set(true);
        await this.startJudgeTurn();
        return;
      }

      this.profile = this.hostService.getNewProfile(this.host.profileConfig);
      this.logEvent('arena.profile.init', { profile: this.profile });

      const hostWelcome =
        'Welcome. Quick warm-up: who are you, and what are you trying to build?';
      this.lastQuestion = hostWelcome;

      this.addMessage('ai', hostWelcome);
      this.logEvent('message.ai', { text: hostWelcome });

      this.arenaLoaded.set(true);
    } finally {
      // timings later if you want
    }
  }

  addMessage(type, text) {
    this.messages.update((messages) => [
      ...messages,
      createMessage(type, text),
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

    if (this.phase() === 'hostFiller') {
      this.arenaMemory.update(m => ({
        ...m,
        hostNotes: [
          ...(m.hostNotes ?? []),
          {
            type: 'counter',
            q: this.pendingHostQuestion,
            a: answer,
            round: this.round()
          }
        ]
      }));

      this.pendingHostQuestion = null;
      this.addMessage('system', 'Noted.');
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
        answer,//need to track this as its the user prompt 
        askedCriteriaId: (turn as any).askedCriteriaId,
        coverage: (turn as any).coverage,
      },
    ]);

    this.arenaMemory.set(
      updateArenaMemory(this.arenaMemory(), activeJudge.id, turn, answer, {
        keepLastCriteria: 10,
        keepLastQuestions: 12,
      })
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
    this.phase.set('asking');

    this.roundTurns.set([]);
    this.roundJudges.set([]);

    await this.startJudgeTurn(promptStartedAt);


  }

  /**
   * Host turn: merges profile + asks next question until ready=true
   */
  private runChatAsHost(answer: string, promptStartedAt?: number) {
    const cfg = this.arenaConfig();
    if (!cfg || !this.host) return;

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

      console.log("host time taken", elapsedMs)

      let obj: any = null;
      try {
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        obj = null;
      }

      this.logEvent('host.prompt.response.parsed', { obj });

      if (obj?.ready) {
        this.addMessage('system', 'Warm-up complete. Judges start now.');

        this.HOST_DONE = true;
        this.currentJudgeIndexInRound.set(0);
        this.phase.set('asking');

        // immediately ask first judge question
        this.startJudgeTurn();
        return;
      }

      this.profile = this.hostService.mergeProfiles(this.profile, obj?.profile);
      this.lastQuestion = String(
        obj?.nextQuestion ?? 'Tell me one more detail.',
      );

      this.addMessage('ai', this.lastQuestion!);
    });
  }

//its a filler idea
HOST_FILLER_QUESTIONS = [
  "What’s the one thing you deliberately cut from the demo?",
  "What assumption would you test first if you had a week?",
  "Which part is the most fragile technically?",
  "Who would hate this product?",
  "What surprised you while building this?"
];

pendingHostQuestion: string = "";

pickCounterQuestionForPhase(round, stageId){
  return this.HOST_FILLER_QUESTIONS[round]
}

askHostCounterQuestion() {
  const q = this.pickCounterQuestionForPhase(this.round(), this.stageForRound(this.round(), this.maxRounds()));
  this.pendingHostQuestion = q;
  this.addMessage('ai', `Host: ${q}`);
}

/**
 * the idea now would be to have filler questions in order to 
 * hide the pauses ... 
 * @param promptStartedAt 
 * @returns 
 */
private async ensureRoundTurns(promptStartedAt?: number) {

  //new idea pad it out
  if (!this.roundTurns().length) {
    this.phase.set('hostFiller');
    this.askHostCounterQuestion();
  }

  const cfg = this.arenaConfig();
  if (!cfg) return;

  // already computed
  if (this.roundTurns().length && this.roundJudges().length) return;

  const judgesThisRound = this.getJudgesForRound();
  this.roundJudges.set(judgesThisRound);

  if (!judgesThisRound.length) return;

  const mem = this.arenaMemory();
  const intent = this.planNextIntent(cfg, this.round(), this.judgesPerRound());

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
  const res = await this.panelJudgeService.runPanelTurn(cfg, judgesThisRound, judgeArgs);

  /*
const ordered = judgesThisRound.map(j =>
  res.panel.find(p => p.judge === j.id) ??
  res.panel.find(p => (p as any).judgeId === j.id) ??
  {
    judge: j.id,
    score: 6,
    comment: 'Quick fallback: need one sharper detail.',
    question: 'What’s one concrete end-to-end example (who, when, outcome)?',
    coverage: [],
    askedCriteriaId: undefined,
    verdictHint: 'maybe',
  }
);
this.roundTurns.set(ordered);*/


const ordered: JudgeTurnResult[] = judgesThisRound.map((j) => {
  return (
    res.panel.find(p => p.judge === j.id) ??
    res.panel.find(p => (p as any).judgeId === j.id) ??
    {
      judge: j.id,
      score: 6,
      comment: 'Quick fallback: need one sharper detail.',
      question: 'What’s one concrete end-to-end example (who, when, outcome)?',
      coverage: [],
      askedCriteriaId: undefined,
      verdictHint: 'maybe',
    }
  );
});
  this.roundTurns.set(ordered);


  const elapsedMs = Math.round(performance.now() - startedAt);
  this.logEvent('judge.panel.duration', { elapsedMs, round: this.round(), judgeIds: judgesThisRound.map(j => j.id) });
}

private async startJudgeTurn(promptStartedAt?: number) {
  if (this.phase() === 'ended') return;

  await this.ensureRoundTurns(promptStartedAt);

  const judgesThisRound = this.roundJudges();
  const idx = this.currentJudgeIndexInRound();

  const judge = judgesThisRound[idx] ?? null;
  const res = this.roundTurns()[idx] ?? null;

  if (!judge || !res) {
    // If we can't find the next judge/turn, end safely
    this.finish();
    return;
  }

  this.currentTurn.set(res);

  let judgeReply = `${judge.label}`;
  if (this.liveScoring) judgeReply += ` • Score ${res.score.toFixed(1)}`;
  if (this.seeThinking) judgeReply += `\n${res.comment}\n`;
  judgeReply += `\n${res.question}`;

  this.addMessage('ai', judgeReply);
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

    const lineup = (this.arenaConfig() as any)?.lineup?.[stage] as string[] | undefined;
    if (lineup?.length) {
      const map = new Map(all.map(j => [j.id, j]));
      return lineup.map(id => map.get(id)).filter(Boolean) as ArenaJudgeConfig[];
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
    const judges = this.roundJudges().length ? this.roundJudges() : this.getJudgesForRound();
    if (!judges.length) return null;

    const idx = this.currentJudgeIndexInRound();
    return judges[idx] ?? judges[0] ?? null;
  }

  private buildLastDeltaPackedForPanel(judgesThisRound: ArenaJudgeConfig[]): string | undefined {
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
planNextIntent(cfg: ArenaConfig, round: number, judgesPerRound: number): RoundIntent {
  const phases = (cfg as any).phases ?? [];
  const phase = phases[Math.min(round - 1, phases.length - 1)] ?? {
    id: 'default',
    goal: 'Clarify the idea with friendly precision.',
    primaryCriteria: []
  };

  const judges = (cfg.judges ?? []).filter(j => j.id !== 'host');

  const matches = (j: any) => {
    const ids = (j.criteriaConfig ?? []).map((c: any) => c.id);
    const wanted = phase.primaryCriteria ?? [];
    return wanted.filter((x: string) => ids.includes(x)).length;
  };

  const ordered = [...judges].sort((a: any, b: any) => matches(b) - matches(a));
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

    this.addMessage('system', `Ended • Final score: ${finalScore.toFixed(1)}`);

    await this.generateSummary(finalScore);
  }

  private async generateSummary(finalScore: number) {
    const cfg = this.arenaConfig();
    if (!cfg) return;

    this.summarizing.set(true);
    try {
      const result = await buildEndSummary({
        finalScore,
        cfg,
        profile: this.profile ?? {},
        judgeRuns: this.judgeRuns(),
        textPrompt: (user, system) => this.gemini.textPrompt(user, system),
        coerceJson: (raw, fallback) => coerceJson(raw, fallback),
        normalizeVerdict: (v) => normalizeVerdict(v),
      });

      this.endSummary.set(result.summary);

      if (result.messageText) {
        this.addMessage('system', result.messageText);
      }
    } finally {
      this.summarizing.set(false);
    }
  }

  // ---------------- utils ----------------

  exportConversation(){
    const interactions = buildInteractions(this.messages());

    const payload = {
      exportedAt: new Date().toISOString(),
      interactions,
    };

    downloadJson(payload, `pitch-arena-conversation-${Date.now()}.json`);
  }

  exportPrompts(){
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
