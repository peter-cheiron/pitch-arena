  // ---------------- parsing + normalize ----------------

import { CriteriaCoverage, JudgeCriteria } from "./panel-judge.service";

  export function parseJson(raw: any): any | null {
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
      return null;
    }
  }

  export function normalizeCoverage(input: any, criteria: JudgeCriteria[]): CriteriaCoverage[] {
    const map = new Map<string, CriteriaCoverage>();

    if (Array.isArray(input)) {
      for (const row of input) {
        const id = str(row?.id);
        if (!id) continue;

        const statusRaw = str(row?.status).toLowerCase();
        const status: CriteriaCoverage['status'] =
          statusRaw.includes('clear') ? 'clear' :
          statusRaw.includes('partial') ? 'partial' :
          'missing';

        const note = row?.note ? str(row.note).slice(0, 120) : undefined;

        map.set(id, { id, status, note });
      }
    }

    return criteria.map((c) => map.get(c.id) ?? ({ id: c.id, status: 'missing' }));
  }

  export function clampScore(n: number) {
    const x = Number.isFinite(n) ? n : 0;
    return Math.max(0, Math.min(10, Math.round(x * 10) / 10));
  }

  export function oneSentence(q: string): string {
    const s = str(q);
    if (!s) return s;
    const m = s.match(/^(.+?[.!?])(\s|$)/);
    return m ? m[1].trim() : s;
  }

  export function normalizeVerdictHint(v: any): 'pass' | 'maybe' | 'fail' | undefined {
    const s = str(v).toLowerCase();
    if (!s) return undefined;
    if (s.includes('pass') || s.includes('go') || s.includes('strong')) return 'pass';
    if (s.includes('fail') || s.includes('no') || s.includes('reject')) return 'fail';
    return 'maybe';
  }

  // ---------------- tiny utils ----------------

  export function str(x: any) {
    return String(x ?? '').trim();
  }

  export function compact<T>(arr: T[]): T[] {
    return (arr ?? []).filter((x: any) => !!String(x ?? '').trim());
  }

  export function joinLines(...lines: Array<string | null | undefined>) {
    return lines.filter(Boolean).join('\n');
  }


export const pitch_pitch_arena = `
  user name: peter

  ## Inspiration

The idea came out of the general experience we have with many LLMs: you enter an idea and lo and behold it **loves** it:

- wow thats an amazing idea
- love it would you like to vibe code the MVP?
- you should quit your day job and do that right now

Ok, the last one I made up but the experience of getting such positive feedback but then a wave of negatvity from the real world (meaning people) can be somewhat frustrating. Pitch Arena basically uses AI characters that are 'realistic' meaning they have personalities, objectives and a tone or mood. They are there to question you in a hard fashion in order to get a more realistic pitch review. They don't say quit your job, they get you to quit your idea ... sort of

More seriously though having been in and around startups (and companies) for a while now what you do is pitch. If you have ever been in a booth at an event you are going to explain your idea over and over. Pitch Arena helps you prepare for the questions that you will probably get at some point.

## What it does

Starting from the top:

- you create an arena which is a configuration containing objectives, constraints and judges
- judges have their own tone and areas of interest
- user can choose an arena enter and pitch by answering the judges questions
- once its all over the user gets a scorecard 

## How we built it

Currently its quite light:

- Angular UI deployed to Firebase
- Gemini via firebase SDK (limiting in some areas as we don't have full feature access)
- elevenlabs for the TTS and STT 

## Challenges we ran into

The hardest part by far is creating the prompts and managing the flow. We iterated several variations to try and balance the intelligence/realism of the room against performance. If the arena takes +10 secs a question it becomes unrealistic (and boring). 

## Accomplishments that we're proud of

Its strange but when I challenged Pitch Arena in Pitch Arena for the first time I got annoyed with the jury and started typing in a lot of long winded details ... I then realised it was working as I was engaged. 

## What we learned

Prompt and multi state converstations are key to getting something working and its really there that I learned a lot. The notion of a cross round score card and ensuring questions aren't repeated was interesting.

## What's next for Pitch Arena

I think that there are a lot of directions that can be taken:

- the concept could be interesting for incubators, VCs, accelerators in order to screen candidates
- using more of gemini by adding in RAG and/or search in order to pull in information
- integrating into a video conferencing system with perhaps realtime characters

Also it doesn't have to be for pitches as the configuration system is quite open so it could be using for training, interviews, sales teams ... anywhere where you want to test being challenged.
`
