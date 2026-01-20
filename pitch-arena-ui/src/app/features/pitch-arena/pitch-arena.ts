import { GeminiService } from '#services/ai/gemini.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';
import { JudgesService } from './services/judges.service';
import { VoiceService } from './services/voice.service';
import {
  ArenaConfig,
  ArenaMemory,
  ArenaProfile,
  ChatMsg,
  EndSummary,
  HostJson,
  JudgeJson,
  JudgeRun,
  Phase,
  SelectedAttacks,
  AttackCategory,
  PanelMode,
  PitchParse,
  Verdict,
  ArenaObjective,
  ArenaConstraints,
} from './models/arena-config';
import { ActivatedRoute } from '@angular/router';
import {
  promptBuildAssumptions,
  promptExtractClaims,
  promptUpdateParseSystem,
} from './prompt-functions';
import { ArenaTranscript } from './arena-transcript';
import { coerceJson, exportConversation } from './export-functions';
import { AiUsageContext } from '#services/db/db-ai-usage.service';

@Component({
  selector: 'app-pitch-arena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pitch-arena.html',
})
export class PitchArena {
  private http = inject(HttpClient);
  geminiService = inject(GeminiService);
  private voice = inject(VoiceService);
  private judgesService = inject(JudgesService);

  private startTimer(label: string) {
    const start = this.nowMs();
    return () => {
      const elapsed = this.nowMs() - start;
      console.log(`[PitchArena][${label}] ${elapsed.toFixed(1)}ms`);
    };
  }

  private nowMs() {
    if (typeof performance !== 'undefined' && performance.now)
      return performance.now();
    return Date.now();
  }

  // ---------------- Config ----------------

  private usedQTypesByJudge = new Map<Exclude<string,'host'>, string[]>();

  judges: Array<{ id: string; label: string; dimension: string }> = [];
  judgeVoices: Record<string, string> = {};

  maxRounds = signal<number>(3);
  round = signal<number>(1);

  isFinalRound = computed(() => this.round() >= this.maxRounds());
  roundLabel = computed(() => `Round ${this.round()} / ${this.maxRounds()}`);

  //-----------fast mode idea

  /**
   * there are certain time issues that might be helped with
   * configuring different options ... its something to test.
   *
   */
  private arenaCfg(): ArenaConfig | null {
    return (this.judgesService.getArena?.() ?? null) as any;
  }

  private constraints(): ArenaConstraints {
    return (
      this.arenaCfg()?.objective?.constraints ?? {
        maxRounds: 3,
        toneFloor: '0',
        noInvestorTalk: false,
        timeboxPerJudgeSeconds: 0,
      }
    );
  }

  private fastModeEnabled(): boolean {
    return !!this.constraints().fastMode;
  }

  private parseMode(): 'none' | 'fast' | 'full' {
    return (this.constraints().parseMode ?? 'full') as any;
  }

  private summaryMode(): 'none' | 'template' | 'llm' {
    return (this.constraints().summaryMode ?? 'llm') as any;
  }

  private llmTimeoutMs(): number {
    const n = Number(this.constraints().llmTimeoutMs ?? 6500);
    return Number.isFinite(n) ? n : 6500;
  }

  private withTimeout<T>(
    p: Promise<T>,
    ms: number,
    fallback: () => T | Promise<T>
  ): Promise<T> {
    console.log("the timeout is set to ", ms)
    let t: any;
    const timeout = new Promise<T>((resolve, reject) => {
      t = setTimeout(() => {
        Promise.resolve()
          .then(fallback)
          .then(resolve)
          .catch(reject);
      }, Math.max(800, ms));
    });

    return Promise.race([p, timeout]).finally(() => clearTimeout(t));
  }

  // ---------------- State ----------------

  phase = signal<Phase>('intro');
  panelMode = signal<PanelMode>('discovery');

  profile = signal<ArenaProfile>({
    founderName: '',
    ideaName: '',
    pitch: '',
  });

  chat = signal<ChatMsg[]>([]);
  input = signal<string>('');

  judgeRuns = signal<JudgeRun[]>([]);
  currentJudgeIndex = signal<number>(0);
  arenaLoaded = signal<boolean>(false);

  // Persistent context across rounds
  arenaContext = signal<PitchParse | null>(null);

  // per-round
  parse = signal<PitchParse | null>(null);
  selectedAttacks = signal<SelectedAttacks | null>(null);

  // memory
  private memory = new Map<Exclude<string, 'host'>, ArenaMemory>();
  private lastCategory = new Map<Exclude<string, 'host'>, string>();
  private lastOverall: number | null = null;

  // prevent re-entry
  private judgingInFlight = signal(false);
  rescoring = signal(false);
  rescoreFeedback = signal<string | null>(null);

  // summary
  endSummary = signal<EndSummary | null>(null);
  summarizing = signal(false);

  // ---------------- Derived ----------------

  overallScore = computed(() => {
    const runs = this.judgeRuns();
    if (!runs.length) return 0;
    return this.avg(runs.map((r) => r.score));
  });

  overallDelta = computed(() => {
    if (this.lastOverall === null) return null;
    return this.overallScore() - this.lastOverall;
  });

  canSend = computed(() => {
    if (!this.arenaLoaded()) return false;
    const t = (this.input() ?? '').trim();
    if (this.phase() === 'intro') return t.length >= 2;
    if (this.phase() === 'answering') return t.length >= 3;
    return false;
  });

  canRescore = computed(() => {
    if (this.phase() !== 'results') return false;
    const runs = this.judgeRuns();
    return (
      !!runs.length && runs.every((r) => (r.answer ?? '').trim().length >= 2)
    );
  });

  route = inject(ActivatedRoute);

  // ---------------- UI plumbing ----------------

  @ViewChild('chatWindow') chatWindow?: ElementRef<HTMLElement>;
  
  private autoScrollEffect = effect(() => {
    this.chat();
    queueMicrotask(() => this.scrollChatToBottom());
  });

  constructor() {
    this.setChat(
      crypto.randomUUID(),
      'judge',
      'host',
      'Host • Warm-up',
      'Welcome to Pitch Arena, what is your name?'
    );
  }

  ngOnInit() {
    const end = this.startTimer('ngOnInit');
    const path = this.route.snapshot.paramMap.get('path');
    if (path) this.loadArena(path);

    const qp = this.route.snapshot.queryParamMap;
    const round = Number(qp.get('round') ?? '1');
    const mode = qp.get('mode') as any as PanelMode | null;
    const autoProfile = qp.get('autoProfile') === '1';
    //const ctx = qp.get('ctx') === '1';

    //to think about for the test mode as well.
    if (autoProfile) {
      this.profile.set({
        founderName: 'Test Founder',
        ideaName: 'Test Idea',
        pitch: `Pitch Arena is a web app where founders rehearse incubator/hackathon Q&A with AI judges.
          User: founders applying to incubators.
          Moment: the night before a demo day.
          Value: repeatable, targeted pressure-testing + transcript + action plan.
          Flow: founder answers 6 warmup fields → 1 judge asks 1 question → founder answers → rescore → summary.
          Why AI: judges adapt questions to gaps and keep persona/criteria consistent.`,
        targetUser: 'Founders applying to incubators / hackathons',
        targetContext: 'The 48h before interviews / demo days',
        firstValue: 'A realistic Q&A + concrete next steps',
        acquisitionPath: 'Incubator partnerships + founder communities',
        inputSource: 'Founder-provided pitch + optional deck text',
      });
      this.phase.set('judging'); // or set intro complete then startRound
      this.chat.update((list) =>
        list.concat({
          id: crypto.randomUUID(),
          role: 'system',
          title: 'Dev',
          text: 'Auto-profile loaded. Skipping warm-up.',
        })
      );
    }

    if (round > 1) this.round.set(round);
    if (mode) this.panelMode.set(mode);

    // Start immediately if requested
    if (qp.get('start') === '1') {
      // ensure arenaLoaded first
      const tick = () =>
        this.arenaLoaded() ? this.startRound() : setTimeout(tick, 50);
      tick();
    }
    end();
  }

  private async loadArena(path) {
    const end = this.startTimer('loadArena');
    try {
      const cfg = await firstValueFrom(
        this.http.get<ArenaConfig>('/assets/arenas/' + path + '.json')
      );
      //console.log(cfg);

      const maxRoundsFromCfg = cfg.objective?.constraints?.maxRounds;

      //console.log("rounds are set at:" + maxRoundsFromCfg)

      if (
        typeof maxRoundsFromCfg === 'number' &&
        Number.isFinite(maxRoundsFromCfg) &&
        maxRoundsFromCfg > 0
      ) {
        this.maxRounds.set(maxRoundsFromCfg);
        if (this.round() > maxRoundsFromCfg) this.round.set(maxRoundsFromCfg);
      }

      this.judgesService.useArenaConfig(cfg);
      this.judges = this.judgesService.getJudges();
      this.judgeVoices = this.judgesService.getJudgeVoices();
      this.arenaLoaded.set(true);

      console.log(this.judgesService.getArena());
    } finally {
      end();
    }
  }

  setChat(id, role, judgeId, title, text) {
    this.chat.set([
      {
        id: id,
        role: role,
        judgeId: judgeId,
        title: title,
        text: text,
      },
    ]);
  }

  reset() {
    this.phase.set('intro');
    this.round.set(1);
    this.panelMode.set('discovery');

    this.profile.set({ founderName: '', ideaName: '', pitch: '' });

    this.setChat(
      crypto.randomUUID(),
      'judge',
      'host',
      'Host • Warm-up',
      'Welcome to Pitch Arena. In one line: who are you?'
    );

    this.input.set('');
    this.judgeRuns.set([]);
    this.currentJudgeIndex.set(0);

    this.parse.set(null);
    this.selectedAttacks.set(null);
    this.arenaContext.set(null);

    this.memory.clear();
    this.lastCategory.clear();
    this.lastOverall = null;

    this.judgingInFlight.set(false);
    this.rescoring.set(false);
    this.rescoreFeedback.set(null);

    this.endSummary.set(null);
    this.summarizing.set(false);
  }

  send() {
    if (!this.canSend()) return;

    const text = (this.input() ?? '').trim();
    this.input.set('');

    this.chat.update((list) =>
      list.concat({ id: crypto.randomUUID(), role: 'user', text })
    );

    if (this.phase() === 'intro') return this.hostTurn(text);
    if (this.phase() === 'answering') return this.panelAnswerTurn(text);
  }

  // ---------------- Warm-up (Host) ----------------

  private hostTurn(userAnswer: string) {
    const end = this.startTimer('hostTurn');
    const prof = this.profile();
    const lastHostQ =
      ArenaTranscript.lastJudgeQuestionText(this.chat(), 'host') ?? 'Warm-up';

    const system = this.judgesService.hostSystemPrompt();
    const user = this.judgesService.hostUserPrompt(prof, lastHostQ, userAnswer);

    const usage:  AiUsageContext =       {
      arenaId: this.judgesService.getArena().id,
      //sessionId: this.sessionId,
      round: this.round(),
      judgeId: 'host',
      purpose: 'warmup',
    }

    this.geminiService
      .textPrompt(user, system, usage)
      .then((raw) => {
        const json = this.coerceHostJson(raw);

        if (json.profile)
          this.profile.update((p) => ({ ...p, ...json.profile }));

        if ((json.comment ?? '').trim()) {
          this.chat.update((list) =>
            list.concat({
              id: crypto.randomUUID(),
              role: 'judge',
              judgeId: 'host',
              title: 'Host',
              text: String(json.comment).trim(),
            })
          );
        }

        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'judge',
            judgeId: 'host',
            title: 'Host • Warm-up',
            text: String(json.nextQuestion ?? 'Tell me more.').trim(),
          })
        );

        if (json.ready) {
          this.chat.update((list) =>
            list.concat({
              id: crypto.randomUUID(),
              role: 'system',
              title: 'Warm-up complete',
              text: 'Panel is starting now.',
            })
          );
          this.startRound();
        }
      })
      .catch((err) => {
        console.error(err);
        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'judge',
            judgeId: 'host',
            title: 'Host • Warm-up',
            text: 'Quick reset: what is the name of your idea, and who is it for?',
          })
        );
      })
      .finally(end);
  }

  private coerceHostJson(raw: any): HostJson {
    const obj = this.coerceJson(raw, null);
    if (!obj) {
      return {
        phase: 'intro',
        ready: false,
        nextQuestion: 'What’s the name of your idea, and who is it for?',
      };
    }
    return {
      phase: 'intro',
      ready: !!obj.ready,
      nextQuestion: String(obj.nextQuestion ?? 'Tell me more.'),
      profile: obj.profile ?? undefined,
      comment: obj.comment ? String(obj.comment) : undefined,
    };
  }

  // ---------------- Judging rounds ----------------

  private updatePanelModeForRound() {
    const target: PanelMode = this.round() <= 1 ? 'discovery' : 'interrogation';

    // if any judge lacks vectors for target mode, stay discovery
    const panelJudges = this.judges
      .filter((j) => j.id !== 'host')
      .map((j) => j.id as Exclude<string, 'host'>);
    const ok = panelJudges.every(
      (j) => (this.judgesService.getVectors(j, target) ?? []).length > 0
    );

    this.panelMode.set(ok ? target : 'discovery');
  }

  private vectorsFor(judge: Exclude<string, 'host'>) {
    return this.judgesService.getVectors(judge, this.panelMode());
  }

  devJudgeOnly = signal<Exclude<string, 'host'> | 'all'>('all');

  startRound() {
    if (this.judgingInFlight()) return;
    if (this.phase() === 'ended') return;
    if (this.round() > this.maxRounds()) return;

    const end = this.startTimer('startRound');
    this.judgingInFlight.set(true);
    this.updatePanelModeForRound();
    this.phase.set('judging');

    this.buildRoundContext()
      .then((ctx) => {
        this.parse.set(ctx);

        const attacks = this.selectAttacks(ctx); //here we get an error
        this.selectedAttacks.set(attacks);

        const env = {
          ideaName: ctx.ideaName,
          pitch: ctx.pitchText,
          round: this.round(),
        };

        const panelJudges = this.judges
          .filter((j) => j.id !== 'host')
          .map((j) => j.id as Exclude<string, 'host'>);

        const chosen =
          this.devJudgeOnly() === 'all'
            ? panelJudges
            : panelJudges.filter((j) => j === this.devJudgeOnly());

        const calls = chosen.map((j) =>
          this.callJudgeWithAttack(j, env, ctx, attacks[j])
        );

        return Promise.all(calls);
      })
      .then((results) => {
        const runs: JudgeRun[] = results.map((r) => {
          const prev = this.memory.get(r.judge);
          const delta = prev ? r.score - prev.lastScore : null;

          const conf = this.judges.find((x) => x.id === r.judge)!;
          return {
            judge: r.judge,
            judgeLabel: conf.label,
            dimension: conf.dimension,
            score: r.score,
            delta,
            comment: r.comment,
            question: r.question,
            answer: '',
          };
        });

        this.judgeRuns.set(runs);
        this.phase.set('answering');
        this.currentJudgeIndex.set(0);
        this.pushJudgeBubble(runs[0]);
      })
      .catch((err) => {
        console.error(err);
        // recover to results so UI doesn't freeze
        this.phase.set('results');
      })
      .finally(() => {
        // ✅ CRITICAL: fixes your “blocks after rescore”
        this.judgingInFlight.set(false);
        end();
      });
  }

  private panelAnswerTurn(text: string) {
    const idx = this.currentJudgeIndex();
    const runs = this.judgeRuns();
    const run = runs[idx];
    if (!run) return;

    this.judgeRuns.update((list) =>
      list.map((r, i) => (i === idx ? { ...r, answer: text } : r))
    );

    const nextIdx = idx + 1;
    if (nextIdx < runs.length) {
      this.currentJudgeIndex.set(nextIdx);
      this.pushJudgeBubble(this.judgeRuns()[nextIdx]);
      return;
    }

    this.phase.set('results');
    this.chat.update((list) =>
      list.concat({
        id: crypto.randomUUID(),
        role: 'system',
        title: 'All answers captured',
        text: 'Rescore to advance to the next round.',
      })
    );
    this.rescoreFeedback.set(null);
  }

  submitAnswersAndRescore() {
    if (!this.canRescore()) return;
    if (this.rescoring()) return;

    const attacks = this.selectedAttacks();
    if (!attacks) return;

    const end = this.startTimer('submitAnswersAndRescore');
    //--
    // ✅ FAST MODE: no evalResolution, no parse update, instant advance
    if (this.fastModeEnabled()) {
      const currentRuns = this.judgeRuns();

      currentRuns.forEach((r) => {
        const prev = this.memory.get(r.judge);

        const resolvedAttackIds = prev?.resolvedAttackIds?.slice() ?? [];
        const askedAttackIds = prev?.askedAttackIds?.slice() ?? [];

        const attackId = attacks[r.judge];
        askedAttackIds.push(attackId);
        const MAX_HISTORY = 10;
        while (askedAttackIds.length > MAX_HISTORY) askedAttackIds.shift();

        // in fast mode, treat asked as resolved to force variety next round
        if (!resolvedAttackIds.includes(attackId))
          resolvedAttackIds.push(attackId);

        this.memory.set(r.judge, {
          lastScore: r.score,
          lastQuestion: r.question,
          lastAnswer: r.answer,
          lastAttackId: attackId,
          resolvedAttackIds,
          askedAttackIds,
        });
      });

      this.lastOverall = this.avg(currentRuns.map((x) => x.score));

      if (this.round() >= this.maxRounds()) {
        this.endArena();
        return;
      }

      this.round.set(this.round() + 1);
      this.updatePanelModeForRound();
      this.judgeRuns.set([]);
      this.currentJudgeIndex.set(0);
      this.rescoreFeedback.set('Rescore complete. Starting next round…');
      this.startRound();
      this.rescoring.set(false);
      end();
      return;
    }

    //--

    
    this.rescoring.set(true);
    this.rescoreFeedback.set('Rescoring…');
    const currentRuns = this.judgeRuns();

    // 1) Evaluate resolution first
    const evals = currentRuns.map((r) =>
      this.evaluateResolution(
        r.judge,
        attacks[r.judge],
        r.question,
        r.answer
      ).then((result) => ({ judge: r.judge, result }))
    );

    Promise.all(evals)
      .then((results) => {
        // 2) Update memory (preserve resolved list)
        currentRuns.forEach((r) => {
          const prev = this.memory.get(r.judge);

          const resolvedAttackIds = prev?.resolvedAttackIds?.slice() ?? [];
          const askedAttackIds = prev?.askedAttackIds?.slice() ?? [];

          const evalForJudge = results.find((x) => x.judge === r.judge)?.result;

          const attackId = attacks[r.judge];

          // ✅ always record that this attack was asked (even if unresolved)
          askedAttackIds.push(attackId);
          const MAX_HISTORY = 6; // tune: 3–10
          while (askedAttackIds.length > MAX_HISTORY) askedAttackIds.shift();

          // keep your existing resolved behavior
          if (evalForJudge === 'resolved') {
            if (!resolvedAttackIds.includes(attackId))
              resolvedAttackIds.push(attackId);
          }

          this.memory.set(r.judge, {
            lastScore: r.score,
            lastQuestion: r.question,
            lastAnswer: r.answer,
            lastAttackId: attackId,
            resolvedAttackIds,
            askedAttackIds, // ✅ NEW
          });
        });

        // 3) Update persistent arena context using ONLY last round delta
        return this.updateArenaContextFromLastRound();
      })
      .then(() => {
        // 4) Advance
        this.lastOverall = this.avg(currentRuns.map((x) => x.score));

        if (this.round() >= this.maxRounds()) {
          this.endArena();
          return;
        }

        this.round.set(this.round() + 1);
        this.updatePanelModeForRound();

        this.judgeRuns.set([]);
        this.currentJudgeIndex.set(0);

        this.rescoreFeedback.set('Rescore complete. Starting next round…');
        this.startRound();
      })
      .catch((err) => {
        console.error('rescore failed', err);
        this.rescoreFeedback.set('Rescore failed. Please try again.');
        // keep usable
        this.phase.set('results');
      })
      .finally(() => {
        this.rescoring.set(false);
        end();
      });
  }

  // ---------------- Parse + incremental update ----------------

  private async buildRoundContext(): Promise<PitchParse> {
    const end = this.startTimer('buildRoundContext');
    try {
      const mode = this.parseMode();

      // ✅ none: minimal parse, zero LLM
      if (mode === 'none') {
        return {
          version: 'none',
          ideaName: (this.profile().ideaName ?? '').trim() || 'Untitled idea',
          pitchText: (this.profile().pitch ?? '').trim(),
          claims: [],
          assumptions: [],
          openQuestions: [],
          entities: {},
        } as any;
      }

      // ✅ fast: derive parse from profile, zero LLM
      if (mode === 'fast') {
        const p = this.buildFastParseFromProfile();
        this.arenaContext.set(p);
        return p;
      }

      // full: current behavior
      if (this.round() <= 1 || !this.arenaContext()) {
        const p = await this.buildParseFromPitch();
        this.arenaContext.set(p);
        return p;
      }

      return this.arenaContext()!;
    } finally {
      end();
    }
  }

  private buildFastParseFromProfile(): PitchParse {
    const prof = this.profile();
    const ideaName = (prof.ideaName ?? '').trim() || 'Untitled idea';
    const pitchText = (prof.pitch ?? '').trim();

    const mkClaim = (id: string, type: any, text: string) => ({
      id,
      type,
      text,
      specificityScore: text?.trim() ? 0.65 : 0.2,
      confidence: 0.6,
      tags: ['profile'],
    });

    return {
      version: 'fast',
      ideaName,
      pitchText,
      claims: [
        mkClaim('c_user', 'user', prof.targetUser ?? ''),
        mkClaim('c_ctx', 'context', prof.targetContext ?? ''),
        mkClaim('c_val', 'value', prof.firstValue ?? ''),
        mkClaim('c_dist', 'distribution', prof.acquisitionPath ?? ''),
      ].filter((c) => (c.text ?? '').trim().length > 0),
      assumptions: [],
      openQuestions: [],
      entities: { buyer: false, price: false, wedge: true, metric: false },
    } as any;
  }

  /*
  private async buildRoundContext(): Promise<PitchParse> {
    const end = this.startTimer('buildRoundContext');
    try {
      // Round 1 or no context: full parse from pitch
      if (this.round() <= 1 || !this.arenaContext()) {
        const p = await this.buildParseFromPitch();
        this.arenaContext.set(p);
        return p;
      }

      // Round 2+: just return existing context (already updated after rescore)
      return this.arenaContext()!;
    } finally {
      end();
    }
  }*/

  private buildParseFromPitch(): Promise<PitchParse> {
    const end = this.startTimer('buildParseFromPitch');
    const prof = this.profile();
    const ideaName = (prof.ideaName ?? '').trim() || 'Untitled idea';
    const pitchText = (prof.pitch ?? '').trim();

    const env = { ideaName, pitchText };
    const a = promptExtractClaims(env);

            const aiUsage: AiUsageContext = {
          arenaId: this.judgesService.getArena().id,
          //sessionId: this.sessionId,
          round: this.round(),
          judgeId: 'buildParseFromPitch',
          purpose: 'parse_assumptions',
        }

    return this.geminiService
      .textPrompt(a.user, a.system, aiUsage)
      .then((rawClaims) => {
        const claimsObj = this.coerceJson(rawClaims, {
          claims: [],
          entities: {},
        });

        const base: PitchParse = {
          version: '1.0',
          ideaName,
          pitchText,
          claims: (claimsObj.claims ?? []).map((c: any, i: number) => ({
            id: String(c.id ?? `c${i + 1}`),
            type: c.type ?? 'value',
            text: String(c.text ?? ''),
            quote: c.quote ? String(c.quote) : undefined,
            specificityScore: this.clamp01(Number(c.specificityScore ?? 0.2)),
            confidence: this.clamp01(Number(c.confidence ?? 0.6)),
            tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
          })),
          assumptions: [],
          openQuestions: [],
          entities: claimsObj.entities ?? {},
        };

        const aiUsage: AiUsageContext = {
          arenaId: this.judgesService.getArena().id,
          //sessionId: this.sessionId,
          round: this.round(),
          judgeId: 'promptBuildAssumptions',
          purpose: 'parse_assumptions',
        }

        const b = promptBuildAssumptions(base);
        return this.geminiService.textPrompt(b.user, b.system, aiUsage).then((rawAssumptions) => {
          const aObj = this.coerceJson(rawAssumptions, {
            assumptions: [],
            openQuestions: [],
          });

          base.assumptions = (aObj.assumptions ?? []).map(
            (x: any, i: number) => ({
              id: String(x.id ?? `a${i + 1}`),
              claimId: String(x.claimId ?? base.claims[0]?.id ?? 'c1'),
              category: x.category ?? 'technical',
              statement: String(x.statement ?? ''),
              criticality: x.criticality ?? 'medium',
              testability: x.testability ?? 'medium',
              confidence: this.clamp01(Number(x.confidence ?? 0.6)),
            })
          );

          base.openQuestions = (aObj.openQuestions ?? [])
            .slice(0, 3)
            .map((q: any, i: number) => ({
              id: String(q.id ?? `q${i + 1}`),
              priority: q.priority ?? 'p1',
              question: String(q.question ?? ''),
              linkedTo: Array.isArray(q.linkedTo) ? q.linkedTo.map(String) : [],
            }));

          return base;
        });
      })
      .finally(end);
  }

  private async updateArenaContextFromLastRound(): Promise<void> {
    const end = this.startTimer('updateArenaContextFromLastRound');
    try {
      // ✅ demo speed: do not call LLM to update parse
      if (this.fastModeEnabled() || this.parseMode() !== 'full') return;

      const prev = this.arenaContext();
      if (!prev) return;

      const delta = ArenaTranscript.lastRoundDelta(this.chat());
      // only last round judge Qs + founder As
      if (!delta.trim()) return;

      const system = promptUpdateParseSystem();
      const user = [
        'BASE CONTEXT JSON:',
        JSON.stringify(prev),
        '',
        'NEW ROUND DELTA (Q/A only):',
        delta,
      ].join('\n');

      

      const raw = await this.geminiService.textPrompt(user, system);
      const obj = this.coerceJson(raw, null);
      if (!obj) return;

      // minimal merge: replace claims/assumptions if provided, otherwise keep
      const next: PitchParse = {
        ...prev,
        claims: Array.isArray(obj.claims) ? obj.claims : prev.claims,
        assumptions: Array.isArray(obj.assumptions)
          ? obj.assumptions
          : prev.assumptions,
        openQuestions: Array.isArray(obj.openQuestions)
          ? obj.openQuestions.slice(0, 3)
          : prev.openQuestions,
        entities: obj.entities ?? prev.entities,
      };

      this.arenaContext.set(this.normalizeParse(next));
    } finally {
      end();
    }
  }

  private normalizeParse(p: PitchParse): PitchParse {
    return {
      ...p,
      claims: (p.claims ?? []).slice(0, 10).map((c, i) => ({
        id: String(c.id ?? `c${i + 1}`),
        type: (c.type as any) ?? 'value',
        text: String(c.text ?? ''),
        quote: c.quote ? String(c.quote) : undefined,
        specificityScore: this.clamp01(
          Number((c as any).specificityScore ?? 0.2)
        ),
        confidence: this.clamp01(Number((c as any).confidence ?? 0.6)),
        tags: Array.isArray((c as any).tags) ? (c as any).tags.map(String) : [],
      })),
      assumptions: (p.assumptions ?? []).slice(0, 10).map((a, i) => ({
        id: String(a.id ?? `a${i + 1}`),
        claimId: String(a.claimId ?? p.claims?.[0]?.id ?? 'c1'),
        category: (a.category as any) ?? 'technical',
        statement: String(a.statement ?? ''),
        criticality: (a.criticality as any) ?? 'medium',
        testability: (a.testability as any) ?? 'medium',
        confidence: this.clamp01(Number((a as any).confidence ?? 0.6)),
      })),
      openQuestions: (p.openQuestions ?? []).slice(0, 3).map((q, i) => ({
        id: String(q.id ?? `q${i + 1}`),
        priority: (q.priority as any) ?? 'p1',
        question: String(q.question ?? ''),
        linkedTo: Array.isArray((q as any).linkedTo)
          ? (q as any).linkedTo.map(String)
          : [],
      })),
    };
  }

  // ---------------- Attack selection ----------------

  private selectAttacks(parse: PitchParse): SelectedAttacks {
    const end = this.startTimer('selectAttacks');
    try {
      const avgSpec = this.avg(
        (parse.claims ?? []).map((c) => c.specificityScore)
      );
      const assumptionText = (parse.assumptions ?? [])
        .map((a) => a.statement.toLowerCase())
        .join(' | ');

      const usedCategories = new Set<AttackCategory>();

const pick = (judge: Exclude<string, 'host'>) => {
  const mem = this.memory.get(judge);
  const resolved = new Set(mem?.resolvedAttackIds ?? []);
  const all = this.vectorsFor(judge) ?? [];
  const asked = new Set(mem?.askedAttackIds ?? []);

  // available = not resolved and not recently asked
  const available = all.filter((v) => v?.id && !resolved.has(v.id) && !asked.has(v.id));

  // ✅ if empty, allow re-asking but still diversify by qType
  const pool = available.length ? available : all.filter(v => v?.id);

  if (!pool.length) return mem?.lastAttackId || 'fallback_no_vectors';

  // triggers
  const triggered = pool.filter((v) => {
    const min = v.triggers?.minAvgSpecificity;
    if (typeof min === 'number' && !(avgSpec < min)) return false;

    const inc = v.triggers?.assumptionIncludes ?? [];
    if (inc.length && !inc.some((t) => assumptionText.includes(String(t).toLowerCase()))) return false;

    return true;
  });
  const candidates = triggered.length ? triggered : pool;

  // ✅ qType history across rounds
  const qHist = this.usedQTypesByJudge.get(judge) ?? [];
  const qSet = new Set(qHist);

  const firstUnusedQType = candidates.find((v) => !!(v as any).qType && !qSet.has(String((v as any).qType)));
  const firstUnusedCategory = candidates.find((v) => v.category && !usedCategories.has(v.category));
  const chosen = firstUnusedQType ?? firstUnusedCategory ?? candidates[0];

  if (!chosen) return mem?.lastAttackId || 'fallback_no_candidate';

  const qt = String((chosen as any).qType ?? '');
  if (qt) {
    qHist.push(qt);
    // keep short memory window
    while (qHist.length > 8) qHist.shift();
    this.usedQTypesByJudge.set(judge, qHist);
  }

  usedCategories.add(chosen.category);
  this.lastCategory.set(judge, chosen.category);

  return chosen.id;
};


      /*
      const usedQTypes = new Set<string>(); // ✅ NEW

      const pick = (judge: Exclude<string, 'host'>) => {
        const mem = this.memory.get(judge);

        const resolved = new Set(mem?.resolvedAttackIds ?? []);
        const all = this.vectorsFor(judge) ?? [];
        const asked = new Set(mem?.askedAttackIds ?? []);
        const available = all.filter(
          (v) => v?.id && !resolved.has(v.id) && !asked.has(v.id)
        );

        if (!available.length) {
          console.warn(
            `[PitchArena] No attack vectors available for judge=${judge} mode=${this.panelMode()}`
          );
          return mem?.lastAttackId || 'fallback_no_vectors';
        }

        const triggered = available.filter((v) => {
          const min = v.triggers?.minAvgSpecificity;
          if (typeof min === 'number' && !(avgSpec < min)) return false;

          const inc = v.triggers?.assumptionIncludes ?? [];
          if (
            inc.length &&
            !inc.some((t) => assumptionText.includes(String(t).toLowerCase()))
          )
            return false;

          return true;
        });

        const candidates = triggered.length ? triggered : available;

        // ✅ 1) Prefer unused qType (question FORM)
        const firstUnusedQType = candidates.find(
          (v) => !!v.qType && !usedQTypes.has(v.qType)
        );

        // ✅ 2) Then prefer unused category (topic)
        const firstUnusedCategory = candidates.find(
          (v) => v.category && !usedCategories.has(v.category)
        );

        const chosen = firstUnusedQType ?? firstUnusedCategory ?? candidates[0];

        if (!chosen) {
          console.warn(
            `[PitchArena] Candidate selection failed for judge=${judge}`
          );
          return mem?.lastAttackId || 'fallback_no_candidate';
        }

        if (chosen.qType) usedQTypes.add(chosen.qType);

        usedCategories.add(chosen.category);
        this.lastCategory.set(judge, chosen.category);

        return chosen.id;
      };*/

      const panelJudges = this.judges
        .filter((j) => j.id !== 'host')
        .map((j) => j.id as Exclude<string, 'host'>);

      const selected = {} as SelectedAttacks;
      for (const judgeId of panelJudges) {
        selected[judgeId] = pick(judgeId);
      }
      return selected;
    } finally {
      end();
    }
  }

  exportConversation() {
    const path = this.route.snapshot.paramMap.get('path') ?? 'pitch-arena';
    exportConversation({
      phase: this.phase(),
      round: this.round(),
      profile: this.profile(),
      judgeRuns: this.judgeRuns(),
      chat: this.chat(),
      endSummary: this.endSummary(),
      filenamePrefix: path,
    });
  }

  judgeBadge(judge: string) {
    if (judge === 'host') return '🎤';
    if (judge === 'vc') return '💼';
    if (judge === 'cto') return '🛠️';
    return '🧩';
  }

  phaseLabel = computed(() => {
    const p = this.phase();
    if (p === 'intro') return 'Warm-up';
    if (p === 'judging') return 'Judging';
    if (p === 'answering') return 'Answering';
    if (p === 'results') return 'Scored';
    return 'Ended';
  });

  judgeState(judge: string): 'idle' | 'active' | 'passed' {
    if (this.phase() === 'intro') return judge === 'host' ? 'active' : 'idle';
    if (judge === 'host') return 'idle';

    const runs = this.judgeRuns();
    if (!runs.length) return 'idle';

    const idx = runs.findIndex((r) => r.judge === judge);
    if (idx === -1) return 'idle';

    if (this.phase() === 'answering') {
      if (idx === this.currentJudgeIndex()) return 'active';
      if (idx < this.currentJudgeIndex()) return 'passed';
      return 'idle';
    }

    if (this.phase() === 'results') return 'passed';
    return 'idle';
  }

  repromptInput = signal<string>('');
  reprompting = signal<boolean>(false);

  repromptConversation() {
    const prompt = (this.repromptInput() ?? '').trim();
    if (!prompt || this.reprompting()) return;

    const end = this.startTimer('repromptConversation');
    this.reprompting.set(true);

    const transcript = ArenaTranscript.conversation(this.chat());
    const user = ['CONVERSATION:', transcript, '', 'REQUEST:', prompt].join(
      '\n'
    );
    const system =
      'You are a sharp pitch coach reviewing the full conversation. Use the transcript to craft a concise follow-up or advice. Avoid markdown.';

    const aiUsage: AiUsageContext = {
      arenaId: this.judgesService.getArena().id,
      //sessionId: this.sessionId,
      round: this.round(),
      judgeId: 'repromptConversation',
      purpose: 'reprompt',
    }


    this.geminiService
      .textPrompt(user, system, aiUsage)
      .then((res) => {
        const text =
          typeof res === 'string' ? res : JSON.stringify(res, null, 2);

        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'system',
            title: 'Re-prompt',
            text: text.slice(0, 1600),
          })
        );
      })
      .catch((err) => console.error('reprompt failed', err))
      .finally(() => {
        this.reprompting.set(false);
        end();
      });
  }

  judgeTone = signal<'supportive' | 'direct' | 'tough'>('direct');

  // ---------------- Judge call ----------------

  private callJudgeWithAttack(
    judge: Exclude<string, 'host'>,
    env: { ideaName: string; pitch: string; round: number },
    parse: PitchParse,
    attackId: string
  ): Promise<{ judge: Exclude<string, 'host'>; score: number; comment: string; question: string }> {

    const end = this.startTimer(`callJudgeWithAttack:${judge}`);
    const vector = this.vectorsFor(judge).find((v) => v.id === attackId);
    const mem = this.memory.get(judge);

    const previouslyAsked =
      !!mem &&
      (mem.lastAttackId === attackId ||
        this.isSimilarQuestion(mem.lastQuestion ?? '', vector?.questionExamples ?? []));

    const lastTopic = this.lastCategory.get(judge) ?? null;

    const system = this.judgesService.attackSystemPrompt({
      judgeId: judge,
      vector,
      round: this.round(),
      previouslyAsked,
      lastTopic,
      tone: this.judgeTone(),
      mode: this.panelMode(),
    });

    // ✅ shrink payload for speed: don’t stringify huge objects
    const user = [
      `ROUND: ${env.round}`,
      `IDEA NAME: ${env.ideaName}`,
      `PITCH: ${env.pitch}`,
      '',
      'CONTEXT (TOP):',
      JSON.stringify({
        topClaims: (parse.claims ?? []).slice(0, 4),
        assumptions: (parse.assumptions ?? []).slice(0, 3),
        attackId,
        qType: (vector as any)?.qType ?? null,
        category: vector?.category ?? null,
      }),
    ].join('\n');

    //const TIMEOUT_MS = 2200; // tune: 1500–3500 for demo mode

    const llmCall = this.geminiService.textPrompt(user, system);

    return this.withTimeout(
      llmCall.then((raw) => {
        const json = this.coerceJudgeJson(raw, judge);
        return {
          judge,
          score: this.clampScoreByMode(json.score),
          comment: String(json.comment ?? '').trim(),
          question: String(json.question ?? '').trim(),
        };
      }),
      this.constraints().llmTimeoutMs,
      () => {
        const fb = this.fallbackQuestion(judge, vector);
        return { judge, ...fb };
      }
    ).finally(end);
  }

  private fallbackQuestion(judge: Exclude<string, 'host'>, vector?: any): { score: number; comment: string; question: string } {
  const mem = this.memory.get(judge);
  const qType = String(vector?.qType ?? 'generic');
  const cat = String(vector?.category ?? 'general');

  // rotate index from history so it changes each round even if timeout repeats
  const askedCount = (mem?.askedAttackIds?.length ?? 0) + (mem?.resolvedAttackIds?.length ?? 0);
  const rot = askedCount % 4;

  const bank: Record<string, string[]> = {
    invoice: [
      "Describe the first invoice: who pays, for what outcome, and how often?",
      "What would the receipt say in plain words (buyer + outcome)?",
      "What’s the pricing unit that fits best (per month/seat/usage) and why?"
    ],
    substitute_map: [
      "What do they do today step-by-step (tools/habits) and where does it break?",
      "Walk me through the current workaround in 4 steps; which step is painful?",
      "What’s the ‘good enough’ alternative and what’s the one thing it can’t do?"
    ],
    switching_pain: [
      "Give me one real moment where the current approach fails badly enough to force change.",
      "What’s the breaking incident that makes them actively seek a new solution?",
      "What’s the consequence when they keep the status quo for another month?"
    ],
    channel_first20: [
      "Where do the first 20 users come from (one exact community/place/partner)?",
      "Name one specific distribution hook you can run this week to get 10 users.",
      "What’s your easiest ‘already there’ channel and why is it credible?"
    ],
    numbers_value: [
      "In a typical week per user, what do you save or improve (time/cost/errors)?",
      "Give one rough number: value per user per month (even a guess).",
      "What’s your target latency/time-to-value for a first session (in minutes)?"
    ],
    competitor_diff: [
      "Name the closest alternative and the one defensible difference you keep.",
      "If they copied your UI, what would they still be missing?",
      "Who do users compare you to in their head today?"
    ],
    retention_loop: [
      "What changes week-to-week that makes users return naturally?",
      "Why would they come back a second time instead of moving on?",
      "What’s the repeat trigger that creates habit (not ‘because it’s cool’)?"
    ],
    generic: [
      "What’s one concrete end-to-end example (who, when, outcome)?",
      "What’s the smallest complete v1 that still proves the hard part works?",
      "What’s the single biggest risk and the next test you’ll run in 7 days?"
    ],
  };

  const list = bank[qType] ?? bank['generic'];
  const question = list[rot] ?? list[0];

  return {
    score: 6.0,
    comment: `Quick fallback (timeout): I need one sharper detail (${cat}/${qType}).`,
    question,
  };
}


  private isSimilarQuestion(lastQ: string, examples: string[]): boolean {
    const a = this.norm(lastQ);
    if (!a) return false;

    // If last question is very similar to any example style, treat as “already asked”
    return examples.some((ex) => {
      const b = this.norm(ex);
      if (!b) return false;

      // cheap similarity: shared-keyword overlap
      const A = new Set(a.split(' '));
      const B = new Set(b.split(' '));
      let hit = 0;
      for (const w of A) if (B.has(w)) hit++;

      const denom = Math.max(6, Math.min(A.size, B.size));
      return hit / denom >= 0.55;
    });
  }

  private norm(s: string): string {
    return String(s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private clampScoreByMode(n: number) {
    const s = this.clampScore(n);
    if (this.panelMode() === 'discovery')
      return Math.max(4.0, Math.min(7.0, s));
    return s;
  }

  private coerceJudgeJson(
    raw: any,
    expectedJudge: Exclude<string, 'host'>
  ): JudgeJson {
    const obj = this.coerceJson(raw, null);
    if (!obj) {
      return {
        judge: expectedJudge,
        score: 5.0,
        comment: 'No comment returned.',
        question: 'Be specific: who pays, why now, and what is the first MVP?',
      } as any;
    }
    return {
      judge: obj.judge ?? expectedJudge,
      score: Number(obj.score ?? 0),
      comment: String(obj.comment ?? ''),
      question: String(obj.question ?? ''),
    } as any;
  }

  // ---------------- Resolution eval ----------------

  private evaluateResolution(
    judge: Exclude<string, 'host'>,
    attackId: string,
    question: string,
    answer: string
  ): Promise<string> {
    const end = this.startTimer(`evaluateResolution:${judge}`);
    const system = [
      'You are evaluating whether a founder answered a judge’s concern.',
      '',
      'Return ONLY one word:',
      '- "resolved" (core concern addressed clearly)',
      '- "partial" (some progress, but still gaps)',
      '- "unresolved" (did not answer the concern)',
      '',
      'Be strict but fair.',
    ].join('\n');

    const user = [
      `ISSUE ID: ${attackId}`,
      `QUESTION: ${question}`,
      `FOUNDER ANSWER: ${answer}`,
    ].join('\n');

    return this.geminiService
      .textPrompt(user, system)
      .then((r) => {
        const s = String(r).toLowerCase();
        if (s.includes('resolved')) return 'resolved';
        if (s.includes('partial')) return 'partial';
        return 'unresolved';
      })
      .catch(() => 'unresolved')
      .finally(end);
  }

  // ---------------- Chat helpers ----------------

  private pushJudgeBubble(run: JudgeRun) {
    const title = `${run.judgeLabel} • ${run.dimension}`;
    const prefix =
      run.delta === null
        ? `Score: ${run.score.toFixed(1)}`
        : `Score: ${run.score.toFixed(1)} (${
            run.delta >= 0 ? '+' : ''
          }${run.delta.toFixed(1)})`;

    this.chat.update((list) =>
      list.concat({
        id: crypto.randomUUID(),
        role: 'judge',
        judgeId: run.judge,
        title,
        text: `${prefix}\n${run.comment}\n\n${run.question}`,
      })
    );
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

  private clamp01(n: number) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(1, x));
  }

  private clampScore(n: number) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
  }

  private avg(nums: number[]) {
    return nums.reduce((a, n) => a + n, 0) / Math.max(1, nums.length);
  }

  private scrollChatToBottom() {
    const el = this.chatWindow?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }

  // ---------------- Ending + summary ----------------

  private endArena() {
    const end = this.startTimer('endArena');
    this.phase.set('ended');

    this.chat.update((list) =>
      list.concat({
        id: crypto.randomUUID(),
        role: 'system',
        title: 'Pitch Arena complete',
        text: `That’s the end: ${this.maxRounds()} round(s). Final score: ${this.overallScore().toFixed(
          1
        )}.`,
      })
    );

    this.summarizing.set(true);
    this.generateEndSummary()
      .then((summary) => {
        this.endSummary.set(summary);

        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'system',
            title: 'Panel verdict',
            text: [
              `${summary.verdict.toUpperCase()} • ${summary.oneLiner}`,
              '',
              'Top risks:',
              ...summary.biggestRisks.slice(0, 3).map((x) => `- ${x}`),
              '',
              'Next 7 days:',
              ...summary.next7Days.slice(0, 5).map((x) => `- ${x}`),
            ].join('\n'),
          })
        );
      })
      .catch((err) => console.error('end summary failed', err))
      .finally(() => {
        this.summarizing.set(false);
        end();
      });
  }

  private normalizeVerdict(v: any): Verdict {
    const s = String(v ?? '').toLowerCase();
    if (s.includes('pass') || s.includes('go') || s.includes('strong'))
      return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject'))
      return 'fail';
    return 'maybe';
  }

  //todo make this function fully paramatised
  private generateEndSummary(): Promise<EndSummary> {
    const end = this.startTimer('generateEndSummary');
    const profile = this.profile();
    const transcript = ArenaTranscript.conversation(this.chat());
    const finalScore = Number(this.overallScore().toFixed(1));

    const system = [
      'You are the Pitch Arena panel chair writing the final verdict.',
      '',
      'Write a practical summary and action plan.',
      'Be constructive, not aggressive.',
      'No fluff. No generic advice.',
      '',
      '- IMPORTANT: Do not include double quotes (") inside any string values.',
      '- If you need emphasis, use parentheses or single quotes instead.',
      '- Output must be valid JSON parseable by JSON.parse().',
      JSON.stringify({
        finalScore: 0,
        verdict: 'maybe',
        oneLiner: '...',
        strengths: ['...'],
        biggestRisks: ['...'],
        assumptionsToTest: [
          { assumption: '...', test: '...', successMetric: '...' },
        ],
        next7Days: ['...'],
        next30Days: ['...'],
        recommendedMvp: { user: '...', flow: ['...'], mustCut: ['...'] },
        pricingAndGtm: {
          whoPays: '...',
          pricingIdea: '...',
          firstChannel: '...',
        },
      }),
      '',
      'Rules:',
      '- strengths, biggestRisks: 3–5 items each',
      '- assumptionsToTest: 2–4 items',
      '- next7Days and next30Days: 5–8 items each',
      '- recommendedMvp.flow: 4–7 steps',
      '- mustCut: 3–6 items',
      '- Keep every string under ~160 chars.',
      '- No markdown, no code fences.',
    ].join('\n');

    const user = [
      'FOUNDER PROFILE:',
      JSON.stringify(profile),
      '',
      `FINAL SCORE: ${finalScore}`,
      '',
      'FULL TRANSCRIPT:',
      transcript,
    ].join('\n');

    const aiUsage: AiUsageContext = {
      arenaId: this.judgesService.getArena().id,
      //sessionId: this.sessionId,
      round: this.round(),
      judgeId: 'report',
      purpose: 'final_summary',
    }

    return this.geminiService
      .textPrompt(user, system, aiUsage)
      .then((raw) => {
        console.log(raw);
        const json = coerceJson(raw, null);

        console.log(json);

        // fallback always valid
        const fallback: EndSummary = {
          finalScore,
          verdict: 'maybe',
          oneLiner: 'Summary unavailable (model returned invalid JSON).',
          strengths: [],
          biggestRisks: [],
          assumptionsToTest: [],
          next7Days: [],
          next30Days: [],
          recommendedMvp: { user: '', flow: [], mustCut: [] },
          pricingAndGtm: { whoPays: '', pricingIdea: '', firstChannel: '' },
        };

        if (!json || typeof json !== 'object') return fallback;

        const normalizeVerdict = (v: any): EndSummary['verdict'] => {
          const s = String(v ?? '').toLowerCase();

          // accept lots of model variants
          if (
            s === 'pass' ||
            s.includes('strong yes') ||
            s.includes('yes') ||
            s.includes('go') ||
            s.includes('ship')
          )
            return 'pass';

          if (
            s === 'fail' ||
            s.includes('no') ||
            s.includes('reject') ||
            s.includes('not ready') ||
            s.includes('needs more') ||
            s.includes('validation')
          )
            return 'maybe'; // map “needs more validation” to maybe

          if (s === 'maybe' || s.includes('unclear') || s.includes('neutral'))
            return 'maybe';

          return 'maybe';
        };

        const asStringArray = (x: any) =>
          Array.isArray(x)
            ? x.map((v) => String(v ?? '').trim()).filter(Boolean)
            : [];

        const asAssumptions = (x: any): EndSummary['assumptionsToTest'] =>
          Array.isArray(x)
            ? x
                .map((a: any) => ({
                  assumption: String(a?.assumption ?? '').trim(),
                  test: String(a?.test ?? '').trim(),
                  successMetric: String(a?.successMetric ?? '').trim(),
                }))
                .filter((a) => a.assumption || a.test || a.successMetric)
            : [];

        const safe: EndSummary = {
          finalScore,
          verdict: normalizeVerdict((json as any).verdict),
          oneLiner:
            String((json as any).oneLiner ?? '').trim() || fallback.oneLiner,

          strengths: asStringArray((json as any).strengths),
          biggestRisks: asStringArray((json as any).biggestRisks),
          assumptionsToTest: asAssumptions((json as any).assumptionsToTest),

          next7Days: asStringArray((json as any).next7Days),
          next30Days: asStringArray((json as any).next30Days),

          recommendedMvp: {
            user: String((json as any)?.recommendedMvp?.user ?? '').trim(),
            flow: asStringArray((json as any)?.recommendedMvp?.flow),
            mustCut: asStringArray((json as any)?.recommendedMvp?.mustCut),
          },

          pricingAndGtm: {
            whoPays: String((json as any)?.pricingAndGtm?.whoPays ?? '').trim(),
            pricingIdea: String(
              (json as any)?.pricingAndGtm?.pricingIdea ?? ''
            ).trim(),
            firstChannel: String(
              (json as any)?.pricingAndGtm?.firstChannel ?? ''
            ).trim(),
          },
        };

        return safe;
      })
      .finally(end);
  }

  /*  
  private conversationTranscript() {
    return this.chat()
      .map((m) => {
        const speaker =
          m.role === 'judge' ? m.title || `Judge:${m.judgeId ?? ''}` : m.role;
        return `${speaker}:\n${m.text}`;
      })
      .join('\n\n');
  }*/

  // ---------------- Voice ----------------

  currentlyPlayingMsgId = this.voice.currentlyPlayingMsgId;
  recording = this.voice.recording;

  playMsg(msg: ChatMsg) {
    this.voice.playMsg(msg);
  }

  ensureVoice(msgId: string) {
    this.voice.ensureVoice(msgId, this.chat, this.judgeVoices);
  }

  startRecording() {
    this.voice.startRecording((text) => this.submitText(text));
  }

  stopRecording() {
    this.voice.stopRecording();
  }

  private submitText(text: string) {
    const cleaned = (text ?? '').trim();
    if (!cleaned) return;

    this.chat.update((list) =>
      list.concat({ id: crypto.randomUUID(), role: 'user', text: cleaned })
    );

    if (this.phase() === 'intro') return this.hostTurn(cleaned);
    if (this.phase() === 'answering') return this.panelAnswerTurn(cleaned);
  }
}
