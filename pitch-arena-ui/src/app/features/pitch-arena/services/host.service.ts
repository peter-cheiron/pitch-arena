import { inject, Injectable } from '@angular/core';
import { ArenaConfig, ArenaJudgeConfig } from '../deprecated/models/arena-config';
import { GeminiService } from '#services/ai/gemini.service';

type HostProfile = Record<string, unknown>;

@Injectable({ providedIn: 'root' })
export class HostService {
  gemini = inject(GeminiService);

  /**
   * The client needs to handle the prompt results ...
   * @param user
   * @param system
   * @param usage this is for token counting will add it back in later
   * @returns
   */
  runPrompt(user, system, usage) {
    return this.gemini.textPrompt(user, system);
  }

  getWelcomeMessage(){
    //this is something to think about
  }

  /**
   *
   * @param obj the objective
   * @param args args including profile of host, lastQ asked and the last answer
   * @returns
   */
  getPrompt(
    config: ArenaConfig,
    judge: ArenaJudgeConfig,
    args: {
      profile: HostProfile;
      lastQ: string;
      lastA: string;
    }
  ): string {
    //const obj = this.getArena().objective;
    const objectiveText = config.objective
      ? [
          'ARENA OBJECTIVE:',
          `- ${config.objective.thesis}`,
          ...(config.objective.successDefinition?.length
            ? [
                '- Success means:',
                ...config.objective.successDefinition.map((x) => `  • ${x}`),
              ]
            : []),
          '',
        ].join('\n')
      : '';

    const safety = [];
    if(config.safety){
      safety.push(config.safety)
    }

    return [
      'ROLE: You are the Host in Pitch Arena. Run a warm-up before judges.',
      objectiveText,
      'STYLE: ' + judge.tone,
      'SAFETY: if there are safety consideration and you feel they are being challenged ask ' + safety.join('\n'),
      'GOAL: Collect essentials (one question at a time):',
      `- ${judge.profileConfig.join(', ')}`,
      '',
      'TASK EACH TURN:',
      '- Update profile fields if the founder answer provides them.',
      '- Ask the next single warm-up question.',
      '- If basics are complete, set ready=true and nextQuestion MUST be exactly: "Ready. Let’s begin."',
      '',
      'HARD RULES:',
      '- Return ONLY valid JSON. No markdown. No code fences. No extra keys.',
      '- Keep comment short (<= 20 words).',
      '',
      'OUTPUT JSON SCHEMA (exact keys):',
      `{"phase":"intro","ready":false,"nextQuestion":"...","profile":${JSON.stringify(
        Object.fromEntries(judge.profileConfig.map((field) => [field, '...']))
      )},"comment":"..."}`,
      '',
      'STATE:',
      'CURRENT PROFILE (may be incomplete):',
      JSON.stringify(args.profile),
      '',
      `LAST HOST QUESTION: ${args.lastQ}`,
      `FOUNDER ANSWER: ${args.lastA}`,
    ].join('\n');
  }

  /**
   *
   * @returns a profile that could be configured one day.
   */
  getNewProfile(profileFields) {
    return Object.fromEntries(
      profileFields.map((field) => [field, null])
    );
  }

  /**
   * To avoid losing values between rounds
   * @param base 
   * @param incoming 
   * @returns 
   */
  mergeProfiles<T extends Record<string, any>>(
    base: T,
    incoming: Partial<T> | null | undefined
  ): T {
    if (!incoming) return { ...base };

    const result: any = { ...base };

    for (const key of Object.keys(incoming) as Array<keyof T>) {
      const value = incoming[key];
      if (value !== null && value !== undefined && value !== '') {
        result[key] = value;
      }
    }
    return result;
  }
}
