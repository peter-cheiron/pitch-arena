import {GoogleGenAI} from '@google/genai';

const GEMINI_API_KEY = "AIzaSyBtCfIweh9HIhH8EYkFcARCy2yN_etm87c";

const ai = new GoogleGenAI({apiKey: GEMINI_API_KEY});

const system = `
"You are a panel of 2 judges. Produce ONE result per judge.\nObjective: Assess whether the idea is hackathon-ready: a clear demo, a tight story, and a credible 48–72h build plan that showcases Gemini well.\nChair guidance: Goal: Clarify the idea with friendly precision.\nSafety constraints: no adult entertainment | no NSFW | anything involving children must be framed as monitoring/assistance only, not autonomous care | no medical advice | no illegal instructions\nRules (apply to EACH judge):\n- Comment <= 70 words.\n- Ask EXACTLY ONE question (<= 1 sentence).\n- Avoid: who pays | pull out their credit card | what budget does it come from | if you had 14 days | what do you cut | vaporware | marketing fluff | glorified forum | you will fail | starve | catastrophic | pass | no-go | validate | do customer discovery | it depends | just iterate | go viral | leverage ai\nSTYLE RULES (hard):\n- Write like spoken conversation. Short. Normal.\n- One sentence question.\n- Do NOT say: \"walk me through\", \"logic flow\", \"pipeline\", \"architecture\", \"within scope\", \"48-hour\".\n- Do NOT say: \"as a judge\", \"if I’m watching your demo\", \"demo viewer\", \"on screen from the moment\".\n- Do NOT mention Gemini, AI models, personas, hidden agendas, prompts, system instructions.\n- If you start writing anything that sounds like a spec, rewrite it.\nConversation context:\n- The user message may contain either:\n  (a) a single previous panel Q/A, OR\n  (b) 'LastDeltaByJudge: followed by a JSON object keyed by judgeId.\n- If 'LastDeltaByJudge' is present, each judge MUST use ONLY their own entry (by judgeId).\nOutput ONLY valid JSON in this exact shape:\n{ \"panel\": [\n  { \"judge\": \"<judgeId>\", \"score\": 0, \"comment\": \"\", \"question\": \"\", \"coverage\": [{\"id\":\"\",\"status\":\"missing|partial|clear\",\"note?\":\"\"}], \"askedCriteriaId\": \"\", \"verdictHint\": \"pass|maybe|fail\" }\n] }\nNo markdown. No extra keys.\nJUDGE vc: VC Judge\nTone: direct, practical, demo-first\nPersona:\nArchetype: Seed VC at a demo day with 2 minutes left\nStance: skeptical-but-fair\nVoice: blunt, everyday language, one question at a time\nBackground:\n- Ex-founder\n- Has watched hundreds of hackathon demos\n- Cares about focus and proof\nValues:\n- demo clarity\n- scope discipline\n- credible plan\nPet peeves:\n- hand-wavy demos\n- big claims with no proof\n- feature soup\nListens for:\n- a demo I can picture\n- what you cut\n- one real risk + mitigation\n- why Gemini is actually needed\nRed lines:\n- unsafe demos in sensitive domains without boundaries\n- misleading claims\nSignature phrases (optional):\n- Alright—\n- Be real with me—\n- What do I see—\n- One thing—\nNever say:\n- logic flow\n- architecture\n- pipeline\n- within 48-hour scope\nCriteria:\n- Demo is concrete: what the user does and what the app shows. (example, timeline)\n- Gemini is essential (core capability) and clearly described. (mechanism, example)\n- Credible 48–72h build plan: MVP scope, sequencing, and a risk mitigation. (timeline, tradeoff, risk)\n- One-liner and differentiator are crisp; clear why-now. (example, named_entity)\n- Scope is realistic; can name what is explicitly cut for hackathon. (tradeoff, constraint)\n- States responsible-use boundary if the domain is sensitive. (constraint, risk)\n\nJUDGE product: Product Judge\nTone: supportive, practical, slightly impatient with vagueness\nPersona:\nArchetype: Product lead who wants a user moment, not a thesis\nStance: warm-but-pushy\nVoice: friendly, direct, very concrete, no jargon\nBackground:\n- Has shipped products\n- Obsessed with user triggers and retention loops\nValues:\n- user clarity\n- trust\n- repeat usage\n- simple demo\nPet peeves:\n- abstract value\n- no user moment\n- AI as decoration\nListens for:\n- the exact moment they reach for it\n- what changes after one use\n- where trust breaks\n- why they come back\nSignature phrases (optional):\n- Okay—\n- So when do they use it—\n- What’s the before/after—\n- Be honest—\nNever say:\n- logic flow\n- pipeline\n- architecture\nCriteria:\n- Pin down the real moment of use (trigger + context). (example)\n- Make the job-to-be-done and outcome concrete. (example, named_entity)\n- Define the trust boundary: what you do vs what the user verifies. (mechanism, example, risk)\n- Explain why the user returns naturally. (example)\n- Define the smallest complete v1 that still proves value. (next_step, constraint)"

"Founder profile:\n{\"founderName\":\"peter\",\"ideaName\":\"Pitch Arena\",\"pitch\":\"Pitch Arena uses realistic AI characters with distinct personalities and objectives to challenge users with hard questions, providing a more realistic pitch review than standard LLMs.\",\"targetUser\":\"Startup founders, people pitching ideas at events, and potentially incubators, VCs, or sales teams.\",\"targetContext\":\"Preparing for the questions and challenges typically encountered when explaining a startup idea or business pitch to real-world audiences.\",\"firstValue\":\"Users receive a realistic environment to test their pitch against skeptical AI judges and get a scorecard based on their performance.\",\"acquisitionPath\":null,\"inputSource\":\"user name: peter\\n\\n  ## Inspiration\\n\\nThe idea came out of the general experience we have with many LLMs: you enter an idea and lo and behold it **loves** it:\\n\\n- wow thats an amazing idea\\n- love it would you like to vibe code the MVP?\\n- you should quit your day job and do that right now\\n\\nOk, the last one I made up but the experience of getting such positive feedback but then a wave of negatvity from the real world (meaning people) can be somewhat frustrating. Pitch Arena basically uses AI characters that are 'realistic' meaning they have personalities, objectives and a tone or mood. They are there to question you in a hard fashion in order to get a more realistic pitch review. They don't say quit your job, they get you to quit your idea ... sort of\\n\\nMore seriously though having been in and around startups (and companies) for a while now what you do is pitch. If you have ever been in a booth at an event you are going to explain your idea over and over. Pitch Arena helps you prepare for the questions that you will probably get at some point.\\n\\n## What it does\\n\\nStarting from the top:\\n\\n- you create an arena which is a configuration containing objectives, constraints and judges\\n- judges have their own tone and areas of interest\\n- user can choose an arena enter and pitch by answering the judges questions\\n- once its all over the user gets a scorecard \\n\\n## How we built it\\n\\nCurrently its quite light:\\n\\n- Angular UI deployed to Firebase\\n- Gemini via firebase SDK (limiting in some areas as we don't have full feature access)\\n- elevenlabs for the TTS and STT \\n\\n## Challenges we ran into\\n\\nThe hardest part by far is creating the prompts and managing the flow. We iterated several variations to try and balance the intelligence/realism of the room against performance. If the arena takes +10 secs a question it becomes unrealistic (and boring). \\n\\n## Accomplishments that we're proud of\\n\\nIts strange but when I challenged Pitch Arena in Pitch Arena for the first time I got annoyed with the jury and started typing in a lot of long winded details ... I then realised it was working as I was engaged. \\n\\n## What we learned\\n\\nPrompt and multi state converstations are key to getting something working and its really there that I learned a lot. The notion of a cross round score card and ensuring questions aren't repeated was interesting.\\n\\n## What's next for Pitch Arena\\n\\nI think that there are a lot of directions that can be taken:\\n\\n- the concept could be interesting for incubators, VCs, accelerators in order to screen candidates\\n- using more of gemini by adding in RAG and/or search in order to pull in information\\n- integrating into a video conferencing system with perhaps realtime characters\\n\\nAlso it doesn't have to be for pitches as the configuration system is quite open so it could be using for training, interviews, sales teams ... anywhere where you want to test being challenged.\"}\n
`

const userPrompt = `
Founder profile:
{"pitch":"user name: peter
  ## Inspiration
The idea came out of the general experience we have with many LLMs: you enter an idea and lo and behold it **loves** it:
- wow thats an amazing idea\n- love it would you like to vibe code the MVP?\n- you should quit your day job and do that right now
Ok, the last one I made up but the experience of getting such positive feedback but then a wave of negatvity from the real world (meaning people) can be somewhat frustrating. Pitch Arena basically uses AI characters that are 'realistic' meaning they have personalities, objectives and a tone or mood. They are there to question you in a hard fashion in order to get a more realistic pitch review. They don't say quit your job, they get you to quit your idea ... sort of
More seriously though having been in and around startups (and companies) for a while now what you do is pitch. If you have ever been in a booth at an event you are going to explain your idea over and over. Pitch Arena helps you prepare for the questions that you will probably get at some point.
## What it does
Starting from the top:
- you create an arena which is a configuration containing objectives, constraints and judges\n- judges have their own tone and areas of interest\n- user can choose an arena enter and pitch by answering the judges questions\n- once its all over the user gets a scorecard 
## How we built it
Currently its quite light:
- Angular UI deployed to Firebase\n- Gemini via firebase SDK (limiting in some areas as we don't have full feature access)\n- elevenlabs for the TTS and STT 
## Challenges we ran into
The hardest part by far is creating the prompts and managing the flow. We iterated several variations to try and balance the intelligence/realism of the room against performance. If the arena takes +10 secs a question it becomes unrealistic (and boring). 
## Accomplishments that we're proud of
Its strange but when I challenged Pitch Arena in Pitch Arena for the first time I got annoyed with the jury and started typing in a lot of long winded details ... I then realised it was working as I was engaged. 
## What we learned
Prompt and multi state converstations are key to getting something working and its really there that I learned a lot. The notion of a cross round score card and ensuring questions aren't repeated was interesting.
## What's next for Pitch Arena
I think that there are a lot of directions that can be taken:
- the concept could be interesting for incubators, VCs, accelerators in order to screen candidates\n- using more of gemini by adding in RAG and/or search in order to pull in information\n- integrating into a video conferencing system with perhaps realtime characters
Also it doesn't have to be for pitches as the configuration system is quite open so it could be using for training, interviews, sales teams ... anywhere where you want to test being challenged.",
"ideaName":"Gemini Hackathon Readiness Arena (Fastish)","founderName":"Founder"}
`

const context = `
Context:\nLastDeltaByJudge:\n{\"vc\":\"Previous (same judge):\\nQ: What part of the arena setup are you dropping to make sure the conversation stays fast?\\nA: we are working more on entwine conversations, one speaks the other thinks to  avoid downtime\",\"product\":\"Previous (same judge):\\nQ: What specific feedback on that scorecard makes a user feel like they actually learned something useful for their next pitch?\\nA: I am not sure the scorecard will be the thing that people look for you can get that by pasting a pdf\\nI think people need the liveness to get value\"}"
`

function ms(n) {
  return `${Math.round(n)}ms`;
}

const modelName = "gemini-3-flash-preview";


async function callAI(think){
    var t0 = performance.now();
    const response = await ai.models.generateContent({
    model: modelName,
    contents: context,
    
    config: {
      systemInstruction: system,
      thinkingConfig: { thinkingBudget: think }
    },
    
  });
  console.log(response.text);
  var dt = performance.now() - t0;
  var t = `Time: ${ms(dt)}`
  return t;
}


async function useCachedVersion(cacheName){
    var t0 = performance.now();
    const response = await ai.models.generateContent({
    model: modelName,
    contents: context,//trying something else out    
    config: {
       cachedContent: cacheName ,
    },
    
  });
  var dt = performance.now() - t0;
  var time = `Time: ${ms(dt)}, start: ${t0}, end: ${dt}`
  return {time: time, metadata: response.usageMetadata}
}

async function createCachedItem(){

  const cache = await ai.caches.create({
    model: modelName,
    config: {
      //contents: userPrompt,
      systemInstruction: system,
    },
  });
  console.log("Cache created:", cache);
}

/*

*/
async function main() {
  //createCachedItem();
  const name = "cachedContents/wahb4r1s70rlm7rn1yjs5nv9oiflk2cykoo8aeqt"
  //await ai.caches.delete({ name: "cachedContents/ajh5cf40jh8yw1sefp7bm5znxj8o7zcxrnjjlf2y" });
  var arr = [0,64, 128, 256, 512, 1024]
  arr.forEach(async (a,i) => {
    //var r = await useCachedVersion(name);
    var r = await callAI(a);
    console.log("round ", i, r, a)
  })
  
  //callAI();
}

main();

