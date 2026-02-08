import { Injectable, computed, inject } from "@angular/core";
import { getApp } from "@angular/fire/app";
import { getAI, getGenerativeModel } from "firebase/vertexai";
import { AuthService } from "../auth";

type ChatRole = "user" | "model";

interface ChatMessage {
  role: ChatRole;
  text: string;
}

@Injectable({
  providedIn: "root",
})
export class GeminiChatService {
  private readonly historyStorageKey = "gemini-chat-history";
  private readonly contextStorageKey = "gemini-chat-context";
  private history: ChatMessage[] = [];
  private model: any;
  private systemContext: string | null = null;
  private auth = inject(AuthService);
  private user = computed(() => this.auth.user());

  constructor() {
    const ai = getAI(getApp());
    this.model = getGenerativeModel(ai, {
      model: "gemini-2.5-flash",
    });
  }

  private extractFirstJsonValue(text: string): string | null {
    const trimmed = text.trim();
    if (!trimmed) return null;

    const firstChar = trimmed[0];
    if (firstChar !== "{" && firstChar !== "[") return null;

    const stack: string[] = [];
    let inString = false;
    let escaped = false;

    for (let i = 0; i < trimmed.length; i++) {
      const ch = trimmed[i];

      if (inString) {
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{" || ch === "[") {
        stack.push(ch);
        continue;
      }

      if (ch === "}" || ch === "]") {
        const last = stack.pop();
        const matches =
          (last === "{" && ch === "}") || (last === "[" && ch === "]");
        if (!matches) return null;
        if (stack.length === 0) return trimmed.slice(0, i + 1);
      }
    }

    return null;
  }

  private tryParseJsonFromText(text: string): unknown | null {
    const tryParse = (candidate: string): unknown | null => {
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    };

    const trimmed = text.trim();
    if (!trimmed) return null;

    const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (fencedMatch?.[1]) {
      const parsed = tryParse(fencedMatch[1].trim());
      if (parsed !== null) return parsed;
    }

    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      const parsed = tryParse(trimmed);
      if (parsed !== null) return parsed;

      const jsonValue = this.extractFirstJsonValue(trimmed);
      if (jsonValue) {
        const extracted = tryParse(jsonValue);
        if (extracted !== null) return extracted;
      }
    }

    const firstJsonStart = trimmed.search(/[\[{]/);
    if (firstJsonStart >= 0) {
      const remainder = trimmed.slice(firstJsonStart);
      const jsonValue = this.extractFirstJsonValue(remainder);
      if (jsonValue) {
        const extracted = tryParse(jsonValue);
        if (extracted !== null) return extracted;
      }
    }

    return null;
  }

  /**
   * Set or reset high-level instructions.
   * (We’ll send this as systemInstruction on each call.)
   */
  initialiseContext(content: string) {
    const contextKey = this.storageKey(this.contextStorageKey);
    const historyKey = this.storageKey(this.historyStorageKey);
    this.systemContext = content;
    const cachedContext = localStorage.getItem(contextKey);
    const cachedHistory = localStorage.getItem(historyKey);

    if (cachedContext === content && cachedHistory) {
      try {
        this.history = JSON.parse(cachedHistory);
        console.log("using cache", this.history)
      } catch {
        this.history = [];
        localStorage.removeItem(historyKey);
      }
    } else {
      this.history = [];
      localStorage.setItem(contextKey, content);
      localStorage.removeItem(historyKey);
    }
    const contextSize = this.measureContextWindow();
    console.log(contextSize)
  }

  private readonly tokenLimit = 1_000_000; // Gemini 2.5 Flash context window

  measureContextWindow() {
    const estimateTokens = (text: string) => Math.ceil(text.length / 4);
    let tokenCount = this.systemContext ? estimateTokens(this.systemContext) : 0;

    for (let i = 0; i < this.history.length; i++) {
      tokenCount += estimateTokens(this.history[i].text);
      if (tokenCount > this.tokenLimit) break;
    }

    return {
      tokens: tokenCount,
      limit: this.tokenLimit,
      overLimit: tokenCount > this.tokenLimit,
    };
  }

  async ask(question: string): Promise<unknown> {
    const historyKey = this.storageKey(this.historyStorageKey);
    // store in our own simple history format
    this.history.push({ role: "user", text: question });
    localStorage.setItem(
      historyKey,
      JSON.stringify(this.history)
    );

    // convert to Gemini contents format
    const contents = this.history.map((m) => ({
      role: m.role,
      parts: [{ text: m.text }],
    }));

    const request: any = { contents };

    // optionally send system instructions (if set)
    if (this.systemContext) {
      request.systemInstruction = {
        role: "user",
        parts: [{ text: this.systemContext }],
      };
    }

    const tokenUsage = await this.model.countTokens(request);
    console.log({
      tokens: tokenUsage.totalTokens,
      limit: tokenUsage.totalTokensLimit ?? this.tokenLimit,
      overLimit:
        tokenUsage.totalTokens >
        (tokenUsage.totalTokensLimit ?? this.tokenLimit),
    });

    const result = await this.model.generateContent(request);

    // Firebase AI wrapper adds a .text() helper on response
    const reply: string = result.response.text();
    this.history.push({ role: "model", text: reply });
    localStorage.setItem(
      historyKey,
      JSON.stringify(this.history)
    );

    const parsed = this.tryParseJsonFromText(reply);
    if (parsed !== null) return parsed;
    return reply;
  }

  resetHistory() {
    this.history = [];
    localStorage.removeItem(this.storageKey(this.historyStorageKey));
  }

  private storageKey(baseKey: string): string {
    const currentUser = this.user();
    const identifier = currentUser?.uid ?? currentUser?.email ?? "anonymous";
    return `${baseKey}-${identifier}`;
  }
}
