import { GeminiService } from '#services/ai/gemini.service';
import { SpeechService } from '#services/ai/speech.eleven.service';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from '@angular/fire/storage';
import { FormsModule } from '@angular/forms';
import { JudgesService } from './services/judges.service';
import { ArenaConfig } from './models/arena-config';
import { AttackCategory } from './models/pitch';
import { ActivatedRoute } from '@angular/router';

// ---------------- Types ----------------

//TODO verify all code is being used

type Phase = 'intro' | 'judging' | 'answering' | 'results' | 'ended';
type PanelMode = 'discovery' | 'interrogation';

type ArenaProfile = {
  founderName: string;
  ideaName: string;
  pitch: string;

  targetUser?: string;
  targetContext?: string;
  firstValue?: string;
  acquisitionPath?: string;
  inputSource?: string;
};

export type ChatMsg = {
  id: string;
  role: 'judge' | 'user' | 'system';
  judgeId?: string;
  title?: string;
  text: string;

  // voice
  voiceId?: string;
  audioUrl?: string;
  audioState?: 'idle' | 'loading' | 'ready' | 'error';
};

type JudgeRun = {
  judge: Exclude<string, 'host'>;
  judgeLabel: string;
  dimension: string;
  score: number;
  delta: number | null;
  comment: string;
  question: string;
  answer: string;
};

type SelectedAttacks = Record<Exclude<string, 'host'>, string>;

type Claim = {
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
  specificityScore: number; // 0..1
  confidence: number; // 0..1
  tags: string[];
};

type Assumption = {
  id: string;
  claimId: string;
  category: 'technical' | 'market' | 'product' | 'execution' | 'legal';
  statement: string;
  criticality: 'existential' | 'high' | 'medium' | 'low';
  testability: 'high' | 'medium' | 'low';
  confidence: number; // 0..1
};

type OpenQuestion = {
  id: string;
  priority: 'p0' | 'p1' | 'p2';
  question: string;
  linkedTo: string[];
};

type PitchParse = {
  version: string;
  ideaName: string;
  pitchText: string;
  claims: Claim[];
  assumptions: Assumption[];
  openQuestions: OpenQuestion[];
  entities?: Record<string, boolean>;
};

type HostJson = {
  phase: 'intro';
  ready: boolean;
  nextQuestion: string;
  profile?: Partial<ArenaProfile>;
  comment?: string;
};

type JudgeJson = {
  judge: Exclude<string, 'host'>;
  score: number;
  comment: string;
  question: string;
};

type ArenaMemory = {
  lastScore: number;
  lastQuestion: string;
  lastAnswer: string;
  lastAttackId: string;
  resolvedAttackIds: string[];
};

type EndSummary = {
  finalScore: number;
  verdict: 'no' | 'rework' | 'maybe' | 'yes';
  oneLiner: string;
  strengths: string[];
  biggestRisks: string[];
  assumptionsToTest: {
    assumption: string;
    test: string;
    successMetric: string;
  }[];
  next7Days: string[];
  next30Days: string[];
  recommendedMvp: { user: string; flow: string[]; mustCut: string[] };
  pricingAndGtm: { whoPays: string; pricingIdea: string; firstChannel: string };
};

@Component({
  selector: 'app-pitch-arena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pitch-arena.html',
})
export class PitchArena {
  private http = inject(HttpClient);
  ai = inject(GeminiService);
  speech = inject(SpeechService);
  private judgesService = inject(JudgesService);

  // ---------------- Config ----------------

  judges: Array<{ id: string; label: string; dimension: string }> = [];
  judgeVoices: Record<string, string> = {};

  maxRounds = signal<number>(3);
  round = signal<number>(1);

  isFinalRound = computed(() => this.round() >= this.maxRounds());
  roundLabel = computed(() => `Round ${this.round()} / ${this.maxRounds()}`);

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
    this.chat.set([
      {
        id: crypto.randomUUID(),
        role: 'judge',
        judgeId: 'host',
        title: 'Host • Warm-up',
        text: 'Welcome to Pitch Arena, what is your name?',
      },
    ]);
  }

ngOnInit() {
  const path = this.route.snapshot.paramMap.get("path");
  if (path) this.loadArena(path);

  const qp = this.route.snapshot.queryParamMap;

  const round = Number(qp.get('round') ?? '1');
  const mode = (qp.get('mode') as any) as PanelMode | null;
  const autoProfile = qp.get('autoProfile') === '1';
  const ctx = qp.get('ctx') === '1';

  if (autoProfile) {
    this.profile.set({
      founderName: 'Test Founder',
      ideaName: 'Test Idea',
      pitch: 'A short test pitch for faster iteration.',
      targetUser: 'Busy professionals',
      targetContext: 'Mobile, on the go',
      firstValue: 'Saves 30 minutes/day',
      acquisitionPath: 'Word of mouth',
      inputSource: 'Personal pain',
    });
    this.phase.set('judging'); // or set intro complete then startRound
    this.chat.update(list => list.concat({
      id: crypto.randomUUID(),
      role: 'system',
      title: 'Dev',
      text: 'Auto-profile loaded. Skipping warm-up.',
    }));
  }

  if (ctx) {
    const fake: PitchParse = {
      version: 'dev',
      ideaName: 'Test Idea',
      pitchText: 'A short test pitch for faster iteration.',
      claims: [
        { id: 'c1', type: 'value', text: 'Saves time', specificityScore: 0.7, confidence: 0.7, tags: ['core'] },
        { id: 'c2', type: 'user', text: 'Busy professionals', specificityScore: 0.6, confidence: 0.7, tags: ['user'] },
      ],
      assumptions: [
        { id: 'a1', claimId: 'c1', category: 'market', statement: 'Users will switch tools', criticality: 'medium', testability: 'high', confidence: 0.6 },
      ],
      openQuestions: [
        { id: 'q1', priority: 'p1', question: 'What is the wedge?', linkedTo: ['a1'] },
      ],
      entities: { buyer: false, price: false, metric: true, data: false, time: true, wedge: true },
    };
    this.arenaContext.set(fake);
  }

  if (round > 1) this.round.set(round);
  if (mode) this.panelMode.set(mode);

  // Start immediately if requested
  if (qp.get('start') === '1') {
    // ensure arenaLoaded first
    const tick = () => this.arenaLoaded() ? this.startRound() : setTimeout(tick, 50);
    tick();
  }
}


  private async loadArena(path) {
    const cfg = await firstValueFrom(
      this.http.get<ArenaConfig>('/assets/arenas/' + path + ".json")
    );
    console.log(cfg)
    
    this.judgesService.useArenaConfig(cfg);
    this.judges = this.judgesService.getJudges();
    this.judgeVoices = this.judgesService.getJudgeVoices();
    this.arenaLoaded.set(true);

    console.log(this.judgesService.getArena())
    
  }

  reset() {
    this.phase.set('intro');
    this.round.set(1);
    this.panelMode.set('discovery');

    this.profile.set({ founderName: '', ideaName: '', pitch: '' });

    this.chat.set([
      {
        id: crypto.randomUUID(),
        role: 'judge',
        judgeId: 'host',
        title: 'Host • Warm-up',
        text: 'Welcome to Pitch Arena. In one line: who are you?',
      },
    ]);

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
    const prof = this.profile();
    const lastHostQ = this.lastJudgeQuestionText('host') ?? 'Warm-up';

    const system = this.judgesService.hostSystemPrompt();
    const user = this.judgesService.hostUserPrompt(prof, lastHostQ, userAnswer);

    this.ai
      .textPrompt(user, system)
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
      });
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
  const panelJudges = this.judges.filter(j => j.id !== 'host').map(j => j.id as Exclude<string,'host'>);
  const ok = panelJudges.every(j => (this.judgesService.getVectors(j, target) ?? []).length > 0);

  this.panelMode.set(ok ? target : 'discovery');
}

  private vectorsFor(judge: Exclude<string, 'host'>) {
    return this.judgesService.getVectors(judge, this.panelMode());
  }

  devJudgeOnly = signal<Exclude<string,'host'> | 'all'>('all');

  startRound() {
    if (this.judgingInFlight()) return;
    if (this.phase() === 'ended') return;
    if (this.round() > this.maxRounds()) return;

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
          .filter(j => j.id !== 'host')
          .map(j => j.id as Exclude<string,'host'>);

        const chosen = this.devJudgeOnly() === 'all'
          ? panelJudges
          : panelJudges.filter(j => j === this.devJudgeOnly());

        const calls = chosen.map(j => this.callJudgeWithAttack(j, env, ctx, attacks[j]));


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
          const evalForJudge = results.find((x) => x.judge === r.judge)?.result;

          if (evalForJudge === 'resolved') {
            const id = attacks[r.judge];
            if (!resolvedAttackIds.includes(id)) resolvedAttackIds.push(id);
          }

          this.memory.set(r.judge, {
            lastScore: r.score,
            lastQuestion: r.question,
            lastAnswer: r.answer,
            lastAttackId: attacks[r.judge],
            resolvedAttackIds,
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
      });
  }

  // ---------------- Parse + incremental update ----------------

  private buildRoundContext(): Promise<PitchParse> {
    // Round 1 or no context: full parse from pitch
    if (this.round() <= 1 || !this.arenaContext()) {
      return this.buildParseFromPitch().then((p) => {
        this.arenaContext.set(p);
        return p;
      });
    }

    // Round 2+: just return existing context (already updated after rescore)
    return Promise.resolve(this.arenaContext()!);
  }

  private buildParseFromPitch(): Promise<PitchParse> {
    const prof = this.profile();
    const ideaName = (prof.ideaName ?? '').trim() || 'Untitled idea';
    const pitchText = (prof.pitch ?? '').trim();

    const env = { ideaName, pitchText };
    const a = this.promptExtractClaims(env);

    return this.ai.textPrompt(a.user, a.system).then((rawClaims) => {
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

      const b = this.promptBuildAssumptions(base);
      return this.ai.textPrompt(b.user, b.system).then((rawAssumptions) => {
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
    });
  }

  private updateArenaContextFromLastRound(): Promise<void> {
    const prev = this.arenaContext();
    if (!prev) return Promise.resolve();

    const delta = this.lastRoundDeltaTranscript(); // only last round judge Qs + founder As
    if (!delta.trim()) return Promise.resolve();

    const system = this.promptUpdateParseSystem();
    const user = [
      'BASE CONTEXT JSON:',
      JSON.stringify(prev),
      '',
      'NEW ROUND DELTA (Q/A only):',
      delta,
    ].join('\n');

    return this.ai.textPrompt(user, system).then((raw) => {
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
    });
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

  private promptUpdateParseSystem(): string {
    return [
      'You maintain a structured pitch context across rounds.',
      'You will receive a BASE CONTEXT JSON and a NEW ROUND DELTA transcript (Q/A).',
      '',
      'TASK:',
      '- Update/extend claims ONLY if the founder revealed new concrete info.',
      '- Update assumptions to reflect newly clarified constraints.',
      '- Keep it stable: do NOT rewrite everything unless the delta forces it.',
      '',
      'Return ONLY valid JSON with EXACT keys:',
      '{"claims":[{"id":"c1","type":"value|user|market|technical|goToMarket|pricing|competition|ops","text":"...","quote":"...","specificityScore":0.0,"confidence":0.0,"tags":["core"]}],"assumptions":[{"id":"a1","claimId":"c1","category":"technical|market|product|execution|legal","statement":"...","criticality":"existential|high|medium|low","testability":"high|medium|low","confidence":0.0}],"openQuestions":[{"id":"q1","priority":"p0|p1|p2","question":"...","linkedTo":["a1","c1"]}],"entities":{"buyer":false,"price":false,"metric":false,"data":false,"time":false,"wedge":false}}',
      '',
      'Rules:',
      '- 6–10 claims',
      '- 6–10 assumptions',
      '- 0–3 openQuestions',
      '- Keep strings short (<160 chars).',
      '- No markdown, no code fences, no extra keys.',
    ].join('\n');
  }

  private promptExtractClaims(env: { ideaName: string; pitchText: string }) {
    const system = [
      'You extract structured CLAIMS from startup pitches.',
      'Return ONLY valid JSON. No markdown.',
      'Schema:',
      '{"claims":[{"id":"c1","type":"value|user|market|technical|goToMarket|pricing|competition|ops","text":"...","quote":"...","specificityScore":0.0,"confidence":0.0,"tags":["core"]}],"entities":{"buyer":false,"price":false,"metric":false,"data":false,"time":false,"wedge":false}}',
      '',
      'Rules:',
      '- 6 to 10 claims.',
      '- specificityScore: 0..1 (0 vague, 1 very concrete).',
      '- confidence: 0..1.',
    ].join('\n');

    const user = [`IDEA NAME: ${env.ideaName}`, `PITCH:`, env.pitchText].join(
      '\n'
    );
    return { system, user };
  }

  private promptBuildAssumptions(parse: PitchParse) {
    const system = [
      'You convert claims into explicit ASSUMPTIONS and OPEN QUESTIONS.',
      'Return ONLY valid JSON. No markdown.',
      'Schema:',
      '{"assumptions":[{"id":"a1","claimId":"c1","category":"technical|market|product|execution|legal","statement":"...","criticality":"existential|high|medium|low","testability":"high|medium|low","confidence":0.0}],"openQuestions":[{"id":"q1","priority":"p0|p1|p2","question":"...","linkedTo":["a1","c1"]}]}',
      '',
      'Rules:',
      '- 6 to 10 assumptions.',
      '- 0 to 3 openQuestions.',
      '- Make existential assumptions explicit.',
    ].join('\n');

    const user = JSON.stringify({ claims: parse.claims ?? [] });
    return { system, user };
  }

  // ---------------- Attack selection ----------------

  private selectAttacks(parse: PitchParse): SelectedAttacks {

    //todo debug the thing but its sloooowww to get there
    console.log('mode', this.panelMode(), 'judges', this.judges.map(j => j.id));
    for (const j of this.judges.filter(x=>x.id!=='host')) {
      console.log(j.id, 'vectors', this.judgesService.getVectors(j.id as any, this.panelMode()).length);
    }


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
      const available = all.filter((v) => v && v.id && !resolved.has(v.id));

      // ✅ If nothing available (missing config or all resolved), fallback safely
      if (!available.length) {
        console.warn(
          `[PitchArena] No attack vectors available for judge=${judge} mode=${this.panelMode()}`
        );
        // Use lastAttackId if it exists, otherwise a stable sentinel
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

      // ✅ Prefer unused category, but don’t assume category exists
      const firstUnused = candidates.find(
        (x) => x?.category && !usedCategories.has(x.category)
      );
      const v = firstUnused ?? candidates[0];

      // ✅ Still guard
      if (!v) {
        console.warn(
          `[PitchArena] Candidate selection failed for judge=${judge}`
        );
        return mem?.lastAttackId || 'fallback_no_candidate';
      }

      if (v.category) usedCategories.add(v.category);
      if (v.category) this.lastCategory.set(judge, v.category);

      return v.id;
    };

    const panelJudges = this.judges
      .filter((j) => j.id !== 'host')
      .map((j) => j.id as Exclude<string, 'host'>);

    const selected: SelectedAttacks = {} as SelectedAttacks;
    for (const judgeId of panelJudges) {
      selected[judgeId] = pick(judgeId);
    }

    return selected;
  }

  // =========================================================
  // Export / transcript
  // =========================================================
  exportConversation() {
    const snapshot = {
      exportedAt: new Date().toISOString(),
      phase: this.phase(),
      round: this.round(),
      profile: this.profile(),
      judgeRuns: this.judgeRuns(),
      chat: this.chat(),
      endSummary: this.endSummary(),
    };

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `pitch-arena-${new Date()
      .toISOString()
      .replace(/[:.]/g, '-')}.json`;
    a.click();

    URL.revokeObjectURL(url);
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

    this.reprompting.set(true);

    const transcript = this.conversationTranscript();
    const user = ['CONVERSATION:', transcript, '', 'REQUEST:', prompt].join(
      '\n'
    );
    const system =
      'You are a sharp pitch coach reviewing the full conversation. Use the transcript to craft a concise follow-up or advice. Avoid markdown.';

    this.ai
      .textPrompt(user, system)
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
      .finally(() => this.reprompting.set(false));
  }

  judgeTone = signal<'supportive' | 'direct' | 'tough'>('direct');

  // ---------------- Judge call ----------------

  private callJudgeWithAttack(
    judge: Exclude<string, 'host'>,
    env: { ideaName: string; pitch: string; round: number },
    parse: PitchParse,
    attackId: string
  ): Promise<{
    judge: Exclude<string, 'host'>;
    score: number;
    comment: string;
    question: string;
  }> {
    const vector = this.vectorsFor(judge).find((v) => v.id === attackId);

    /*
    if (!vector) {
      
    }*/

    const mem = this.memory.get(judge);

    const previouslyAsked =
      !!mem &&
      (mem.lastAttackId === attackId ||
        this.isSimilarQuestion(
          mem.lastQuestion ?? '',
          vector.questionExamples
        ));

    const lastTopic = this.lastCategory.get(judge) ?? null;

    const system = this.judgesService.attackSystemPrompt({
      judgeId: judge,
      vector,
      round: this.round(),
      previouslyAsked,
      lastTopic,
      tone: this.judgeTone(), // ✅ new
      mode: this.panelMode(), // ✅ new
    });

    const user = [
      `ROUND: ${env.round}`,
      `IDEA NAME: ${env.ideaName}`,
      `PITCH: ${env.pitch}`,
      '',
      'STRUCTURED CONTEXT:',
      JSON.stringify({
        topClaims: (parse.claims ?? []).slice(0, 6),
        assumptions: (parse.assumptions ?? []).slice(0, 6),
        openQuestions: (parse.openQuestions ?? []).slice(0, 3),
        attackId,
      }),
    ].join('\n');

    return this.ai.textPrompt(user, system).then((raw) => {
      const json = this.coerceJudgeJson(raw, judge);
      return {
        judge,
        score: this.clampScoreByMode(json.score),
        comment: String(json.comment ?? '').trim(),
        question: String(json.question ?? '').trim(),
      };
    });
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
  ): Promise<'resolved' | 'partial' | 'unresolved'> {
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

    return this.ai
      .textPrompt(user, system)
      .then((r) => {
        const s = String(r).toLowerCase();
        if (s.includes('resolved')) return 'resolved';
        if (s.includes('partial')) return 'partial';
        return 'unresolved';
      })
      .catch(() => 'unresolved');
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

  private lastJudgeQuestionText(judgeId: string): string | null {
    const list = this.chat();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'judge' && m.judgeId === judgeId) return m.text;
    }
    return null;
  }

  private lastRoundDeltaTranscript(): string {
    // We only need the last “All answers captured” block onwards
    const list = this.chat();
    let start = 0;
    for (let i = list.length - 1; i >= 0; i--) {
      if (
        list[i].role === 'system' &&
        list[i].title === 'All answers captured'
      ) {
        start = i;
        break;
      }
    }

    // Collect only judge Qs and user answers after that marker
    const slice = list.slice(start);
    const lines: string[] = [];

    for (const m of slice) {
      if (m.role === 'judge' && m.judgeId && m.judgeId !== 'host') {
        lines.push(`JUDGE(${m.judgeId}): ${m.text}`);
      }
      if (m.role === 'user') {
        lines.push(`FOUNDER: ${m.text}`);
      }
    }

    return lines.join('\n');
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
      .finally(() => this.summarizing.set(false));
  }

  private generateEndSummary(): Promise<EndSummary> {
    const profile = this.profile();
    const transcript = this.conversationTranscript();
    const finalScore = Number(this.overallScore().toFixed(1));

    const system = [
      'You are the Pitch Arena panel chair writing the final verdict.',
      '',
      'Write a practical summary and action plan.',
      'Be constructive, not aggressive.',
      'No fluff. No generic advice.',
      '',
      'Return ONLY valid JSON with this schema:',
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

    return this.ai.textPrompt(user, system).then((raw) => {
      const json = this.coerceJson(raw, null);
      if (!json) {
        return {
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
      }
      json.finalScore = finalScore;
      return json as EndSummary;
    });
  }

  private conversationTranscript() {
    return this.chat()
      .map((m) => {
        const speaker =
          m.role === 'judge' ? m.title || `Judge:${m.judgeId ?? ''}` : m.role;
        return `${speaker}:\n${m.text}`;
      })
      .join('\n\n');
  }

  //TODO refactor to use the audio service again.
  // ---------------- Voice (kept, unchanged-ish) ----------------

  private audio = new Audio();
  currentlyPlayingMsgId = signal<string | null>(null);

  private stopAudio() {
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {}
    this.currentlyPlayingMsgId.set(null);
  }

  playMsg(msg: ChatMsg) {
    if (!msg.audioUrl) return;

    if (this.currentlyPlayingMsgId() === msg.id) {
      this.stopAudio();
      return;
    }

    this.stopAudio();
    this.audio.src = msg.audioUrl;
    this.audio
      .play()
      .then(() => this.currentlyPlayingMsgId.set(msg.id))
      .catch(() => this.currentlyPlayingMsgId.set(null));

    this.audio.onended = () => this.currentlyPlayingMsgId.set(null);
  }

  ensureVoice(msgId: string) {
    const msg = this.chat().find((m) => m.id === msgId);
    if (!msg || msg.role !== 'judge') return;
    if (msg.audioState === 'loading') return;
    if (msg.audioUrl) return;

    this.chat.update((list) =>
      list.map((m) =>
        m.id === msgId ? { ...m, audioState: 'loading' as const } : m
      )
    );

    const voiceId = msg.voiceId || this.judgeVoices[msg.judgeId!];

    this.speech
      .textToSpeechUrl(msg.text, voiceId)
      .then((url) => {
        this.chat.update((list) =>
          list.map((m) =>
            m.id === msgId
              ? { ...m, audioUrl: url, audioState: 'ready' as const }
              : m
          )
        );
        const updated = this.chat().find((m) => m.id === msgId);
        if (updated?.audioUrl) this.playMsg(updated);
      })
      .catch((err) => {
        console.error(err);
        this.chat.update((list) =>
          list.map((m) =>
            m.id === msgId ? { ...m, audioState: 'error' as const } : m
          )
        );
      });
  }

  recording = signal<boolean>(false);
  mediaRecorder: MediaRecorder | null = null;
  audioChunks: Blob[] = [];
  storage = getStorage();

  startRecording() {
    if (this.recording()) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(stream);
        this.recording.set(true);

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          this.handleRecordedAudio();
        };

        this.mediaRecorder.start();
      })
      .catch((err) => console.error('Mic access denied', err));
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.recording()) return;
    this.recording.set(false);
    this.mediaRecorder.stop();
  }

  private handleRecordedAudio() {
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const filename = `voice/${crypto.randomUUID()}.webm`;
    const audioRef = ref(this.storage, filename);

    uploadBytes(audioRef, blob)
      .then(() => getDownloadURL(audioRef))
      .then((url) => this.applySpeechUrl(url))
      .catch((err) => console.error('Upload failed', err));
  }

  applySpeechUrl(url: string) {
    this.speech
      .speechToText(url)
      .then((text) => {
        const cleaned = (text ?? '').trim();
        if (!cleaned) return;
        this.submitText(cleaned);
      })
      .catch((err) => console.error('speechToText failed', err));
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
