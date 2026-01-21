import { ArenaProfile, ChatMsg, EndSummary, JudgeRun, Phase } from "./models/arena-config";


export type ArenaExportSnapshot = {
  exportedAt: string;
  phase: Phase;
  round: number;
  profile: ArenaProfile;
  judgeRuns: JudgeRun[];
  chat: ChatMsg[];
  endSummary: EndSummary | null;
};

export function exportConversation(input: Omit<ArenaExportSnapshot, 'exportedAt'> & {
  filenamePrefix?: string;
}) {
  const snapshot: ArenaExportSnapshot = {
    exportedAt: new Date().toISOString(),
    phase: input.phase,
    round: input.round,
    profile: input.profile,
    judgeRuns: input.judgeRuns,
    chat: input.chat,
    endSummary: input.endSummary ?? null,
  };

  const json = JSON.stringify(snapshot, null, 2);

  // Browser-only download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const safePrefix = (input.filenamePrefix ?? 'pitch-arena')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  const filename = `${safePrefix}-${new Date()
    .toISOString()
    .replace(/[:.]/g, '-')}.json`;

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.click();

  // cleanup
  setTimeout(() => URL.revokeObjectURL(url), 250);
}

export function coerceJson(raw: any, fallback: any) {
  if (raw && typeof raw === 'object') return raw;

  let s = String(raw ?? '').trim();

  // strip code fences
  s = s
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```[\s\r\n]*$/i, '')
    .trim();

  // extract likely JSON object region
  const first = s.indexOf('{');
  const last = s.lastIndexOf('}');
  if (first !== -1 && last !== -1 && last > first) {
    s = s.slice(first, last + 1);
  }

  // ---- repair pass (best effort) ----
  // 1) Fix accidental double-quote starts inside a string:  ""Sales -> "Sales
  s = s.replace(/:\s*""/g, ': "');

  // 2) Escape unescaped quotes inside string values (simple state machine)
  // This is conservative: it only escapes quotes that appear *inside* a string
  // and are NOT terminating the string (i.e. followed by a letter/number).
  const chars = [...s];
  let out = '';
  let inString = false;
  let escape = false;

  for (let i = 0; i < chars.length; i++) {
    const c = chars[i];
    const next = chars[i + 1] ?? '';

    if (escape) {
      out += c;
      escape = false;
      continue;
    }

    if (c === '\\') {
      out += c;
      escape = true;
      continue;
    }

    if (c === '"') {
      if (!inString) {
        inString = true;
        out += c;
        continue;
      }

      // We are in a string.
      // If this quote is likely an *inner* quote (followed by letter/number),
      // escape it rather than ending the string.
      if (/[A-Za-z0-9]/.test(next)) {
        out += '\\"';
        continue;
      }

      // Otherwise treat as end of string
      inString = false;
      out += c;
      continue;
    }

    out += c;
  }

  s = out;

  try {
    return JSON.parse(s);
  } catch (e) {
    console.warn('[coerceJson] JSON.parse failed', e);
    return fallback;
  }
}
