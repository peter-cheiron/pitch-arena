import { Component, NgZone, inject, signal, computed } from '@angular/core';
import { ActivatedRoute } from '@angular/router';


import { ArenaConfig, ArenaJudgeConfig } from '../models/arena-config';
import { ArenaService } from '../services/arena-service';
import { JudgeService, JudgeMemoryLite, JudgeTurnResult } from '../services/judge.service';
import { ChatUiComponent, ChatUIMessage } from '../chat/chat-ui';
import { JsonPipe } from '@angular/common';

@Component({
  selector: 'judge-lab-page',
  imports: [
    //ChatUiComponent, 
    JsonPipe],
  templateUrl: './judge-lab.page.html',
})
export class JudgeLabPage {
  arenaService = inject(ArenaService);
  judgeService = inject(JudgeService);
  route = inject(ActivatedRoute);
  zone = inject(NgZone);

  arenaLoaded = signal(false);

  // ---- editable inputs (lab UI) ----
  arenaPath = signal<string>('arena_gemini_hackathon_ready'); // default
  arenaConfig = signal<ArenaConfig | null>(null);
  arenaJsonText = signal<string>(''); // editable JSON blob

  // proposition input (static)
  propositionProfileText = signal<string>(
    JSON.stringify(
      {
        founderName: 'Test Founder',
        ideaName: 'Pitch Arena',
        pitch:
          'A web app where founders rehearse hackathon/incubator Q&A with AI judges; output is transcript + actionable plan.',
        targetUser: 'Founders applying to incubators/hackathons',
        targetContext: '48 hours before interviews / demo day',
        firstValue: 'Repeatable pressure-test + specific next steps',
        acquisitionPath: 'Incubator partnerships + founder communities',
        inputSource: 'Founder pitch text + optional deck text',
      },
      null,
      2
    )
  );

  lastDeltaText = signal<string>(
    'Q: What is the demo flow?\nA: Founder selects arena, answers one question, gets score + plan.'
  );

  mode = signal<'discovery' | 'interrogation' | 'impact'>('discovery');

  // judge selection
  judgeId = signal<string>('vc');

  judges = computed(() => (this.arenaConfig()?.judges ?? []).filter((j) => j.id !== 'host'));
  selectedJudge = computed<ArenaJudgeConfig | null>(() => {
    const cfg = this.arenaConfig();
    if (!cfg) return null;
    return (cfg.judges ?? []).find((j) => j.id === this.judgeId()) ?? null;
  });

  // ---- state for simulation ----
  memory = signal<JudgeMemoryLite | null>(null);
  lastResult = signal<JudgeTurnResult | null>(null);

  // Multi-run history (so you can see diversity)
  results = signal<
    Array<{
      ts: number;
      turn: number;
      askedCriteriaId?: string;
      score: number;
      question: string;
      comment: string;
      coverage: any;
    }>
  >([]);

  // Chat-like view (optional, but handy)
  messages = signal<ChatUIMessage[]>([
    { id: crypto.randomUUID(), role: 'system', text: 'Judge Lab ready.' },
  ]);

  // controls
  turnCounter = signal<number>(0);
  batchCount = signal<number>(5);
  inFlight = signal<boolean>(false);

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path');
    if (path) this.arenaPath.set(path);

    // auto-load from assets by default
    this.loadArenaFromAssets(this.arenaPath());
  }

  // ---------------- loading ----------------

  async loadArenaFromAssets(path: string) {
    this.arenaLoaded.set(false);
    this.resetRunState();

    const cfg = await this.arenaService.getArenaConfig(path);
    this.arenaConfig.set(cfg);

    // keep an editable copy in the lab
    this.arenaJsonText.set(JSON.stringify(cfg, null, 2));

    // pick first non-host judge by default
    const firstJudge = (cfg.judges ?? []).find((j) => j.id !== 'host');
    if (firstJudge) this.judgeId.set(firstJudge.id);

    this.arenaLoaded.set(true);
    this.pushSystem(`Loaded arena: ${cfg.name || cfg.id}`);
  }

  loadArenaFromEditor() {
    this.resetRunState();
    try {
      const cfg = JSON.parse(this.arenaJsonText());
      this.arenaConfig.set(cfg);
      const firstJudge = (cfg.judges ?? []).find((j) => j.id !== 'host');
      if (firstJudge) this.judgeId.set(firstJudge.id);
      this.arenaLoaded.set(true);
      this.pushSystem('Loaded arena from JSON editor.');
    } catch (e) {
      this.pushSystem('JSON parse failed. Check arena JSON editor.');
      console.error(e);
    }
  }

  setBatchCount(v: any) {
  const n = parseInt(String(v ?? ''), 10);
  this.batchCount.set(Number.isFinite(n) ? Math.max(1, Math.min(20, n)) : 5);
}

  // ---------------- simulation ----------------

  async runOneTurn() {
    if (this.inFlight()) return;
    const cfg = this.arenaConfig();
    const judge = this.selectedJudge();
    if (!cfg || !judge) return;

    const profile = this.safeJsonParse(this.propositionProfileText(), {});
    const lastDelta = (this.lastDeltaText() ?? '').trim();

    this.inFlight.set(true);
    try {
      const res = await this.judgeService.runTurn(cfg, judge, {
        profile,
        lastDelta: lastDelta || undefined,
        memory: this.memory() ?? undefined,
        mode: this.mode(),
      });

      // update memory for anti-repeat
      const nextMem = this.judgeService.nextMemory(this.memory() ?? undefined, res);
      this.memory.set(nextMem);

      // store result
      const turn = this.turnCounter() + 1;
      this.turnCounter.set(turn);
      this.lastResult.set(res);

      this.results.update((list) => [
        ...list,
        {
          ts: Date.now(),
          turn,
          askedCriteriaId: res.askedCriteriaId,
          score: res.score,
          question: res.question,
          comment: res.comment,
          coverage: res.coverage,
        },
      ]);

      // push to chat view
      this.messages.update((m) => [
        ...m,
        {
          id: crypto.randomUUID(),
          role: 'system',
          text: `Turn ${turn} • asked=${res.askedCriteriaId || 'n/a'} • score=${res.score.toFixed(1)}`,
        },
        {
          id: crypto.randomUUID(),
          role: 'ai',
          text: `${res.comment}\n\n${res.question}`,
        },
      ]);
    } finally {
      this.inFlight.set(false);
    }
  }

  async runBatch() {
    const n = Math.max(1, Math.min(20, Number(this.batchCount()) || 1));
    for (let i = 0; i < n; i++) {
      // sequential on purpose (keeps memory consistent + avoids rate issues)
      // eslint-disable-next-line no-await-in-loop
      await this.runOneTurn();
    }
  }

  resetRunState() {
    this.memory.set(null);
    this.lastResult.set(null);
    this.results.set([]);
    this.turnCounter.set(0);
    this.inFlight.set(false);
    this.messages.set([{ id: crypto.randomUUID(), role: 'system', text: 'Judge Lab reset.' }]);
  }

  // ---------------- utilities ----------------

  private pushSystem(text: string) {
    this.messages.update((m) => [...m, { id: crypto.randomUUID(), role: 'system', text }]);
  }

  private safeJsonParse(s: string, fallback: any) {
    try {
      return JSON.parse(String(s ?? ''));
    } catch {
      return fallback;
    }
  }

  // convenience: show the actual prompt text used (optional)
  buildPromptPreview(): string {
    const cfg = this.arenaConfig();
    const judge = this.selectedJudge();
    if (!cfg || !judge) return '';
    const profile = this.safeJsonParse(this.propositionProfileText(), {});
    return this.judgeService.getPrompt(cfg, judge, {
      profile,
      lastDelta: (this.lastDeltaText() ?? '').trim() || undefined,
      memory: this.memory() ?? undefined,
      mode: this.mode(),
    });
  }
}
