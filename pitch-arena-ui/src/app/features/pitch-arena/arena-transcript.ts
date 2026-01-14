import { ChatMsg } from './models/arena-config';

export class ArenaTranscript {
  /** Full conversation transcript (used for reprompt + end summary) */
  static conversation(chat: ChatMsg[]): string {
    return (chat ?? [])
      .map((m) => {
        const speaker =
          m.role === 'judge'
            ? m.title || `Judge:${m.judgeId ?? ''}`
            : m.role;

        return `${speaker}:\n${m.text}`;
      })
      .join('\n\n');
  }

  /** Last round delta transcript: only judge prompts + founder answers since the marker */
  static lastRoundDelta(chat: ChatMsg[], markerTitle = 'All answers captured'): string {
    const list = chat ?? [];
    let start = 0;

    for (let i = list.length - 1; i >= 0; i--) {
      if (list[i].role === 'system' && list[i].title === markerTitle) {
        start = i;
        break;
      }
    }

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

  /** Last judge question bubble text for a given judgeId (host warm-up uses it) */
  static lastJudgeQuestionText(chat: ChatMsg[], judgeId: string): string | null {
    const list = chat ?? [];
    for (let i = list.length - 1; i >= 0; i--) {
      const m = list[i];
      if (m.role === 'judge' && m.judgeId === judgeId) return m.text;
    }
    return null;
  }
}
