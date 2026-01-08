import { inject, Injectable } from "@angular/core";
import { getApp } from "@angular/fire/app";
import { getFunctions, httpsCallable } from "@firebase/functions";

@Injectable({
  providedIn: "root",
})
export class GeminiGroundedService {
  
  functions: any;

  constructor() {
    this.functions = getFunctions(getApp(), "europe-west1");
  }

  callGeminiSearch(prompt, results) {
    const addMessage = httpsCallable(this.functions, "callGeminiSearch");
    addMessage({ prompt: prompt })
      .then((result: any) => {
        console.log(result)
        //here is hoping that its valid
        results(result)
      })
      .catch((error: any) => {
        console.error("Error calling function:", error);
      });
  }

  askGeminiFilestore(prompt, results) {
    const addMessage = httpsCallable(this.functions, "askGeminiFilestore");
    addMessage({ prompt: prompt })
      .then((result: any) => {
        console.log(result)
        //here is hoping that its valid
        results(result)
      })
      .catch((error: any) => {
        console.error("Error calling function:", error);
      });
  }

}
