import { GeminiService } from '#services/ai/gemini.service';
import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  ViewChild,
  computed,
  effect,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VoiceService } from './services/voice.service';
import { JudgesService } from './services/judges.service';

@Component({
  selector: 'app-pitch-arena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pitch-arena.html',
})
export class PitchArena {
  // ------------------ deps ------------------
  ai = inject(GeminiService);
  private judgesService = inject(JudgesService);

  // ------------------ config ------------------
  judges = this.judgesService.getJudges();
  judgeVoices = this.judgesService.getJudgeVoices();

  maxRounds = signal<number>(3);

  // ------------------ state ------------------
  phase = signal<Phase>('intro');
  round = signal<number>(1);
  panelMode = signal<PanelMode>('discovery');

  profile = signal<ArenaProfile>({
    founderName: '',
    ideaName: '',
    pitch: '',
  });

  chat = signal<ChatMsg[]>([]);
  input = signal<string>('');
  repromptInput = signal<string>('');
  reprompting = signal<boolean>(false);

  judgeRuns = signal<JudgeRun[]>([]);
  currentJudgeIndex = signal<number>(0);

  parse = signal<PitchParse | null>(null);
  selectedAttacks = signal<SelectedAttacks | null>(null);

  endSummary = signal<EndSummary | null>(null);
  summarizing = signal<boolean>(false);

  // ------------------ locks / memory ------------------
  private judgingInFlight = signal(false);
  private endedOnce = false;

  private memory = new Map<Exclude<JudgeId, 'host'>, ArenaMemory>();
  private lastOverall: number | null = null;
  private lastCategory = new Map<Exclude<JudgeId, 'host'>, string>();

  // ------------------ view ------------------
  @ViewChild('chatWindow') chatWindow?: ElementRef<HTMLElement>;

  private autoScrollEffect = effect(() => {
    this.chat();
    queueMicrotask(() => this.scrollChatToBottom());
  });

  // ------------------ derived ------------------
  isFinalRound = computed(() => this.round() >= this.maxRounds());
  roundLabel = computed(() => `Round ${this.round()} / ${this.maxRounds()}`);

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
    const t = (this.input() ?? '').trim();
    if (this.phase() === 'intro') return t.length >= 3;
    if (this.phase() === 'answering') return t.length >= 10;
    return false;
  });

  canRescore = computed(() => {
    if (this.phase() !== 'results') return false;
    const runs = this.judgeRuns();
    return !!runs.length && runs.every((r) => (r.answer ?? '').trim().length >= 10);
  });

  phaseLabel = computed(() => {
    const p = this.phase();
    if (p === 'intro') return 'Warm-up';
    if (p === 'judging') return 'Judging';
    if (p === 'answering') return 'Answering';
    if (p === 'results') return 'Scored';
    return 'Ended';
  });

  // ------------------ init ------------------
  constructor() {
    this.reset();
  }

  // =========================================================
  // UI actions
  // =========================================================
  reset() {
    this.phase.set('intro');
    this.round.set(1);
    this.panelMode.set('discovery');

    this.profile.set({ founderName: '', ideaName: '', pitch: '' });
    this.input.set('');

    this.judgeRuns.set([]);
    this.currentJudgeIndex.set(0);

    this.parse.set(null);
    this.selectedAttacks.set(null);

    this.endSummary.set(null);
    this.summarizing.set(false);

    this.judgingInFlight.set(false);
    this.endedOnce = false;

    this.memory.clear();
    this.lastCategory.clear();
    this.lastOverall = null;

    this.chat.set([
      {
        id: crypto.randomUUID(),
        role: 'judge',
        judgeId: 'host',
        title: 'Host • Warm-up',
        text: 'Welcome to Pitch Arena. In one line: who are you?',
      },
    ]);
  }

  send() {
    if (!this.canSend()) return;
    const text = (this.input() ?? '').trim();
    this.input.set('');
    this.submitFounderText(text);
  }

  judgeState(judge: JudgeId): 'idle' | 'active' | 'passed' {
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

  // used by voice too
  private submitFounderText(text: string) {
    const cleaned = (text ?? '').trim();
    if (!cleaned) return;

    this.appendChat({ role: 'user', text: cleaned });

    if (this.phase() === 'intro') return this.hostTurn(cleaned);
    if (this.phase() === 'answering') return this.panelAnswerTurn(cleaned);

    // In results/ended, ignore; you can show a hint if you want.
  }

  // =========================================================
  // Chat helpers
  // =========================================================
  private appendChat(msg: Omit<ChatMsg, 'id'>) {
    this.chat.update((list) => list.concat({ id: crypto.randomUUID(), ...msg }));
  }

  private lastJudgeQuestionText(judgeId: JudgeId): string | null {
    const list = this.chat();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'judge' && m.judgeId === judgeId) return m.text;
    }
    return null;
  }

  private pushJudgeBubble(run: JudgeRun) {
    const title = `${run.judgeLabel} • ${run.dimension}`;
    const prefix =
      run.delta === null
        ? `Score: ${run.score.toFixed(1)}`
        : `Score: ${run.score.toFixed(1)} (${run.delta >= 0 ? '+' : ''}${run.delta.toFixed(1)})`;

    this.appendChat({
      role: 'judge',
      judgeId: run.judge,
      title,
      text: `${prefix}\n${run.comment}\n\n${run.question}`,
    });
  }

  // =========================================================
  // Host warm-up
  // =========================================================
  private hostTurn(userAnswer: string) {
    const prof = this.profile();
    const lastHostQ = this.lastJudgeQuestionText('host') ?? 'Warm-up';

    const system = this.judgesService.hostSystemPrompt();
    const user = this.hostUserPrompt(prof, lastHostQ, userAnswer);

    this.ai.textPrompt(user, system)
      .then((raw) => {
        const json = this.coerceHostJson(raw);

        if (json.profile) this.profile.update((p) => ({ ...p, ...json.profile }));

        if ((json.comment ?? '').trim()) {
          this.appendChat({
            role: 'judge',
            judgeId: 'host',
            title: 'Host',
            text: String(json.comment).trim(),
          });
        }

        this.appendChat({
          role: 'judge',
          judgeId: 'host',
          title: 'Host • Warm-up',
          text: String(json.nextQuestion ?? 'Tell me more.').trim(),
        });

        if (json.ready) {
          this.appendChat({
            role: 'system',
            title: 'Warm-up complete',
            text: 'Panel is starting now.',
          });
          this.startRound();
        }
      })
      .catch((err) => {
        console.error(err);
        this.appendChat({
          role: 'judge',
          judgeId: 'host',
          title: 'Host • Warm-up',
          text: 'Quick reset: what is the name of your idea, and who is it for?',
        });
      });
  }

  private hostUserPrompt(profile: ArenaProfile, lastQ: string, lastA: string): string {
    return [
      `CURRENT PROFILE (may be incomplete):`,
      JSON.stringify(profile),
      '',
      `LAST HOST QUESTION: ${lastQ}`,
      `FOUNDER ANSWER: ${lastA}`,
      '',
      'TASK:',
      '- Update profile fields if the answer provides them.',
      '- Ask the next single warm-up question.',
      '- If basics are complete, set ready=true and nextQuestion can be: "Ready. Let’s begin."',
    ].join('\n');
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

  // =========================================================
  // Rounds
  // =========================================================
  private updatePanelModeForRound() {
    this.panelMode.set(this.round() <= 1 ? 'discovery' : 'interrogation');
  }

  startRound() {
    if (this.judgingInFlight()) return;
    if (this.phase() === 'ended') return;
    if (this.round() > this.maxRounds()) return;

    this.updatePanelModeForRound();
    this.phase.set('judging');
    this.judgingInFlight.set(true);

    this.runJudgingRound()
      .then((runs) => {
        this.judgeRuns.set(runs);
        this.phase.set('answering');
        this.currentJudgeIndex.set(0);
        this.pushJudgeBubble(runs[0]);
      })
      .catch((err) => {
        console.error(err);
        // Don’t deadlock: move to results so user can recover/reset
        this.phase.set('results');
      })
      .finally(() => {
        // ✅ FIX: always release inFlight
        this.judgingInFlight.set(false);
      });
  }

  private runJudgingRound(): Promise<JudgeRun[]> {
    return this.buildParse()
      .then((parse) => {
        this.parse.set(parse);

        const attacks = this.selectAttacks(parse);
        this.selectedAttacks.set(attacks);

        const env = {
          ideaName: parse.ideaName,
          pitch: parse.pitchText,
          round: this.round(),
        };

        const calls = (['vc', 'cto', 'product'] as const).map((j) =>
          this.callJudgeWithAttack(j, env, parse, attacks[j])
        );

        return Promise.all(calls);
      })
      .then((results) => {
        return results.map((r) => {
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
            answer: prev?.lastAnswer ?? '',
          } satisfies JudgeRun;
        });
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
    this.appendChat({
      role: 'system',
      title: 'All answers captured',
      text: 'Rescore to advance to the next round.',
    });
  }

  // =========================================================
  // Rescore / advance
  // =========================================================
  submitAnswersAndRescore() {
    if (!this.canRescore()) return;

    const runs = this.judgeRuns();
    const attacks = this.selectedAttacks();
    if (!attacks) return;

    // snapshot score BEFORE anything changes
    this.lastOverall = this.avg(runs.map((x) => x.score));

    // Ensure memory entry exists & preserves resolvedAttackIds
    runs.forEach((r) => {
      const prev = this.memory.get(r.judge);
      this.memory.set(r.judge, {
        lastScore: r.score,
        lastQuestion: r.question,
        lastAnswer: r.answer,
        lastAttackId: attacks[r.judge],
        resolvedAttackIds: prev?.resolvedAttackIds?.slice() ?? [],
      });
    });

    // Evaluate resolution, then advance ONLY AFTER done
    const evals = runs.map((r) =>
      this.evaluateResolution(r.judge, attacks[r.judge], r.question, r.answer).then((result) => ({
        judge: r.judge,
        result,
      }))
    );

    Promise.all(evals)
      .then((results) => {
        results.forEach(({ judge, result }) => {
          if (result !== 'resolved') return;
          const mem = this.memory.get(judge);
          if (!mem) return;

          const id = attacks[judge];
          if (!mem.resolvedAttackIds.includes(id)) mem.resolvedAttackIds.push(id);
        });

        // ✅ Advance or end
        if (this.round() >= this.maxRounds()) {
          this.endArena(); // guarded by endedOnce
          return;
        }

        // next round
        this.round.set(this.round() + 1);
        this.updatePanelModeForRound();

        // clear per-round state
        this.judgeRuns.set([]);
        this.currentJudgeIndex.set(0);

        this.startRound();
      })
      .catch((err) => {
        console.error('rescore failed', err);
        // keep user in results so they can retry
        this.phase.set('results');
      });
  }

  private evaluateResolution(
    judge: Exclude<JudgeId, 'host'>,
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

    return this.ai.textPrompt(user, system)
      .then((r) => {
        const s = String(r ?? '').toLowerCase();
        if (s.includes('resolved')) return 'resolved';
        if (s.includes('partial')) return 'partial';
        return 'unresolved';
      })
      .catch(() => 'unresolved');
  }

  // =========================================================
  // End + summary (fixed: no double end, score not 0)
  // =========================================================
  private endArena() {
    if (this.endedOnce) return; // ✅ FIX: prevents duplicates
    this.endedOnce = true;

    const finalScore = Number(this.overallScore().toFixed(1)); // snapshot now

    this.phase.set('ended');

    this.appendChat({
      role: 'system',
      title: 'Pitch Arena complete',
      text: `That’s the end: ${this.maxRounds()} round(s). Final score: ${finalScore.toFixed(1)}.`,
    });

    this.summarizing.set(true);
    this.generateEndSummary(finalScore)
      .then((summary) => {
        this.endSummary.set(summary);

        this.appendChat({
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
        });
      })
      .catch((err) => console.error('end summary failed', err))
      .finally(() => this.summarizing.set(false));
  }

  private generateEndSummary(finalScore: number): Promise<EndSummary> {
    const profile = this.profile();
    const transcript = this.conversationTranscript();

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
        assumptionsToTest: [{ assumption: '...', test: '...', successMetric: '...' }],
        next7Days: ['...'],
        next30Days: ['...'],
        recommendedMvp: { user: '...', flow: ['...'], mustCut: ['...'] },
        pricingAndGtm: { whoPays: '...', pricingIdea: '...', firstChannel: '...' },
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
      `FINAL SCORE: ${finalScore.toFixed(1)}`,
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
        } as EndSummary;
      }
      json.finalScore = finalScore;
      return json as EndSummary;
    });
  }

  judgeBadge(judge: JudgeId) {
    if (judge === 'host') return '🎤';
    if (judge === 'vc') return '💼';
    if (judge === 'cto') return '🛠️';
    return '🧩';
  }

  // =========================================================
  // Attacks + judge calls
  // =========================================================
  private vectorsFor(judge: Exclude<JudgeId, 'host'>): AttackVector[] {
    return this.round() <= 1
      ? this.judgesService.DISCOVERY_ATTACKS[judge]
      : this.judgesService.ATTACKS[judge];
  }

  private selectAttacks(parse: PitchParse): SelectedAttacks {
    const avgSpec = this.avg((parse.claims ?? []).map((c) => c.specificityScore));
    const assumptionText = (parse.assumptions ?? [])
      .map((a) => (a.statement ?? '').toLowerCase())
      .join(' | ');

    const usedCategories = new Set<AttackCategory>();

    const pick = (judge: Exclude<JudgeId, 'host'>) => {
      const mem = this.memory.get(judge);
      const resolved = new Set(mem?.resolvedAttackIds ?? []);

      const vectors = this.vectorsFor(judge).filter((v) => !resolved.has(v.id));
      const triggered = vectors.filter((v) => {
        const min = v.triggers?.minAvgSpecificity;
        if (typeof min === 'number' && !(avgSpec < min)) return false;

        const inc = v.triggers?.assumptionIncludes ?? [];
        if (inc.length && !inc.some((t) => assumptionText.includes(t.toLowerCase()))) return false;

        return true;
      });

      const candidates = triggered.length ? triggered : vectors;
      const v = candidates.find((x) => !usedCategories.has(x.category)) ?? candidates[0];

      usedCategories.add(v.category);
      this.lastCategory.set(judge, v.category);
      return v.id;
    };

    return { vc: pick('vc'), cto: pick('cto'), product: pick('product') };
  }

  private callJudgeWithAttack(
    judge: Exclude<JudgeId, 'host'>,
    env: { ideaName: string; pitch: string; round: number },
    parse: PitchParse,
    attackId: string
  ): Promise<{ judge: Exclude<JudgeId, 'host'>; score: number; comment: string; question: string }> {
    const vector = this.vectorsFor(judge).find((v) => v.id === attackId)!;

    const mem = this.memory.get(judge);
    const previouslyAsked =
      !!mem &&
      (mem.lastAttackId === attackId || mem.lastQuestion?.trim() === vector.questionTemplate.trim());

    const lastTopic = this.lastCategory.get(judge) ?? null;

    const system = [
      this.judgesService.sharedSystemPrompt({
        round: this.round(),
        previouslyAsked,
        lastTopic,
      }),
      this.judgesService.rolePrompt(judge),
      '',
      'ATTACK VECTOR (MANDATORY):',
      `- Category: ${vector.category}`,
      `- Critique style: ${vector.critiqueTemplate}`,
      `- Suggested direction (rephrase freely): ${vector.questionTemplate}`,
      '',
      'HARD RULES:',
      `- Max words in comment: ${vector.requiredSignals.includes('numbers') ? 90 : 80}`,
      '- Ask exactly ONE question.',
      `- Do not use any of these phrases: ${vector.forbiddenPhrases.join(' | ')}`,
      '',
      'Return ONLY JSON with keys: judge, score, comment, question.',
    ].join('\n');

    const user = [
      `ROUND: ${env.round}`,
      `IDEA NAME: ${env.ideaName}`,
      `PITCH: ${env.pitch}`,
      '',
      'STRUCTURED CONTEXT:',
      JSON.stringify({
        topClaims: (parse.claims ?? []).slice(0, 6),
        assumptions: (parse.assumptions ?? []).slice(0, 6),
        openQuestions: (parse.openQuestions ?? []).slice(0, 6),
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

  private clampScoreByMode(n: number) {
    const s = this.clampScore(n);
    if (this.panelMode() === 'discovery') return Math.max(4.0, Math.min(7.0, s));
    return s;
  }

  private coerceJudgeJson(raw: any, expectedJudge: Exclude<JudgeId, 'host'>): JudgeJson {
    const obj = this.coerceJson(raw, null);
    if (!obj) {
      return {
        judge: expectedJudge,
        score: 5.0,
        comment: String(raw ?? 'No comment returned.'),
        question: 'Be specific: who pays, why now, and what is the first MVP?',
      } as JudgeJson;
    }

    return {
      judge: obj.judge ?? expectedJudge,
      score: Number(obj.score ?? 0),
      comment: String(obj.comment ?? ''),
      question: String(obj.question ?? ''),
    } as JudgeJson;
  }

  // =========================================================
  // Parse building (unchanged logic but tightened)
  // =========================================================
  private buildParse(): Promise<PitchParse> {
    const prof = this.profile();
    const ideaName = (prof.ideaName ?? '').trim() || 'Untitled idea';
    const pitchText = (prof.pitch ?? '').trim();

    const a = this.promptExtractClaims({ ideaName, pitchText });

    return this.ai.textPrompt(a.user, a.system).then((rawClaims) => {
      const claimsObj = this.coerceJson(rawClaims, { claims: [], entities: {} }) ?? { claims: [] };

      const base: any = {
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
      };

      const b = this.promptBuildAssumptions(base);

      return this.ai.textPrompt(b.user, b.system).then((rawAssumptions) => {
        const aObj = this.coerceJson(rawAssumptions, { assumptions: [], openQuestions: [] }) ?? {
          assumptions: [],
          openQuestions: [],
        };

        base.assumptions = (aObj.assumptions ?? []).map((x: any, i: number) => ({
          id: String(x.id ?? `a${i + 1}`),
          claimId: String(x.claimId ?? base.claims[0]?.id ?? 'c1'),
          category: x.category ?? 'technical',
          statement: String(x.statement ?? ''),
          criticality: x.criticality ?? 'medium',
          testability: x.testability ?? 'medium',
          confidence: this.clamp01(Number(x.confidence ?? 0.6)),
        }));

        base.openQuestions = (aObj.openQuestions ?? []).map((q: any, i: number) => ({
          id: String(q.id ?? `q${i + 1}`),
          priority: q.priority ?? 'p1',
          question: String(q.question ?? ''),
          linkedTo: Array.isArray(q.linkedTo) ? q.linkedTo.map(String) : [],
        }));

        return base as PitchParse;
      });
    });
  }

  private promptExtractClaims(env: { ideaName: string; pitchText: string }) {
    const system = [
      'You extract structured CLAIMS from startup pitches.',
      'Return ONLY valid JSON. No markdown.',
      'Schema:',
      '{"claims":[{"id":"c1","type":"value|user|market|technical|goToMarket|pricing|competition|ops","text":"...","quote":"...","specificityScore":0.0,"confidence":0.0,"tags":["core"]}],"entities":{"buyer":false,"price":false,"metric":false,"data":false,"time":false,"wedge":false}}',
      '',
      'Rules:',
      '- 4 to 10 claims max.',
      '- specificityScore: 0..1 (0 vague, 1 very concrete).',
      '- confidence: 0..1.',
    ].join('\n');

    const user = [`IDEA NAME: ${env.ideaName}`, `PITCH:`, env.pitchText].join('\n');
    return { system, user };
  }

  private promptBuildAssumptions(parse: any) {
    const system = [
      'You convert claims into explicit ASSUMPTIONS and OPEN QUESTIONS.',
      'Return ONLY valid JSON. No markdown.',
      'Schema:',
      '{"assumptions":[{"id":"a1","claimId":"c1","category":"technical|market|product|execution|legal","statement":"...","criticality":"existential|high|medium|low","testability":"high|medium|low","confidence":0.0}],"openQuestions":[{"id":"q1","priority":"p0|p1|p2","question":"...","linkedTo":["a1","c1"]}]}',
      '',
      'Rules:',
      '- 3 to 8 assumptions max.',
      '- Make existential assumptions harsh and explicit.',
    ].join('\n');

    const user = JSON.stringify({ claims: parse.claims ?? [] });
    return { system, user };
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

    const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `pitch-arena-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
    a.click();

    URL.revokeObjectURL(url);
  }

  private conversationTranscript() {
    return this.chat()
      .map((m) => {
        const speaker = m.role === 'judge' ? m.title || `Judge:${m.judgeId ?? ''}` : m.role;
        return `${speaker}:\n${m.text}`;
      })
      .join('\n\n');
  }

  repromptConversation() {
    const prompt = (this.repromptInput() ?? '').trim();
    if (!prompt || this.reprompting()) return;

    this.reprompting.set(true);

    const transcript = this.conversationTranscript();
    const user = ['CONVERSATION:', transcript, '', 'REQUEST:', prompt].join('\n');
    const system =
      'You are a sharp pitch coach reviewing the full conversation. Use the transcript to craft a concise follow-up or advice. Avoid markdown.';

    this.ai
      .textPrompt(user, system)
      .then((res) => {
        const text = typeof res === 'string' ? res : JSON.stringify(res, null, 2);

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

  // =========================================================
  // Voice (kept, but uses submitFounderText so no duplicated logic)
  // =========================================================
  voice = inject(VoiceService);
  currentlyPlayingMsgId = this.voice.currentlyPlayingMsgId;
  recording = this.voice.recording;

  playMsg(msg: ChatMsg) {
    this.voice.playMsg(msg);
  }

  ensureVoice(msgId: string) {
    this.voice.ensureVoice(msgId, this.chat, this.judgeVoices);
  }

  startRecording() {
    this.voice.startRecording((text) => this.submitFounderText(text)); // ✅ unified path
  }

  stopRecording() {
    this.voice.stopRecording();
  }

  // =========================================================
  // Small utils
  // =========================================================
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
}
