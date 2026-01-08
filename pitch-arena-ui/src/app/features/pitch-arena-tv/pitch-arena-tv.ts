import { GeminiService } from '#services/ai/gemini.service';
import { SpeechService } from '#services/ai/speech.eleven.service';
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
import {
  getDownloadURL,
  getStorage,
  ref,
  uploadBytes,
} from '@angular/fire/storage';
import { FormsModule } from '@angular/forms';

type JudgeId = 'host' | 'vc' | 'cto' | 'product';
type Phase = 'intro' | 'judging' | 'answering' | 'results';

type JudgeConfig = { id: JudgeId; label: string; dimension: string };

type ArenaProfile = {
  founderName: string;
  ideaName: string;
  pitch: string;
  timePerWeek?: string;
  runwayMonths?: string;
  experience?: string;
};

type HostJson = {
  phase: 'intro';
  ready: boolean;
  nextQuestion: string;
  // optional, partial updates
  profile?: Partial<ArenaProfile>;
  comment?: string; // short
};

type JudgeJson = {
  judge: Exclude<JudgeId, 'host'>;
  score: number;
  comment: string;
  question: string;
};

type JudgeRun = {
  judge: Exclude<JudgeId, 'host'>;
  judgeLabel: string;
  dimension: string;
  score: number;
  delta: number | null;
  comment: string;
  question: string;
  answer: string;
};

type ArenaMemory = {
  lastScore: number;
  lastQuestion: string;
  lastAnswer: string;
};

type ChatMsg = {
  id: string;
  role: 'judge' | 'user' | 'system';
  judgeId?: JudgeId;
  title?: string;
  text: string;

  // voice
  voiceId?: string; // which voice to use
  audioUrl?: string | null; // storage mp3 url
  audioState?: 'idle' | 'loading' | 'ready' | 'error';
};

@Component({
  selector: 'app-pitch-arena',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './pitch-arena-tv.html',
})
export class PitchArenaTv {
  ai = inject(GeminiService);
  speech = inject(SpeechService);

  // ----- Config (3 or 4 judges) -----
  judges: JudgeConfig[] = [
    { id: 'host', label: 'Host', dimension: 'Warm-up' },
    { id: 'vc', label: 'VC Judge', dimension: 'Fundability' },
    { id: 'cto', label: 'CTO Judge', dimension: 'Feasibility' },
    { id: 'product', label: 'Product Judge', dimension: 'Usefulness' },
  ];

  judgeVoices: Record<JudgeId, string> = {
    host: '6F5Zhi321D3Oq7v1oNT4',
    vc: 'NYC9WEgkq1u4jiqBseQ9',
    cto: 'PB6BdkFkZLbI39GHdnbQ',//bad female voice and is slow
    product: 'Ori1rnHIeeysIxrsFZ2X',
  };

  // ----- State -----
  phase = signal<Phase>('intro');
  round = signal<number>(1);

  profile = signal<ArenaProfile>({
    founderName: '',
    ideaName: '',
    pitch: '',
  });

  judgeRuns = signal<JudgeRun[]>([]);
  currentJudgeIndex = signal<number>(0);

  chat = signal<ChatMsg[]>([]);
  input = signal<string>('');
  repromptInput = signal<string>('');
  reprompting = signal<boolean>(false);
  @ViewChild('chatWindow') chatWindow?: ElementRef<HTMLElement>;
  private autoScrollEffect = effect(() => {
    this.chat();
    queueMicrotask(() => this.scrollChatToBottom());
  });

  private memory = new Map<Exclude<JudgeId, 'host'>, ArenaMemory>();
  private lastOverall: number | null = null;

  // ----- Derived -----
  phaseLabel = computed(() => {
    const p = this.phase();
    if (p === 'intro') return 'Warm-up';
    if (p === 'judging') return 'Judging';
    if (p === 'answering') return 'Answering';
    return 'Scored';
  });

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
    return (
      !!runs.length && runs.every((r) => (r.answer ?? '').trim().length >= 10)
    );
  });

  // ----- Init -----
  constructor() {
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

  // ----- UI actions -----
  reset() {
    this.phase.set('intro');
    this.round.set(1);
    this.profile.set({ founderName: '', ideaName: '', pitch: '' });
    this.judgeRuns.set([]);
    this.currentJudgeIndex.set(0);
    this.input.set('');
    this.chat.set([
      {
        id: crypto.randomUUID(),
        role: 'judge',
        judgeId: 'host',
        title: 'Host • Warm-up',
        text: 'Welcome to Pitch Arena. In one line: who are you?',
      },
    ]);
    this.memory.clear();
    this.lastOverall = null;
  }

  send() {
    if (!this.canSend()) return;

    const text = (this.input() ?? '').trim();
    this.input.set('');

    // push user msg
    this.chat.update((list) =>
      list.concat({
        id: crypto.randomUUID(),
        role: 'user',
        text,
      })
    );

    if (this.phase() === 'intro') {
      this.hostTurn(text);
      return;
    }

    if (this.phase() === 'answering') {
      this.panelAnswerTurn(text);
      return;
    }
  }

  // ----- Intro: Host is AI-led -----
  private hostTurn(userAnswer: string) {
    // Build context from profile so far + last host question
    const prof = this.profile();
    const lastHostQ = this.lastJudgeQuestionText('host') ?? 'Warm-up';

    const system = this.hostSystemPrompt();
    const user = this.hostUserPrompt(prof, lastHostQ, userAnswer);

    this.ai
      .textPrompt(user, system)
      .then((raw) => {
        const json = this.coerceHostJson(raw);

        // apply profile patches
        if (json.profile) {
          this.profile.update((p) => ({ ...p, ...json.profile }));
        }

        // optional short host comment
        if ((json.comment ?? '').trim()) {
          this.chat.update((list) =>
            list.concat({
              id: crypto.randomUUID(),
              role: 'judge',
              judgeId: 'host',
              title: 'Host',
              text: String(json.comment).trim().slice(0, 160),
            })
          );
        }

        // next question
        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'judge',
            judgeId: 'host',
            title: 'Host • Warm-up',
            text: String(json.nextQuestion ?? 'Tell me more.')
              .trim()
              .slice(0, 220),
          })
        );

        // if ready -> start formal panel
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
        // graceful fallback: keep going with a safe host question
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

  private hostSystemPrompt(): string {
    return [
      'You are the Host in Pitch Arena. You run the warm-up before the judges.',
      '',
      'Goal: collect the basics with minimal friction:',
      '- founderName (string)',
      '- ideaName (string)',
      '- pitch (2-4 sentences)',
      '- optional: timePerWeek, runwayMonths, experience',
      '',
      'Style:',
      '- conversational, not formal',
      '- one question at a time',
      '- keep it short',
      '',
      'Output MUST be valid JSON with EXACT keys:',
      '{"phase":"intro","ready":false,"nextQuestion":"...","profile":{"founderName":"...","ideaName":"...","pitch":"...","timePerWeek":"...","runwayMonths":"...","experience":"..."},"comment":"..."}',
      '',
      'Rules:',
      '- profile is optional and may be partial (only include fields you confidently extracted).',
      '- nextQuestion is required.',
      '- ready becomes true only when founderName, ideaName, and pitch are all present and reasonable.',
      '- No markdown. No code fences.',
    ].join('\n');
  }

  private hostUserPrompt(
    profile: ArenaProfile,
    lastQ: string,
    lastA: string
  ): string {
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
    if (raw && typeof raw === 'object') {
      return {
        phase: 'intro',
        ready: !!raw.ready,
        nextQuestion: String(raw.nextQuestion ?? 'Tell me more.'),
        profile: raw.profile ?? undefined,
        comment: raw.comment ? String(raw.comment) : undefined,
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
        phase: 'intro',
        ready: !!obj.ready,
        nextQuestion: String(obj.nextQuestion ?? 'Tell me more.'),
        profile: obj.profile ?? undefined,
        comment: obj.comment ? String(obj.comment) : undefined,
      };
    } catch {
      // fallback that keeps flow safe
      return {
        phase: 'intro',
        ready: false,
        nextQuestion: 'What’s the name of your idea, and who is it for?',
      };
    }
  }

  private lastJudgeQuestionText(judgeId: JudgeId): string | null {
    const list = this.chat();
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'judge' && m.judgeId === judgeId) return m.text;
    }
    return null;
  }

  // ----- Formal round (existing judge logic) -----
  private startRound() {
    // must have basics; if host jumped the gun, guard
    const p = this.profile();
    if (
      (p.ideaName ?? '').trim().length < 2 ||
      (p.pitch ?? '').trim().length < 20
    ) {
      this.phase.set('intro');
      this.chat.update((list) =>
        list.concat({
          id: crypto.randomUUID(),
          role: 'judge',
          judgeId: 'host',
          title: 'Host • Warm-up',
          text: 'I need a slightly clearer pitch first: 2–4 concrete sentences.',
        })
      );
      return;
    }

    this.phase.set('judging');

    const env = {
      ideaName: p.ideaName.trim() || 'Untitled idea',
      pitch: p.pitch.trim(),
      round: this.round(),
    };

    const panel = this.judges.filter((j) => j.id !== 'host') as Array<
      JudgeConfig & { id: Exclude<JudgeId, 'host'> }
    >;
    const calls = panel.map((j) => this.callJudge(j.id, env));

    Promise.all(calls)
      .then((results) => {
        const runs: JudgeRun[] = results.map((r) => {
          const prev = this.memory.get(r.judge);
          const delta = prev ? r.score - prev.lastScore : null;
          const conf = panel.find((x) => x.id === r.judge)!;

          return {
            judge: r.judge,
            judgeLabel: conf.label,
            dimension: conf.dimension,
            score: r.score,
            delta,
            comment: r.comment,
            question: r.question,
            answer: prev?.lastAnswer ?? '',
          };
        });

        this.judgeRuns.set(runs);
        this.currentJudgeIndex.set(0);
        this.phase.set('answering');

        // first judge prompt
        this.pushJudgeBubble(runs[0]);
      })
      .catch((err) => {
        console.error(err);
        this.phase.set('intro');
        this.chat.update((list) =>
          list.concat({
            id: crypto.randomUUID(),
            role: 'judge',
            judgeId: 'host',
            title: 'Host • Warm-up',
            text: 'Judges failed to load. Give me the pitch in one sentence again.',
          })
        );
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
  }

submitAnswersAndRescore() {
  if (!this.canRescore()) return;

  const currentRuns = this.judgeRuns();

  currentRuns.forEach((r) => {
    this.memory.set(r.judge, {
      lastScore: r.score,
      lastQuestion: r.question,
      lastAnswer: r.answer,
    });
  });

  this.lastOverall = this.avg(currentRuns.map((x) => x.score));
  this.round.set(this.round() + 1);

  // clear per-round stuff
  this.judgeRuns.set([]);
  this.currentJudgeIndex.set(0);

  // ✅ DO NOT set phase to 'judging' here
  // Let startRound handle it
  this.startRound();
}


  exportConversation() {
    const snapshot = this.conversationSnapshot();
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
          typeof res === 'string'
            ? res
            : JSON.stringify(res, null, 2);

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

  // ----- Judge prompts (unchanged from your logic) -----
  private sharedSystemPrompt(): string {
    return [
      'You are a judge in Pitch Arena, a fast-paced pitch evaluation game.',
      '',
      'Rules:',
      '- Be opinionated and concise.',
      '- Do not give generic startup advice.',
      '- Do not explain frameworks.',
      '- Speak like a real human judge, not an AI.',
      '- Focus on ONE core issue.',
      '- Ask exactly ONE hard question.',
      '- Score from 0.0 to 10.0 (one decimal).',
      '- No emojis. No fluff.',
      '',
      'Return ONLY valid JSON with EXACTLY these keys:',
      '{"judge":"vc|cto|product","score":0.0,"comment":"...","question":"..."}',
      '',
      'No markdown. No code fences. No extra keys.',
    ].join('\n');
  }

  private rolePrompt(judge: Exclude<JudgeId, 'host'>): string {
    if (judge === 'vc') {
      return [
        'You are the VC judge in Pitch Arena.',
        'Your job: evaluate fundability at seed stage.',
        'Focus on: who pays, why now, wedge, scale potential.',
      ].join('\n');
    }
    if (judge === 'cto') {
      return [
        'You are the CTO judge in Pitch Arena.',
        'Your job: evaluate technical feasibility and MVP realism.',
        'Focus on: scope, speed to first usable version, hidden complexity, overbuilding.',
        'Assume a small team and limited time.',
      ].join('\n');
    }
    return [
      'You are the Product judge in Pitch Arena.',
      'Your job: evaluate real user value and clarity of outcome.',
      'Focus on: user, pain, outcome, "aha moment", retention reason.',
      'Be practical, not theoretical.',
    ].join('\n');
  }

  private userPrompt(
    judge: Exclude<JudgeId, 'host'>,
    env: { ideaName: string; pitch: string; round: number }
  ): string {
    const mem = this.memory.get(judge);

    const lines: string[] = [
      `MODE: fun`,
      `ROUND: ${env.round}`,
      ``,
      `IDEA NAME: ${env.ideaName}`,
      `PITCH:`,
      env.pitch,
    ];

    if (mem) {
      lines.push(
        '',
        'PREVIOUS ROUND:',
        `Previous score: ${mem.lastScore.toFixed(1)}`,
        `Previous question: ${mem.lastQuestion}`,
        `Founder answer: ${mem.lastAnswer}`,
        '',
        'TASK:',
        '- Update your score based on the founder answer.',
        '- Give a new comment.',
        '- Ask a NEW deeper hard question.'
      );
    }

    lines.push('', `IMPORTANT: Set "judge" to "${judge}".`);
    return lines.join('\n');
  }

  private callJudge(
    judge: Exclude<JudgeId, 'host'>,
    env: { ideaName: string; pitch: string; round: number }
  ): Promise<{
    judge: Exclude<JudgeId, 'host'>;
    score: number;
    comment: string;
    question: string;
  }> {
    const system = [this.sharedSystemPrompt(), this.rolePrompt(judge)].join(
      '\n\n'
    );
    const user = this.userPrompt(judge, env);

    return this.ai.textPrompt(user, system).then((raw) => {
      const json = this.coerceJudgeJson(raw, judge);
      return {
        judge,
        score: this.clampScore(json.score),
        comment: String(json.comment ?? '')
          .trim()
          .slice(0, 400),
        question: String(json.question ?? '')
          .trim()
          .slice(0, 240),
      };
    });
  }

  private coerceJudgeJson(
    raw: any,
    expectedJudge: Exclude<JudgeId, 'host'>
  ): JudgeJson {
    if (raw && typeof raw === 'object') {
      return {
        judge: raw.judge ?? expectedJudge,
        score: Number(raw.score ?? 0),
        comment: String(raw.comment ?? ''),
        question: String(raw.question ?? ''),
      } as JudgeJson;
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
      } as JudgeJson;
    } catch {
      return {
        judge: expectedJudge,
        score: 5.0,
        comment: s.slice(0, 300) || 'No comment returned.',
        question: 'Be specific: who pays, why now, and what is the first MVP?',
      } as JudgeJson;
    }
  }

  // ----- UI helpers -----
  judgeBadge(judge: JudgeId) {
    if (judge === 'host') return '🎤';
    if (judge === 'vc') return '💼';
    if (judge === 'cto') return '🛠️';
    return '🧩';
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

  private avg(nums: number[]) {
    return nums.reduce((a, n) => a + n, 0) / Math.max(1, nums.length);
  }

  private clampScore(n: number) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
  }

  private conversationSnapshot() {
    return {
      exportedAt: new Date().toISOString(),
      phase: this.phase(),
      round: this.round(),
      profile: this.profile(),
      judgeRuns: this.judgeRuns(),
      chat: this.chat(),
    };
  }

  private conversationTranscript() {
    return this.chat()
      .map((m) => {
        const speaker =
          m.role === 'judge'
            ? m.title || `Judge:${m.judgeId ?? ''}`
            : m.role;
        return `${speaker}:\n${m.text}`;
      })
      .join('\n\n');
  }

  private scrollChatToBottom() {
    const el = this.chatWindow?.nativeElement;
    if (!el) return;

    el.scrollTop = el.scrollHeight;
  }

  //TODO refactor so that this code is a seperate reusable component 
  //ensure its used in the ui too.
  //-----------------voice----------------//

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

    // toggle
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
    if (msg.audioUrl) return; // already ready

    // mark loading
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
        // auto-play after ready (optional)
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

  //record now

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
      .catch((err) => {
        console.error('Mic access denied', err);
      });
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
      .then((url) => {
        // 🎯 Now convert speech → text
        this.applySpeechUrl(url);
      })
      .catch((err) => {
        console.error('Upload failed', err);
      });
  }

applySpeechUrl(url: string) {
  this.speech.speechToText(url)
    .then((text) => {
      const cleaned = (text ?? '').trim();
      if (!cleaned) return;

      // ✅ Auto-submit immediately (no manual Send)
      this.submitText(cleaned);
    })
    .catch(err => {
      console.error('speechToText failed', err);
    });
}

private submitText(text: string) {
  const cleaned = (text ?? '').trim();
  if (!cleaned) return;

  // set input so UI reflects what was said (optional)
  this.input.set(cleaned);

  // call the same pipeline as clicking Send
  // but without relying on canSend computed being in sync
  this.send();

  // send() clears input already; if yours doesn't, clear here:
  // this.input.set('');
}


}
