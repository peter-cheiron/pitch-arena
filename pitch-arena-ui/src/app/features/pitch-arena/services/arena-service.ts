import { inject, Injectable } from '@angular/core';
import { ArenaConfig } from '../arena-models';
import { firstValueFrom } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { CriteriaCoverage, JudgeTurnResult } from './new-judge.service';

@Injectable({ providedIn: 'root' })
export class ArenaService {
  http = inject(HttpClient);

  async getArenaConfig(path) {
    console.log("looking for", path)
    try {
      const cfg = await firstValueFrom(
        this.http.get<ArenaConfig>('/assets/arenas/' + path + '.json')
      );
      return cfg;
    }catch(err){
      console.log(err)
      return null;
    } 
  }

  //TODO provide some demo hardcoded configs for ease of use.
}

export type HostNote = {
  q:string;
  a:string;
  round: number;
}

export type ArenaMemory = {
  // panel-wide anti-repeat
  askedCriteriaIds: string[];           // last N criteria asked by anyone
  askedQuestions: string[];             // last N question "fingerprints" (to avoid near-duplicates)

  // last turn per judge (keeps continuity without separate memory objects)
  lastByJudge: Record<
    string,
    {
      question: string;
      answer: string;
      askedCriteriaId?: string;
      score?: number;
      ts: number;
    }
  >;

  hostNotes: HostNote[];

  // panel-wide current understanding (merge of latest coverage)
  coverageByCriteria: Record<string, CriteriaCoverage['status']>;
};

export function newArenaMemory(): ArenaMemory {
  return {
    askedCriteriaIds: [],
    askedQuestions: [],
    lastByJudge: {},
    coverageByCriteria: {},
    hostNotes: [] as { q: string; a: string; round: number }[]
  };
}

export function updateArenaMemory(
  memory: ArenaMemory,
  judgeId: string,
  turn: JudgeTurnResult,
  answer: string,
  opts?: {
    keepLastCriteria?: number; // default 10
    keepLastQuestions?: number; // default 10
  }
): ArenaMemory {
  const keepLastCriteria = opts?.keepLastCriteria ?? 10;
  const keepLastQuestions = opts?.keepLastQuestions ?? 10;

  const askedCriteriaIds = [...(memory.askedCriteriaIds ?? [])];
  if (turn.askedCriteriaId) askedCriteriaIds.push(turn.askedCriteriaId);

  const askedQuestions = [...(memory.askedQuestions ?? [])];
  askedQuestions.push(fingerprint(turn.question));

  // Update coverage: take latest status per criterion (simple + effective)
  const coverageByCriteria = { ...(memory.coverageByCriteria ?? {}) };
  for (const c of turn.coverage ?? []) {
    if (!c?.id) continue;
    coverageByCriteria[c.id] = c.status;
  }

  const lastByJudge = { ...(memory.lastByJudge ?? {}) };
  lastByJudge[judgeId] = {
    question: turn.question,
    answer: (answer ?? '').trim(),
    askedCriteriaId: turn.askedCriteriaId,
    score: turn.score,
    ts: Date.now(),
  };

  return {
    askedCriteriaIds: trimTail(askedCriteriaIds, keepLastCriteria),
    askedQuestions: trimTail(askedQuestions, keepLastQuestions),
    lastByJudge,
    coverageByCriteria,
    hostNotes: [] as { q: string; a: string; round: number }[]
  };
}

// ----- helpers -----

function trimTail<T>(arr: T[], max: number): T[] {
  if (!max || max <= 0) return [];
  return arr.length <= max ? arr : arr.slice(arr.length - max);
}

/**
 * Cheap anti-repeat key: normalize wording so "What specific..." doesn’t repeat.
 * This is intentionally rough — it's fast and works well enough.
 */
function fingerprint(q: string): string {
  return String(q ?? '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, '') // remove punctuation (unicode-safe)
    .replace(/\b(what|whats|how|why|when|who|where|could|would|should|do|does|did|please)\b/g, '')
    .trim()
    .slice(0, 160);
}
