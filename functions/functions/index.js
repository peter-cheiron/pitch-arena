/**
 * Import function triggers from their respective submodules:
 *
 * const {onCall} = require("firebase-functions/v2/https");
 * const {onDocumentWritten} = require("firebase-functions/v2/firestore");
 *
 * See a full list of supported triggers at https://firebase.google.com/docs/functions
 */
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require('firebase-admin');
require('dotenv').config();

admin.initializeApp();

//const db = getFirestore();

setGlobalOptions({
  maxInstances: 10,
  region: "europe-west1",
  timeoutSeconds: 120,
  memory: "2GiB",
});

const eleven = require('./elevenlabs.js')
exports.speechToText = eleven.speechToText;
exports.textToSpeech = eleven.textToSpeech;

/*
const gemini = require('./gemini.js');
exports.callGeminiSearch = gemini.callGeminiSearch;
exports.askGeminiFilestore = gemini.askGeminiFilestore;
exports.callGeminiPrompt = gemini.callGeminiPrompt*/




 
