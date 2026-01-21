import { PitchParse } from "./models/arena-config";

export function promptUpdateParseSystem(): string {
  return [
    'You maintain a structured pitch context across rounds.',
    'You will receive a BASE CONTEXT JSON and a NEW ROUND DELTA transcript (Q/A).',
    '',
    'TASK:',
    '- Update/extend claims ONLY if the founder revealed new concrete info.',
    '- Update assumptions to reflect newly clarified constraints.',
    '- Keep it stable: do NOT rewrite everything unless the delta forces it.',
    '',
    'Return ONLY valid JSON with EXACT keys:',
    '{"claims":[{"id":"c1","type":"value|user|market|technical|goToMarket|pricing|competition|ops","text":"...","quote":"...","specificityScore":0.0,"confidence":0.0,"tags":["core"]}],"assumptions":[{"id":"a1","claimId":"c1","category":"technical|market|product|execution|legal","statement":"...","criticality":"existential|high|medium|low","testability":"high|medium|low","confidence":0.0}],"openQuestions":[{"id":"q1","priority":"p0|p1|p2","question":"...","linkedTo":["a1","c1"]}],"entities":{"buyer":false,"price":false,"metric":false,"data":false,"time":false,"wedge":false}}',
    '',
    'Rules:',
    '- 6–10 claims',
    '- 6–10 assumptions',
    '- 0–3 openQuestions',
    '- Keep strings short (<160 chars).',
    '- No markdown, no code fences, no extra keys.',
  ].join('\n');
}

export function promptExtractClaims(env: {
  ideaName: string;
  pitchText: string;
}) {
  const system = [
    'You extract structured CLAIMS from startup pitches.',
    'Return ONLY valid JSON. No markdown.',
    'Schema:',
    '{"claims":[{"id":"c1","type":"value|user|market|technical|goToMarket|pricing|competition|ops","text":"...","quote":"...","specificityScore":0.0,"confidence":0.0,"tags":["core"]}],"entities":{"buyer":false,"price":false,"metric":false,"data":false,"time":false,"wedge":false}}',
    '',
    'Rules:',
    '- 6 to 10 claims.',
    '- specificityScore: 0..1 (0 vague, 1 very concrete).',
    '- confidence: 0..1.',
  ].join('\n');

  const user = [`IDEA NAME: ${env.ideaName}`, `PITCH:`, env.pitchText].join(
    '\n'
  );
  return { system, user };
}

export function promptBuildAssumptions(parse: PitchParse) {
  const system = [
    'You convert claims into explicit ASSUMPTIONS and OPEN QUESTIONS.',
    'Return ONLY valid JSON. No markdown.',
    'Schema:',
    '{"assumptions":[{"id":"a1","claimId":"c1","category":"technical|market|product|execution|legal","statement":"...","criticality":"existential|high|medium|low","testability":"high|medium|low","confidence":0.0}],"openQuestions":[{"id":"q1","priority":"p0|p1|p2","question":"...","linkedTo":["a1","c1"]}]}',
    '',
    'Rules:',
    '- 6 to 10 assumptions.',
    '- 0 to 3 openQuestions.',
    '- Make existential assumptions explicit.',
  ].join('\n');

  const user = JSON.stringify({ claims: parse.claims ?? [] });
  return { system, user };
}

/**
 * ✅ FAST: One call that returns claims + assumptions + openQuestions
 */
export function promptMergedParse(env: {
  ideaName: string;
  pitchText: string;
}) {
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
