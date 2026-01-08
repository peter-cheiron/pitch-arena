import { Injectable } from "@angular/core";
import { AudioStorageService } from "./audio-storage.service";
import { SpeechService } from "./speech.eleven.service";

@Injectable({ providedIn: "root" })
export class RecordingTranscriptionService {
  constructor(
    private audioStorage: AudioStorageService,
    private speechService: SpeechService
  ) {}

  /**
   * Upload a recorded blob and return its transcription.
   */
  async transcribeRecording(blob: Blob): Promise<string> {
    if (!blob || blob.size === 0) {
      throw new Error("No recording provided for transcription.");
    }

    const fileName = `recording-${Date.now()}.webm`;
    const file = new File([blob], fileName, { type: "audio/webm" });
    const path = `recordings/${fileName}`;

    const url = await this.audioStorage.uploadRecording(file, path);
    return this.speechService.speechToText(url);
  }
}
