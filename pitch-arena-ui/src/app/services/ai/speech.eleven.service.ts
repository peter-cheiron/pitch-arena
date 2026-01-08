import { Injectable } from "@angular/core";
import { getApp } from "@angular/fire/app";
import { getFunctions, httpsCallable } from "@firebase/functions";

@Injectable({ providedIn: "root" })
export class SpeechService {
  functions: any;

  constructor() {
    this.functions = getFunctions(getApp(), "europe-west1");
  }

  speechToText(url: string, callback?: (text: string) => void): Promise<string> {
    const fn = httpsCallable(this.functions, "speechToText");
    return fn({ url })
      .then((result: any) => {
        const text = result?.data?.results?.text ?? "";
        callback?.(text);
        return text;
      });
  }

  textToSpeech(text: string, voiceId: string, results: (r: any) => void) {
    const fn = httpsCallable(this.functions, "textToSpeech");
    fn({ text, voiceId }).then((result: any) => results(result));
  }

  // ✅ Promise wrapper (use this in components)
  textToSpeechUrl(text: string, voiceId: string): Promise<string> {
    return new Promise((resolve, reject) => {
      this.textToSpeech(text, voiceId, (result: any) => {
        const url =
          result?.data?.url ??
          result?.data?.result?.url ??
          result?.data?.results?.url ??
          result?.url;

        if (url && typeof url === "string") resolve(url);
        else reject(new Error("textToSpeech: no url returned"));
      });
    });
  }
}
