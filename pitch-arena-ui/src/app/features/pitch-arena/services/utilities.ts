  // ---------------- parsing + normalize ----------------

import { CriteriaCoverage, JudgeCriteria } from "./new-judge.service";

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