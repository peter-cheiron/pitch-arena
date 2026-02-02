import { AiUsageContext, DbAIUsageService } from '#services/db/db-ai-usage.service';
import { inject, Injectable } from '@angular/core';
import { getApp } from '@angular/fire/app';
import { getAI, getGenerativeModel, GoogleAIBackend} from 'firebase/vertexai';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  model: any;
  answer: string;
  imageText: string;

  //-----usage service
  aiUsageService = inject(DbAIUsageService)
  //auth = inject(AuthService);
  //user = computed(() => this.auth.user())

  //-------------- for the image preview ------------------//
  imagePreview: string | ArrayBuffer | null = null;
  selectedFile: File | null = null;

  constructor() {
    // Initialize the Vertex AI service
    //const vertexAI = getAI(getApp());

    const ai = getAI(getApp(), { backend: new GoogleAIBackend() });

    // Initialize the generative model with a model that supports your use case
    // Gemini 2.5 models are versatile and can be used with all API capabilities
    // this is the only model that worked for images ... but be careful of the costs
    //TODO put this in a config file? don't use this with images until I know the prices.
    //I need to check what other parameters are available and see if I can add them.
    
    // Set the thinking configuration
    // Use a thinking level value appropriate for your model (example value shown here)
    const generationConfig = {
      thinkingConfig: {
        thinkingLevel: 'LOW'
      }
    };
    
    this.model = getGenerativeModel(ai, {
      model: "gemini-3-flash-preview", // 'gemini-2.5-flash', //"gemini-3-pro-preview"//"gemini-2.5-flash"
      generationConfig: {
        maxOutputTokens: 2048,
        // Cast to any to bypass the TS2353 error
        thinkingConfig: {
          includeThoughts: false,
          // Note: Use thinkingBudget (token count) for these experimental models
          thinkingBudget: 512 
        }
      } as any
    });
  }

  /**
   *
   * @param userText
   * @param prompt
   * @returns
   */
  textPrompt(
    user: string,
    system: string,
    usage: AiUsageContext = { purpose: 'dev' }){
      const startedAt = performance.now();

    //console.log("inputChars", user.length + system.length)

    return this.rawCall(user, system).finally(() => {
      var durationMs = performance.now() - startedAt
      console.log("prompt", durationMs)
      if(usage.purpose !== 'dev'){
        this.aiUsageService.logUsage({
        ...usage,
        durationMs: performance.now() - startedAt,
        inputChars: user.length + system.length,
      }); 
      }
    });
    }

  /**
   *
   * @param userText
   * @param prompt
   * @returns
   */
  rawCall(
    userText: string,
    prompt: string
  ): Promise<any> {
    return this.model
      .generateContent([prompt, { text: userText || '' }])
      .then((result) => {
        const response = result.response;
        const text = response.text();

        console.log("outputChars", text.length)

        if (this.isJSON(text)) {
          const cleaned = text
            .replace(/^```json\s*/i, '')
            .replace(/```[\s\r\n]*$/i, '')
            .trim();
          const jsonObject = JSON.parse(cleaned);
          return jsonObject;
        } else {
          // ✅ return the plain text – the Promise resolves to this
          return text;
        }
      })
      .catch((err) => {
        console.error('textPrompt error', err);
        // Optionally rethrow so the caller can handle it
        throw err;
      });
  }

  isJSON(text: string): boolean {
    return text.indexOf('```json') !== -1;
  }

  ///-------------- these are not used but thinking about images------------------///

  // Helper: Convert blob to base64
  blobToBase64(blob: Blob) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.readAsDataURL(blob);
    });
  }

  // Helper: Get image blob from URL or File
  async getImageBlob(input: File | string) {
    if (typeof input === 'string') {
      const res = await fetch(input);
      return await res.blob();
    } else {
      return input;
    }
  }

  /**
   *
   * @param inputSource
   * @param userText
   * @param queryResult
   * @deprecated this is stupid as you are tied to the prompts saved in the class.
   */
  parseImage(
    inputSource: File | string,
    userText: string,
    systemPrompt,
    queryResult: (res: any) => void
  ) {
    this.prompt(inputSource, userText, systemPrompt, queryResult);
  }

  /**
   * TODO rename this method as it sucks.
   *
   * @param inputSource the image
   * @param userText any additional text
   * @param the prompt to use if you don't know use the method above
   * @param queryResult the results of our super AI
   */
  prompt(
    inputSource: File | string,
    userText: string,
    prompt: string,
    queryResult: (res: any) => void
  ) {
    // Main logic
    if (inputSource) {
      this.getImageBlob(inputSource)
        .then((blob) => {
          this.blobToBase64(blob).then((dataUrl: string) => {
            const imageBase64 = dataUrl.split(',')[1];
            const mimeType = blob.type || 'image/jpeg';

            const imagePart = {
              inlineData: {
                mimeType,
                data: imageBase64,
              },
            };

            var parameters = [];
            parameters.push(prompt);
            parameters.push(imagePart);
            if (userText && userText.trim().length > 0) {
              parameters.push({ text: userText || '' });
            }

            this.model. 

            this.model.generateContent(parameters).then((result) => {
              const response = result.response;
              console.log(response.text());
              this.imageText = response
                .text()
                .replace('```json', '')
                .replace('```', '');
              const jsonObject = JSON.parse(this.imageText);
              //console.log("Here we have teh JSON", jsonObject);
              queryResult(jsonObject);
            });
          });
        })
        .catch((err) => {
          console.error('❌ Failed to load image:', err);
        });
    } else {
      //console.log("no image, text only");
      this.model
        .generateContent([prompt, { text: userText || '' }])
        .then((result) => {
          const response = result.response;
          if (this.isJSON(response.text())) {
            this.imageText = response
              .text()
              .replace('```json', '')
              .replace('```', '');
            const jsonObject = JSON.parse(this.imageText);
            queryResult(jsonObject);
          } else {
            queryResult(response.text());
          }
        });
    }
  } //eof
}
