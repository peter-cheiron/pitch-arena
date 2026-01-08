// functions/eleven-process.js
const { onRequest } = require("firebase-functions/v2/https");
const { ElevenLabsClient } = require("@elevenlabs/elevenlabs-js");
const admin = require("firebase-admin");

// Make sure you have initialized admin somewhere in your index.js:
// admin.initializeApp();
//TODO set as a secret
const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
});

//"https://storage.googleapis.com/eleven-public-cdn/audio/marketing/nicole.mp3"
function call(url){
    //const elevenlabs = new ElevenLabsClient();
    return fetch(url)
      .then(response => response.arrayBuffer())
      .then(buffer => {
        const audioBlob = new Blob([buffer], { type: "audio/mp3" });
        return elevenlabs.speechToText.convert({
          file: audioBlob,
          modelId: "scribe_v1", // Model to use
          tagAudioEvents: true, // Tag audio events like laughter, applause, etc.
          languageCode: "eng", // Language of the audio file. If set to null, the model will detect the language automatically.
          diarize: true, // Whether to annotate who is speaking
        });
      })
      .then(transcription => {
        //console.log(transcription);
        return transcription;
      });
}

/**
 * Not sure that this will work lets see
 * 
 */
exports.speechToText = onRequest({ cors: false }, (request, response) => {
  const allowedOrigins = [
    "http://localhost:4200",
    "https://pitch-arena.com"
  ];

  const origin = request.headers.origin;
  if (allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).send({ error: "Method not allowed" });
    return;
  }

  const url = request.body?.data?.url;
  if (!url) {
    response.status(400).send({ error: "Missing data.url" });
    return;
  }

  call(url)
    .then((data) => {
      response.send({
        data: {
          request: url,
          results: data,
        },
      });
    })
    .catch((error) => {
      console.error("speechToText error", error);
      response.status(500).send({ error: "Unable to transcribe audio" });
    });
});

//CwhRBWXzGAHq8TQ4Fs17
async function reverse(text, voiceId){
  //TODO paramatise so we can choose voices etc
    var id = voiceId ? voiceId : 'JBFqnCBsd6RMkjVDRZzb'
    const audio = await elevenlabs.textToSpeech.convert(id, {
      text: text,
      modelId: 'eleven_multilingual_v2',
      outputFormat: 'mp3_44100_128',
    });
    const reader = audio.getReader();
    const chunks = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
    }

    return Buffer.concat(chunks);
}
exports.textToSpeech = onRequest({ cors: false }, async (request, response) => {
  const allowedOrigins = [
    "http://localhost:4200",
    "http://127.0.0.1:5001",
    "https://pitch-arena.com"
  ];

  const origin = request.headers.origin;
  if (allowedOrigins.includes(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Vary", "Origin");
  }

  response.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization"
  );

  if (request.method === "OPTIONS") {
    response.status(204).send("");
    return;
  }

  if (request.method !== "POST") {
    response.status(405).send({ error: "Method not allowed" });
    return;
  }

  const text = request.body?.data?.text;
  const voiceId = request.body?.data?.voiceId || 'JBFqnCBsd6RMkjVDRZzb';
  try {
    const audioBuffer = await reverse(text, voiceId);
    
    const bucket = admin.storage().bucket();
    const filePath = `tts/${Date.now()}-${Math.random().toString(36).slice(2)}.mp3`;
    const file = bucket.file(filePath);

    await file.save(audioBuffer, {
      resumable: false,
      metadata: {
        contentType: "audio/mpeg",
        cacheControl: "public, max-age=31536000",
      },
    });

    const [url] = await file.getSignedUrl({
      action: "read",
      expires: Date.now() + 24 * 60 * 60 * 1000,
    });

    response.send({ data: { url } });
  } catch (error) {
    console.error("textToSpeech error", error);
    response.status(500).send({ error: "Unable to synthesize speech" });
  }
});
