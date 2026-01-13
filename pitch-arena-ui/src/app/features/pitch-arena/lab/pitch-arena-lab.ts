import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, computed, inject, signal } from '@angular/core';
import { GeminiService } from '#services/ai/gemini.service';
import { JudgesService } from '../services/judges.service';
import {
  AttackVector,
  JudgeTone,
  PanelMode,
  PitchParse,
} from '../models/pitch';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ArenaConfig } from '../models/arena-config';
import { ActivatedRoute } from '@angular/router';

export type JudgeJson = {
  judge: Exclude<string, 'host'>;
  score: number;
  comment: string;
  question: string;
};

type ParseMode = 'none' | 'merged'; // none = fastest (skip), merged = 1 AI call

@Component({
  selector: 'pitch-arena-lab',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pitch-arena-lab.html',
})
export class PitchArenaLabComponent {
  private http = inject(HttpClient);

  route = inject(ActivatedRoute)

  private ai = inject(GeminiService);
  private judgesService = inject(JudgesService);

  // ---------------------------
  // Lab state
  // ---------------------------
  labJudge = signal<Exclude<string, 'host'>>('vc');
  labMode = signal<PanelMode>('discovery');
  judgeTone = signal<JudgeTone>('supportive');

  arenaConfig = signal<ArenaConfig>(null)

  labIdeaName = signal<string>('Untitled idea');
  labPitch = signal<string>('');
  labAttackId = signal<string>('');

  // FAST toggles
  parseMode = signal<ParseMode>('none'); // ✅ default fastest
  showContext = signal<boolean>(true); // include structured context block in judge call

  // parse limits (only used in merged mode)
  maxClaims = signal<number>(8);
  maxAssumptions = signal<number>(6);
  maxOpenQuestions = signal<number>(6);

  // outputs
  running = signal<boolean>(false);
  lastMs = signal<number | null>(null);

  lastRaw = signal<string>('');
  lastJson = signal<JudgeJson | null>(null);

  // batch
  batchRunning = signal<boolean>(false);
  batchResults = signal<
    Array<{
      judge: Exclude<string, 'host'>;
      mode: PanelMode;
      attackId: string;
      score: number;
      ms: number;
      comment: string;
      question: string;
    }>
  >([]);

  // ---------------------------
  // Parse cache (keyed by idea+pitch+limits)
  // ---------------------------
  private parseCache = new Map<string, PitchParse>();

  // ---------------------------
  // Computeds
  // ---------------------------
  readonly round = computed(() => (this.labMode() === 'discovery' ? 1 : 2));

  readonly vectors = signal<AttackVector[]>([]);
  readonly judges = signal<Array<{ id: Exclude<string, 'host'>; label: string }>>([]);
  
  /*computed<AttackVector[]>(() => {
    const judge = this.labJudge();
    const mode = this.labMode();
    return [];
    return this.judgesService.getVectors(judge, mode);
  });*/

  readonly selectedVector = computed<AttackVector | null>(() => {
    const id = this.labAttackId();
    if (!id) return null;
    return this.vectors().find((v) => v.id === id) ?? null;
  });

  readonly canRun = computed(() => {
    const idea = (this.labIdeaName() ?? '').trim();
    const pitch = (this.labPitch() ?? '').trim();
    const attack = (this.labAttackId() ?? '').trim();
    return (
      !!idea &&
      pitch.length >= 10 &&
      !!attack &&
      !this.running() &&
      !this.batchRunning()
    );
  });

  /**
   * constructor but is everything coming from the judges service
   */
  constructor() {
  }

  ngOnInit(){
    const path = this.route.snapshot.paramMap.get("path");
    if(path){
      this.loadArena(path);
    }else{
    }

  }

  private async loadArena(path) {
    const cfg = await firstValueFrom(
      this.http.get<ArenaConfig>('/assets/arenas/' + path + ".json")
    );

    this.judgesService.useArenaConfig(cfg);
    this.arenaConfig.set(this.judgesService.getArena())

    const judges = this.judgesService
      .getJudges()
      .filter((j) => j.id !== 'host') as Array<{
      id: Exclude<string, 'host'>;
      label: string;
    }>;
    this.judges.set(judges);

    // pick defaults once loaded
    const firstJudge = judges[0]?.id;
    if (firstJudge) this.labJudge.set(firstJudge);

    this.refreshVectors();

    const first = this.vectors()[0]?.id ?? '';
    if (first) this.labAttackId.set(first);

          
    queueMicrotask(() => {
      const first = this.vectors()[0]?.id;
      if (first) this.labAttackId.set(first);
    });
  }

  // ---------------------------
  // Public UI actions
  // ---------------------------
  onJudgeOrModeChanged() {
    this.refreshVectors();
    const first = this.vectors()[0]?.id ?? '';
    this.labAttackId.set(first);
  }

  clearCache() {
    this.parseCache.clear();
  }

  async warmParse() {
    // lets you “pay” the merged parse once, then iterate quickly
    if ((this.labPitch() ?? '').trim().length < 10) return;
    this.parseMode.set('merged');
    await this.buildParseCached();
  }

  async runOnce() {
    if (!this.canRun()) return;

    this.running.set(true);
    this.lastMs.set(null);
    this.lastRaw.set('');
    this.lastJson.set(null);

    const t0 = performance.now();

    try {
      const parse = await this.buildParseCached();

      const env = {
        ideaName: parse.ideaName,
        pitch: parse.pitchText,
        round: this.round(),
      };

      const judge = this.labJudge();
      const attackId = this.labAttackId();

      const res = await this.callJudgeWithAttack(judge, env, parse, attackId);

      this.lastJson.set(res);
      this.lastMs.set(Math.round(performance.now() - t0));
    } catch (e: any) {
      console.error(e);
      this.lastRaw.set(String(e?.message ?? e));
      this.lastMs.set(Math.round(performance.now() - t0));
    } finally {
      this.running.set(false);
    }
  }

  async runBatch() {
    if (this.batchRunning()) return;
    const pitch = (this.labPitch() ?? '').trim();
    if (pitch.length < 10) return;

    this.batchRunning.set(true);
    this.batchResults.set([]);

    try {
      // Build parse once (or stub if parseMode === none)
      const parse = await this.buildParseCached();

      const arena = this.judgesService.getArena();
      const judges = arena.judges
        .filter((j) => j.id !== 'host')
        .map((j) => j.id as Exclude<string, 'host'>);

      const modeSet = new Set<PanelMode>();
      arena.judges.forEach((j) => {
        const judgeModes = Object.keys(j.vectors ?? {}) as PanelMode[];
        judgeModes.forEach((m) => modeSet.add(m));
      });
      const modes = Array.from(modeSet);

      // Sequential to avoid rate limits and keep UI stable
      for (const mode of modes) {
        for (const judge of judges) {
          const vectors = this.judgesService
            .getVectors(judge, mode)
            .slice(0, 2);

          for (const v of vectors) {
            const t0 = performance.now();

            const env = {
              ideaName: parse.ideaName,
              pitch: parse.pitchText,
              round: mode === 'discovery' ? 1 : 2,
            };

            // temporarily run in that mode/judge WITHOUT mutating the UI state
            const res = await this.callJudgeWithAttackWithOverrides(
              judge,
              mode,
              env,
              parse,
              v.id
            );

            const ms = Math.round(performance.now() - t0);

            this.batchResults.update((list) =>
              list.concat({
                judge,
                mode,
                attackId: v.id,
                score: res.score,
                ms,
                comment: res.comment,
                question: res.question,
              })
            );
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      this.batchRunning.set(false);
      const first = this.vectors()[0]?.id ?? '';
      this.labAttackId.set(first);
    }
  }

  exportBatchResults() {
    const results = this.batchResults();
    if (!results.length) return;

    const payload = {
      ideaName: (this.labIdeaName() ?? '').trim() || 'Untitled idea',
      pitch: (this.labPitch() ?? '').trim(),
      timestamp: new Date().toISOString(),
      results,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `batch-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ---------------------------
  // Core prompting (FAST versions)
  // ---------------------------

  private vectorsFor(
    judge: Exclude<string, 'host'>,
    mode: PanelMode
  ): AttackVector[] {
    return this.judgesService.getVectors(judge, mode);
  }

  private refreshVectors() {
    const judge = this.labJudge();
    const mode = this.labMode();
    this.vectors.set(this.judgesService.getVectors(judge, mode));
  }

  /**
   * ✅ FAST: One call that returns claims + assumptions + openQuestions
   */
  private promptMergedParse(env: { ideaName: string; pitchText: string }) {
    const system = [
      'You extract structured CLAIMS from a startup pitch, then derive ASSUMPTIONS and OPEN QUESTIONS.',
      'Return ONLY valid JSON. No markdown. No code fences.',
      '',
      'Schema:',
      JSON.stringify({
        claims: [
          {
            id: 'c1',
            type: 'value|user|market|technical|goToMarket|pricing|competition|ops',
            text: '...',
            quote: '...',
            specificityScore: 0.0,
            confidence: 0.0,
            tags: ['core'],
          },
        ],
        entities: {
          buyer: false,
          price: false,
          metric: false,
          data: false,
          time: false,
          wedge: false,
        },
        assumptions: [
          {
            id: 'a1',
            claimId: 'c1',
            category: 'technical|market|product|execution|legal',
            statement: '...',
            criticality: 'existential|high|medium|low',
            testability: 'high|medium|low',
            confidence: 0.0,
          },
        ],
        openQuestions: [
          {
            id: 'q1',
            priority: 'p0|p1|p2',
            question: '...',
            linkedTo: ['a1', 'c1'],
          },
        ],
      }),
      '',
      'Rules:',
      `- claims: 4..${this.maxClaims()}`,
      `- assumptions: 2..${this.maxAssumptions()}`,
      `- openQuestions: 0..${this.maxOpenQuestions()}`,
      '- specificityScore and confidence are 0..1',
      '- Keep each text/statement under ~140 chars.',
      '- Make existential assumptions explicit and testable.',
    ].join('\n');

    const user = [`IDEA NAME: ${env.ideaName}`, `PITCH:`, env.pitchText].join(
      '\n'
    );
    return { system, user };
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

  private clampScoreByMode(n: number, mode: PanelMode) {
    const s = this.clampScore(n);
    // discovery: keep it kinder
    if (mode === 'discovery') return Math.max(4.0, Math.min(7.0, s));
    return s;
  }

  private hash(s: string): string {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(16);
  }

  /**
   * ✅ FASTEST:
   * - parseMode === 'none' -> returns a stub parse (0 AI calls)
   * - parseMode === 'merged' -> 1 AI call (cached)
   */
  private buildParseCached(): Promise<PitchParse> {
    const ideaName = (this.labIdeaName() ?? '').trim() || 'Untitled idea';
    const pitchText = (this.labPitch() ?? '').trim();

    if (this.parseMode() === 'none') {
      return Promise.resolve({
        version: '1.0',
        ideaName,
        pitchText,
        claims: [],
        assumptions: [],
        openQuestions: [],
      } as PitchParse);
    }

    const key = this.hash(
      `${ideaName}::${pitchText}::${this.maxClaims()}::${this.maxAssumptions()}::${this.maxOpenQuestions()}`
    );
    const cached = this.parseCache.get(key);
    if (cached) return Promise.resolve(cached);

    const env = { ideaName, pitchText };
    const p = this.promptMergedParse(env);

    return this.ai.textPrompt(p.user, p.system).then((raw) => {
      // Save raw for debugging parse quality too
      this.lastRaw.set(
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      );

      const obj = this.coerceJson(raw, {
        claims: [],
        entities: {},
        assumptions: [],
        openQuestions: [],
      });

      const final: PitchParse = {
        version: '1.0',
        ideaName,
        pitchText,
        claims: (obj.claims ?? []).map((c: any, i: number) => ({
          id: String(c.id ?? `c${i + 1}`),
          type: c.type ?? 'value',
          text: String(c.text ?? ''),
          quote: c.quote ? String(c.quote) : undefined,
          specificityScore: this.clamp01(Number(c.specificityScore ?? 0.2)),
          confidence: this.clamp01(Number(c.confidence ?? 0.6)),
          tags: Array.isArray(c.tags) ? c.tags.map(String) : [],
        })),
        assumptions: (obj.assumptions ?? []).map((x: any, i: number) => ({
          id: String(x.id ?? `a${i + 1}`),
          claimId: String(x.claimId ?? `c1`),
          category: x.category ?? 'technical',
          statement: String(x.statement ?? ''),
          criticality: x.criticality ?? 'medium',
          testability: x.testability ?? 'medium',
          confidence: this.clamp01(Number(x.confidence ?? 0.6)),
        })),
        openQuestions: (obj.openQuestions ?? []).map((q: any, i: number) => ({
          id: String(q.id ?? `q${i + 1}`),
          priority: q.priority ?? 'p1',
          question: String(q.question ?? ''),
          linkedTo: Array.isArray(q.linkedTo) ? q.linkedTo.map(String) : [],
        })),
      };

      this.parseCache.set(key, final);
      return final;
    });
  }

  private coerceJudgeJson(
    raw: any,
    expectedJudge: Exclude<string, 'host'>
  ): JudgeJson {
    if (raw && typeof raw === 'object') {
      return {
        judge: raw.judge ?? expectedJudge,
        score: Number(raw.score ?? 0),
        comment: String(raw.comment ?? ''),
        question: String(raw.question ?? ''),
      };
    }

    const s = String(raw ?? '')
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```[\s\r\n]*$/i, '')
      .trim();

    try {
      const obj = JSON.parse(s);
      return {
        judge: obj.judge ?? expectedJudge,
        score: Number(obj.score ?? 0),
        comment: String(obj.comment ?? ''),
        question: String(obj.question ?? ''),
      };
    } catch {
      return {
        judge: expectedJudge,
        score: 5.0,
        comment: s || 'Invalid JSON returned.',
        question: 'Could you restate your core point in one sentence?',
      };
    }
  }

  private callJudgeWithAttack(
    judge: Exclude<string, 'host'>,
    env: { ideaName: string; pitch: string; round: number },
    parse: PitchParse,
    attackId: string
  ): Promise<JudgeJson> {
    return this.callJudgeWithAttackWithOverrides(
      judge,
      this.labMode(),
      env,
      parse,
      attackId
    );
  }

  private callJudgeWithAttackWithOverrides(
    judge: Exclude<string, 'host'>,
    mode: PanelMode,
    env: { ideaName: string; pitch: string; round: number },
    parse: PitchParse,
    attackId: string
  ): Promise<JudgeJson> {
    const vectors = this.vectorsFor(judge, mode);
    const vector = vectors.find((v) => v.id === attackId);

    if (!vector) {
      return Promise.resolve({
        judge,
        score: 5.0,
        comment: `No vector found for attackId=${attackId}`,
        question: 'Pick a valid attackId.',
      });
    }

    const system = this.judgesService.attackSystemPrompt({
      judgeId: judge,
      vector,
      round: env.round,
      previouslyAsked: false, // lab is deterministic
      lastTopic: vector.category,
      tone: this.judgeTone(),
      mode,
    });

    // ✅ showContext false = smallest prompt (fast + cheap)
    const structuredContext = this.showContext()
      ? {
          topClaims: (parse.claims ?? []).slice(0, 6),
          assumptions: (parse.assumptions ?? []).slice(0, 6),
          openQuestions: (parse.openQuestions ?? []).slice(0, 6),
          attackId,
        }
      : { attackId };

    const user = [
      `ROUND: ${env.round}`,
      `IDEA NAME: ${env.ideaName}`,
      `PITCH: ${env.pitch}`,
      '',
      'STRUCTURED CONTEXT:',
      JSON.stringify(structuredContext),
    ].join('\n');

    return this.ai.textPrompt(user, system).then((raw: any) => {
      this.lastRaw.set(
        typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)
      );
      const json = this.coerceJudgeJson(raw, judge);

      return {
        judge,
        score: this.clampScoreByMode(json.score, mode),
        comment: String(json.comment ?? '').trim(),
        question: String(json.question ?? '').trim(),
      };
    });
  }

  // helper for UI
  vectorLabel(v: AttackVector) {
    return `${v.id} • ${v.category}`;
  }
}
