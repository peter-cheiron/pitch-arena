// functions/index.js (or similar)
const { onRequest } = require("firebase-functions/v2/https");
const { GoogleGenAI } = require("@google/genai");


exports.callGeminiPrompt = onRequest(
  {
    region: "europe-west1",
    cors: false, // we'll handle CORS manually
  },
  async (req, res) => {
    // --- CORS handling --- 
    const allowedOrigins = [
      "http://localhost:4200",
      "https://pitch-arena.com"
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      // Preflight
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed" });
      return;
    }

    const prompt = req.body?.data?.prompt;
    if (!prompt) {
      res.status(400).send({ error: "Missing data.prompt" });
      return;
    }

    const model = req.body?.data?.model ?? 'gemini-2.5-flash';
    
    // The GEMINI_API_KEY comes from a Firebase Secret bound to this function.
    // (see notes below on how to set it)
    const ai = new GoogleGenAI({
      apiKey: "AIzaSyBtCfIweh9HIhH8EYkFcARCy2yN_etm87c",
    });

    try {
      const response = await ai.models.generateContent({
        model: model, // todo set model as parameter
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ]
      });

      const text = response.text;

      res.send({
        data: {
          prompt,
          text,
          // debug
          raw: response,
        },
      });
    } catch (err) {
      console.error("Gemini error:", err);
      res.status(500).send({
        error: "Gemini request failed",
        details: err?.message ?? String(err),
      });
    }
  }
);

exports.callGeminiSearch = onRequest(
  {
    region: "europe-west1",
    cors: false, // we'll handle CORS manually
    secrets: ["GEMINI_API_KEY"],
  },
  async (req, res) => {
    // --- CORS handling --- 
    const allowedOrigins = [
      "http://localhost:4200",
      "https://pitch-arena.com"
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      // Preflight
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed" });
      return;
    }

    const prompt = req.body?.data?.prompt;
    if (!prompt) {
      res.status(400).send({ error: "Missing data.prompt" });
      return;
    }

    // The GEMINI_API_KEY comes from a Firebase Secret bound to this function.
    // (see notes below on how to set it)
    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    try {
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash", // todo set model as parameter
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        config: {
          // Enable Google Search grounding
          tools: [{ googleSearch: {} }],
        },
      });

      const text = response.text;

      res.send({
        data: {
          prompt,
          text,
          // debug
          raw: response,
        },
      });
    } catch (err) {
      console.error("Gemini error:", err);
      res.status(500).send({
        error: "Gemini request failed",
        details: err?.message ?? String(err),
      });
    }
  }
);

/**
 * rag version
 */
exports.askGeminiFilestore = onRequest(
  {
    region: "europe-west1",
    cors: false, // we'll handle CORS manually
    secrets: ["GEMINI_API_KEY"],
  },
  async (req, res) => {
    // --- CORS handling --- TODO do this more often
    const allowedOrigins = [
      "http://localhost:4200",
      "https://pitch-arena.com"
    ];

    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization"
    );

    if (req.method === "OPTIONS") {
      // Preflight
      res.status(204).send("");
      return;
    }

    if (req.method !== "POST") {
      res.status(405).send({ error: "Method not allowed" });
      return;
    }

    //TODO add as future parameters the model and the filestore to use as well as the system prompt

    const prompt = req.body?.data?.prompt;
    if (!prompt) {
      res.status(400).send({ error: "Missing data.prompt" });
      return;
    }

    try {
      // The GEMINI_API_KEY comes from a Firebase Secret bound to this function.
      // (see notes below on how to set it)
      const ai = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
      });

      const FILE_SEARCH_STORE_NAME =
        "fileSearchStores/syndicbenevolefr-gx9qyhpug94h";
      
        //think about whether we have a fixed prompt here or not ... in fact just no.
        /*
      const structuredPrompt = `Answer the user prompt below and respond only with JSON:
        {
          "tldr": <short voice-readable summary>,
          "answer": <detailed answer>,
          "question": <the original prompt>,
          "references": [a list of references if any]
        }
        User prompt: ${prompt}`; //hmmm odd
        */

      ai.models
        .generateContent({
          model: "gemini-2.5-flash", // or "gemini-2.0-pro" etc.
          contents: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          config: {
            tools: [
              {
                fileSearch: {
                  fileSearchStoreNames: [FILE_SEARCH_STORE_NAME],
                },
              },
            ],
          },
        })
        .then((aiReply) => {
          const answer = aiReply.text;
          res.send({
            data: {
              prompt,
              answer,
            },
          });
        });
    } catch (err) {
      console.error("Gemini error:", err);
      res.status(500).send({
        error: "Gemini request failed",
        details: err?.message ?? String(err),
      });
    }
  }
);
