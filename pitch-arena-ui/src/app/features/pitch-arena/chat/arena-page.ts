import { Component, NgZone, inject, signal, computed } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ChatUIMessage, ChatUiComponent } from './ui/chat-ui';
import { ChatUiHorizontalComponent } from './ui/chat-ui-horizontal';
import {
  ArenaConfig,
  ArenaJudgeConfig,
  ChatMsg,
} from '../deprecated/models/arena-config';
import { HostService } from '../services/host.service';
import { ArenaService } from '../services/arena-service';
import {
  JudgeMemoryLite,
  JudgeService,
  JudgeTurnResult,
} from '../deprecated/services/judge.service';
import { GeminiService } from '#services/ai/gemini.service';
import { buildEndSummary, EndSummary, getPitchArenaPitch } from './helpers';
import { UiToggleButtonComponent } from 'src/app/ui/ui-toggle-button/ui-toggle-button.component';
import { JudgeCard } from './ui/judge-card/judge-card';

type Phase = 'asking' | 'awaitingAnswer' | 'ended';

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

@Component({
  selector: 'chat-page',
  imports: [
    //ChatUiComponent,
    ChatUiHorizontalComponent,
    //UiToggleButtonComponent,
    JudgeCard,
    UiToggleButtonComponent
],
  templateUrl: './arena-page-alt.html',
})
export class ArenaPage {
  // services
  gemini = inject(GeminiService);
  hostService = inject(HostService);
  arenaService = inject(ArenaService);
  judgeService = inject(JudgeService);

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
  judgeMemory = new Map<string, JudgeMemoryLite>();

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
    const confirmed = window.confirm('Leave the arena? Your session will end.');
    if (!confirmed) return;
    this.router.navigateByUrl('/arenas');
  }

  judgeCard = computed(() => {
    const judge = this.getActiveJudgeForThisTurn();
    const turn = this.currentTurn();
    const coverage = turn?.coverage ?? [];
    //const first = coverage[0];
    //const second = coverage[1];
    const ratingFromStatus = (
      status: 'missing' | 'partial' | 'clear' | undefined,
    ) => (status === 'clear' ? 2 : status === 'partial' ? 1 : 0);
    const statusLabel = (
      status: 'missing' | 'partial' | 'clear' | undefined,
    ) => (status ? `${status[0].toUpperCase()}${status.slice(1)}` : '');

    /*
    const weakness =
      coverage.find((c) => c.status === 'missing')?.id ??
      first?.id ??
      'n/a';
      */
    const resist =
      turn?.askedCriteriaId ??
      coverage.find((c) => c.status === 'partial')?.id ??
      'n/a';

    return {
      topTitle: this.roundLabel(),
      rightTag: 'Score',
      name: judge?.label ?? 'Judge',
      hp: turn?.score != null ? turn.score.toFixed(1) : '--',
      imageLabel: judge?.dimension ?? judge?.label ?? 'Judge',
      criteriaTitle: 'Tone',
      criteriaText: judge.tone,
      rating: 2,
      criteria2Title: 'Focus',
      criteria2Text: judge.focus.join(', '),
      rating2: 2,
      dimension: judge.dimension,
      resist,
      tone: judge?.tone ?? 'direct',
    };
  });

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
        /*
        this.messages.update((m) => [
          ...m,
          this.createMessage(
            'system',
            'No judges found in this arena config (excluding host).',
          ),
        ]);*/
      }

      // init state
      this.judgeMemory.clear();
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

      this.messages.update((messages) => [
        ...messages,
        this.createMessage('ai', hostWelcome),
      ]);
      this.logEvent('message.ai', { text: hostWelcome });

      this.arenaLoaded.set(true);
    } finally {
      // timings later if you want
    }
  }

  addMessage(type, text){
    this.messages.update((messages) => [
        ...messages,
        this.createMessage(type, text),
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
  gotMessage(message: string) {
    const answer = (message ?? '').trim();
    if (!answer) return;

    // echo user message
    const chat = this.createMessage('user', answer);
    this.messages.update((messages) => [...messages, chat]);
    this.logEvent('message.user', { message: chat });

    if (!this.HOST_DONE) {
      this.runChatAsHost(answer);
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
        answer,
        askedCriteriaId: (turn as any).askedCriteriaId,
        coverage: (turn as any).coverage,
      },
    ]);

    // advance within the round (next judge in this round), otherwise end round
    const judgesThisRound = this.getJudgesForRound();
    const nextIdx = this.currentJudgeIndexInRound() + 1;

    if (nextIdx < judgesThisRound.length) {
      this.currentJudgeIndexInRound.set(nextIdx);
      this.phase.set('asking');
      this.startJudgeTurn();
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
    this.startJudgeTurn();
  }

  /**
   * Host turn: merges profile + asks next question until ready=true
   */
  private runChatAsHost(answer: string) {
    const cfg = this.arenaConfig();
    if (!cfg || !this.host) return;

    const prompt = this.hostService.getPrompt(cfg, this.host, {
      profile: this.profile,
      lastQ: this.lastQuestion ?? '',
      lastA: answer,
    });

    this.logEvent('host.prompt.created', { prompt });

    this.hostService.runPrompt(answer, prompt, null).then((raw) => {
      this.logEvent('host.prompt.response.raw', { raw });

      let obj: any = null;
      try {
        obj = typeof raw === 'string' ? JSON.parse(raw) : raw;
      } catch {
        obj = null;
      }

      this.logEvent('host.prompt.response.parsed', { obj });

      if (obj?.ready) {
        this.messages.update((messages) => [
          ...messages,
          this.createMessage('system', 'Warm-up complete. Judges start now.'),
        ]);

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

      this.messages.update((messages) => [
        ...messages,
        this.createMessage('ai', this.lastQuestion!),
      ]);
    });
  }

  /**
   * Ask the next judge question (ONE LLM call).
   * - chooses judge based on judgesPerRound + rotation
   * - keeps per-judge memory
   */
  private async startJudgeTurn() {
    if (this.phase() === 'ended') return;

    const cfg = this.arenaConfig();
    if (!cfg) return;

    const judge = this.getActiveJudgeForThisTurn();
    if (!judge) {
      // nothing to ask, end safely
      this.finish();
      return;
    }

    const mem = this.judgeMemory.get(judge.id) ?? null;

    const res = await this.judgeService.runTurn(cfg, judge, {
      profile: this.profile ?? {},
      lastDelta: this.buildLastDeltaForJudge(judge.id),
      memory: mem ?? undefined,
      mode: this.round() <= 1 ? 'discovery' : 'interrogation',
    });

    // update per-judge memory
    this.judgeMemory.set(
      judge.id,
      this.judgeService.nextMemory(mem ?? undefined, res),
    );
    this.currentTurn.set(res);

    var judgeReply = `${judge.label} • ${this.roundLabel()}`;
    if (this.liveScoring) {
      judgeReply += `• Score ${res.score.toFixed(1)}`;
    }
    if (this.seeThinking) {
      judgeReply += `\n${res.comment}\n`;
    }
    judgeReply += `\n${res.question}`;

    // emit judge message
    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage('ai', judgeReply),
    ]);

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

    const n = this.judgesPerRound();
    if (!n || n >= all.length) return all;

    // rotate windows across rounds: round 1 starts at 0, round 2 starts at n, etc.
    const start = ((this.round() - 1) * n) % all.length;

    // take n judges, wrapping around
    const picked: ArenaJudgeConfig[] = [];
    for (let i = 0; i < n; i++) {
      picked.push(all[(start + i) % all.length]);
    }
    return picked;
  }

  private getActiveJudgeForThisTurn(): ArenaJudgeConfig | null {
    const judges = this.getJudgesForRound();
    if (!judges.length) return null;

    const idx = this.currentJudgeIndexInRound();
    return judges[idx] ?? judges[0] ?? null;
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

  // ---------------- ending + summary ----------------

  private async finish() {
    if (this.phase() === 'ended') return;
    this.phase.set('ended');

    const finalScore = this.avg(this.judgeRuns().map((r) => r.score));

    this.messages.update((msgs) => [
      ...msgs,
      this.createMessage(
        'system',
        `Ended • Final score: ${finalScore.toFixed(1)}`,
      ),
    ]);

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
        coerceJson: (raw, fallback) => this.coerceJson(raw, fallback),
        normalizeVerdict: (v) => this.normalizeVerdict(v),
      });

      this.endSummary.set(result.summary);

      if (result.messageText) {
        this.messages.update((msgs) => [
          ...msgs,
          this.createMessage('system', result.messageText),
        ]);
      }
    } finally {
      this.summarizing.set(false);
    }
  }

  // ---------------- utils ----------------

  private avg(nums: number[]) {
    return nums.reduce((a, n) => a + n, 0) / Math.max(1, nums.length);
  }

  private normalizeVerdict(v: any): 'pass' | 'maybe' | 'fail' {
    const s = String(v ?? '').toLowerCase();
    if (s.includes('pass') || s.includes('go') || s.includes('strong'))
      return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject'))
      return 'fail';
    return 'maybe';
  }

  private coerceJson(raw: any, fallback: any) {
    if (raw && typeof raw === 'object') return raw;
    const s = String(raw ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```[\s\r\n]*$/i, '')
      .trim();
    try {
      return JSON.parse(s);
    } catch {
      return fallback;
    }
  }

  createMessage(role: 'system' | 'user' | 'ai', text: string): ChatUIMessage {
    return {
      id: this.generateID(),
      text,
      role,
    };
  }

  generateID() {
    return crypto.randomUUID();
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
