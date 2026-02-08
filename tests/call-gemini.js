/**
 * test-gemini.mjs
 *
 * Run:
 *   npm i @google/generative-ai dotenv
 *   node test-gemini.mjs "Your prompt here"
 *
 * Env (.env):
 *   GEMINI_API_KEY=xxxxx
 *
 * Notes:
 * - This uses the Google AI Gemini API (NOT Vertex).
 * - If you’re using Firebase/Vertex in prod, this is still great for fast prompt iteration.
 */

import 'dotenv/config';
import { GoogleGenerativeAI } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY;
if (!API_KEY) {
  console.error('Missing GEMINI_API_KEY in environment (.env).');
  process.exit(1);
}

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';

const argPrompt = process.argv.slice(2).join(' ').trim();
const prompt = argPrompt || 'Say hello in 1 sentence.';

const genAI = new GoogleGenerativeAI(API_KEY);
const model = genAI.getGenerativeModel({
  model: MODEL,
  // Optional: keep low for more deterministic JSON
  generationConfig: {
    temperature: Number(process.env.TEMP ?? 0.4),
    topP: Number(process.env.TOP_P ?? 0.95),
    maxOutputTokens: Number(process.env.MAX_TOKENS ?? 800),
  },
});

function ms(n) {
  return `${Math.round(n)}ms`;
}

async function runOnce({ system, user }) {
  const t0 = performance.now();

  // Gemini “system” is typically done via a content part or instruction;
  // this SDK supports "systemInstruction" for many models.
  // If your model/SDK version doesn’t, we fall back to prefixing.
  const useSystemInstruction = true;

  const result = await model.generateContent(
    useSystemInstruction
      ? [
          { role: 'user', parts: [{ text: user }] },
        ]
      : [{ role: 'user', parts: [{ text: `${system}\n\nUSER:\n${user}` }] }],
    useSystemInstruction
      ? { systemInstruction: system ? { role: 'system', parts: [{ text: system }] } : undefined }
      : undefined,
  );

  const text = result.response.text();
  const dt = performance.now() - t0;

  const usage =
    result.response.usageMetadata
      ? {
          promptTokenCount: result.response.usageMetadata.promptTokenCount,
          candidatesTokenCount: result.response.usageMetadata.candidatesTokenCount,
          totalTokenCount: result.response.usageMetadata.totalTokenCount,
        }
      : null;

  return { text, dt, usage };
}

/**
 * Strategies you can tweak quickly
 */
const STRATEGIES = [
  {
    name: 'baseline',
    system: '',
    user: prompt,
  },
  {
    name: 'short-system',
    system:
      'You are a blunt but fair judge. Ask ONE short, natural question. No jargon. No meta talk.',
    user: prompt,
  },
  {
    name: 'json-output',
    system: [
      'Return ONLY valid JSON:',
      '{ "question": "", "comment": "", "score": 0 }',
      'Question must be 1 sentence and sound like spoken conversation.',
    ].join('\n'),
    user: prompt,
  },
  {
    name: 'two-step (draft then final)',
    system: [
      'You are a judge.',
      'First write a DRAFT question in plain text (not shown).',
      'Then output ONLY JSON: { "question": "" }',
      'The question must sound like something you would say out loud.',
    ].join('\n'),
    user: prompt,
  },
];

async function main() {
  console.log(`Model: ${MODEL}`);
  console.log(`Temp: ${process.env.TEMP ?? 0.4}  MaxTokens: ${process.env.MAX_TOKENS ?? 800}`);
  console.log(`Prompt: ${prompt}\n`);

  for (const s of STRATEGIES) {
    try {
      const { text, dt, usage } = await runOnce({ system: s.system, user: s.user });

      console.log('='.repeat(80));
      console.log(`Strategy: ${s.name}`);
      console.log(`Time: ${ms(dt)}`);
      if (usage) console.log(`Usage:`, usage);
      console.log('-'.repeat(80));
      console.log(text.trim());
      console.log();
    } catch (e) {
      console.log('='.repeat(80));
      console.log(`Strategy: ${s.name}`);
      console.error(e);
      console.log();
    }
  }
}

await main();
