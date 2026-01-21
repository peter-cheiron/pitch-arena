import { ArenaConfig } from "../deprecated/models/arena-config";
import { JudgeRun } from "./arena-page";

export function getPitchArenaPitch() {
  //temporary
  var pitch = `
      pitch arena is an ai run space where founders and creators can test their 
      ideas in a hackathon/shark tank style space. The arena has an overall objective 
      and the judges are aligned with that ojective but also they have their own 
      characters and goals. This allow people to test out their ideas in a real q&a 
      space rather than just testing in front or friends and family or a mirror.
      `;

  // profile init:
  // If you already have a HostPage producing a profile, you can pass it in query params or local storage.
  // Here we default to a minimal profile that still makes judge prompts work.
  var profile = {
    founderName: 'peter',
    ideaName: 'pitch arena',
    pitch: pitch,
    targetUser: 'Early Founders, creators, hackers etc ',
    targetContext: 'preparing and perfecting a pitch',
    firstValue: 'realistic practise',
    acquisitionPath: 'via incubators',
    inputSource: 'Personal pain',
  };
  return profile;
}

//------------------- EXPORT ------------------//

export type EndSummary = {
  finalScore: number;
  verdict: 'pass' | 'maybe' | 'fail';
  oneLiner: string;
  topStrength: string;
  topRisk: string;
  nextStep24h: string;
};

export type GenerateSummaryParams = {
  finalScore: number;
  cfg: ArenaConfig | null;
  profile: any;
  judgeRuns: JudgeRun[];
  textPrompt: (user: string, system: string) => Promise<any>;
  coerceJson: (raw: any, fallback: any) => any;
  normalizeVerdict: (v: any) => 'pass' | 'maybe' | 'fail';
};

export type GenerateSummaryResult = {
  summary: EndSummary;
  messageText?: string;
};

export async function buildEndSummary({
  finalScore,
  cfg,
  profile,
  judgeRuns,
  textPrompt,
  coerceJson,
  normalizeVerdict,
}: GenerateSummaryParams): Promise<GenerateSummaryResult> {
  const roundedFinalScore = Number(finalScore.toFixed(1));

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
      nextStep24h: '...',
    }),
    '',
    'Verdict must be one of: pass, maybe, fail.',
  ].join('\n');

  const user = [
    `ARENA: ${cfg?.name ?? ''}`,
    `OBJECTIVE: ${cfg?.objective?.thesis ?? ''}`,
    '',
    'FOUNDER PROFILE:',
    JSON.stringify(profile ?? {}),
    '',
    `FINAL SCORE: ${roundedFinalScore}`,
    '',
    'ROUNDS:',
    JSON.stringify(judgeRuns.slice(-6)), // keep short
  ].join('\n');

  const raw = await textPrompt(user, system);
  const json = coerceJson(raw, null);

  const fallback: EndSummary = {
    finalScore: roundedFinalScore,
    verdict: 'maybe',
    oneLiner: 'Summary unavailable.',
    topStrength: '',
    topRisk: '',
    nextStep24h: 'Run 5 quick founder interviews on the core pain point.',
  };

  if (!json || typeof json !== 'object') {
    return { summary: fallback };
  }

  const verdict = normalizeVerdict((json as any).verdict);
  const summary: EndSummary = {
    finalScore: roundedFinalScore,
    verdict,
    oneLiner: String((json as any).oneLiner ?? fallback.oneLiner).trim(),
    topStrength: String((json as any).topStrength ?? '').trim(),
    topRisk: String((json as any).topRisk ?? '').trim(),
    nextStep24h: String(
      (json as any).nextStep24h ?? fallback.nextStep24h
    ).trim(),
  };

  const messageText = `${summary.verdict.toUpperCase()} • ${summary.oneLiner}

Strength: ${summary.topStrength}
Risk: ${summary.topRisk}
Next 24h: ${summary.nextStep24h}`;

  return { summary, messageText };
}
