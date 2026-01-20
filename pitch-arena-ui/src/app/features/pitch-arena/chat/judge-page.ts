import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { ChatUIMessage, ChatUiComponent } from './chat-ui';
import { ArenaConfig } from '../models/arena-config';
import { ArenaService } from '../services/arena-service';
import { JudgeService, JudgeMemoryLite, JudgeTurnResult } from '../services/judge.service';
import { GeminiService } from '#services/ai/gemini.service';
import { getPitchArenaPitch } from './helpers';

type Phase = 'asking' | 'awaitingAnswer' | 'ended';

type JudgeRun = {
  round: number;
  score: number;
  comment: string;
  question: string;
  answer: string;
  askedCriteriaId?: string;
  coverage?: any;
};

type EndSummary = {
  finalScore: number;
  verdict: 'pass' | 'maybe' | 'fail';
  oneLiner: string;
  topStrength: string;
  topRisk: string;
  nextStep24h: string;
};

@Component({
  selector: 'judge-page',
  imports: [ChatUiComponent],
  templateUrl: './judge-page.html',
})
export class JudgePage {
  arenaService = inject(ArenaService);
  judgeService = inject(JudgeService);
  gemini = inject(GeminiService);
  route = inject(ActivatedRoute);

  arenaConfig = signal<ArenaConfig>(null);
  arenaLoaded = signal(false);

  phase = signal<Phase>('asking');

  maxRounds = signal(3);
  round = signal(1);

  judge = null; // vc config
  profile: any = null;

  memory: JudgeMemoryLite | null = null;

  // current turn (question waiting for answer)
  currentTurn = signal<JudgeTurnResult | null>(null);

  judgeRuns = signal<JudgeRun[]>([]);
  endSummary = signal<EndSummary | null>(null);
  summarizing = signal(false);

  messages = signal<ChatUIMessage[]>([]);

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path') ?? 'gemini';
    this.loadArena(path);
  }

  private async loadArena(path: string) {
    const cfg = await this.arenaService.getArenaConfig(path);
    this.arenaConfig.set(cfg);

    const max = cfg.objective?.constraints?.maxRounds;
    if (typeof max === 'number' && max > 0) this.maxRounds.set(max);

    this.judge = cfg.judges.find(j => j.id === 'vc');
    if (!this.judge) throw new Error('No vc judge in config');

    // init profile (use host profileConfig if available)
    const host = cfg.judges.find(j => j.id === 'host');
    const fields = host?.profileConfig ?? ['founderName','ideaName','pitch'];
    this.profile = Object.fromEntries(fields.map((f) => [f, null]));

    // dev shortcut
    this.profile = getPitchArenaPitch();//TODO remove once we have the workflow in place
    this.arenaLoaded.set(true);

    // ✅ start round 1 immediately (no welcome)
    await this.startRound();
  }

  /**
   * The AI is called here
   * @returns nothing
   */
  private async startRound() {
    if (this.phase() === 'ended') return;

    const cfg = this.arenaConfig();
    const res = await this.judgeService.runTurn(cfg, this.judge, {
      profile: this.profile,
      lastDelta: this.buildLastDeltaForJudge(), // optional: from last round
      memory: this.memory ?? undefined,
      mode: this.round() <= 1 ? 'discovery' : 'interrogation',
    });

    this.memory = this.judgeService.nextMemory(this.memory ?? undefined, res);
    this.currentTurn.set(res);

    this.messages.update(msgs => [
      ...msgs,
      this.createMessage('ai', `Round ${this.round()} • Score ${res.score.toFixed(1)}\n${res.comment}\n\n${res.question}`)
    ]);

    this.phase.set('awaitingAnswer');
  }

  /**
   * 
   * @param text the user answer to the last question
   * @returns 
   */
  gotMessage(text: string) {
    const answer = (text ?? '').trim();
    if (!answer) return;
    if (this.phase() !== 'awaitingAnswer') return;

    this.messages.update(msgs => [...msgs, this.createMessage('user', answer)]);

    const turn = this.currentTurn();
    if (!turn) return;

    // save the run for this round
    this.judgeRuns.update(runs => [
      ...runs,
      {
        round: this.round(),
        score: turn.score,
        comment: turn.comment,
        question: turn.question,
        answer,
        askedCriteriaId: turn.askedCriteriaId,
        coverage: turn.coverage,
      }
    ]);

    //console.log(this.judgeRuns())

    // advance
    if (this.round() >= this.maxRounds()) {
      this.finish();
      return;
    }

    this.round.set(this.round() + 1);
    this.phase.set('asking');

    // next question
    this.startRound();
  }

  /**
   * 
   * @returns 
   */
  private buildLastDeltaForJudge(): string | undefined {
    const last = this.judgeRuns().at(-1);
    if (!last) return undefined;
    // keep it short, this is what helps continuity without huge context
    return `Previous round:\nQ: ${last.question}\nA: ${last.answer}`;
  }

  private async finish() {
    this.phase.set('ended');

    const finalScore = this.avg(this.judgeRuns().map(r => r.score));

    this.messages.update(msgs => [
      ...msgs,
      this.createMessage('system', `Ended • Final score: ${finalScore.toFixed(1)}`)
    ]);

    await this.generateSummary(finalScore);
  }

  /**
   * 
   * @param finalScore 
   * @returns 
   */
  private async generateSummary(finalScore: number) {
    const cfg = this.arenaConfig();
    this.summarizing.set(true);

    const system = [
      'You are the Pitch Arena panel chair.',
      'Return ONLY valid JSON. No markdown. No code fences.',
      'Use short practical language.',
      '',
      'JSON schema:',
      JSON.stringify({
        finalScore: 0,
        verdict: 'maybe',
        oneLiner: '...',
        topStrength: '...',
        topRisk: '...',
        nextStep24h: '...'
      }),
      '',
      'Verdict must be one of: pass, maybe, fail.'
    ].join('\n');

    const user = [
      `ARENA: ${cfg?.name ?? ''}`,
      `OBJECTIVE: ${cfg?.objective?.thesis ?? ''}`,
      '',
      'FOUNDER PROFILE:',
      JSON.stringify(this.profile ?? {}),
      '',
      `FINAL SCORE: ${Number(finalScore.toFixed(1))}`,
      '',
      'ROUNDS:',
      JSON.stringify(this.judgeRuns().slice(-6)), // keep short
    ].join('\n');

    try {
      const raw = await this.gemini.textPrompt(user, system);
      const json = this.coerceJson(raw, null);

      const fallback: EndSummary = {
        finalScore: Number(finalScore.toFixed(1)),
        verdict: 'maybe',
        oneLiner: 'Summary unavailable.',
        topStrength: '',
        topRisk: '',
        nextStep24h: 'Run 5 quick founder interviews on the core pain point.',
      };

      if (!json || typeof json !== 'object') {
        this.endSummary.set(fallback);
        return;
      }

      const verdict = this.normalizeVerdict((json as any).verdict);
      const summary: EndSummary = {
        finalScore: Number(finalScore.toFixed(1)),
        verdict,
        oneLiner: String((json as any).oneLiner ?? fallback.oneLiner).trim(),
        topStrength: String((json as any).topStrength ?? '').trim(),
        topRisk: String((json as any).topRisk ?? '').trim(),
        nextStep24h: String((json as any).nextStep24h ?? fallback.nextStep24h).trim(),
      };

      this.endSummary.set(summary);

      this.messages.update(msgs => [
        ...msgs,
        this.createMessage(
          'system',
          `${summary.verdict.toUpperCase()} • ${summary.oneLiner}\n\nStrength: ${summary.topStrength}\nRisk: ${summary.topRisk}\nNext 24h: ${summary.nextStep24h}`
        )
      ]);
    } finally {
      this.summarizing.set(false);
    }
  }

  // -------- utils --------

  private createMessage(role: 'user' | 'ai' | 'system', text: string): ChatUIMessage {
    return { id: crypto.randomUUID(), role, text };
  }

  private avg(nums: number[]) {
    return nums.reduce((a, n) => a + n, 0) / Math.max(1, nums.length);
  }

  private normalizeVerdict(v: any): 'pass' | 'maybe' | 'fail' {
    const s = String(v ?? '').toLowerCase();
    if (s.includes('pass') || s.includes('go') || s.includes('strong')) return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject')) return 'fail';
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
    try { return JSON.parse(s); } catch { return fallback; }
  }
}
