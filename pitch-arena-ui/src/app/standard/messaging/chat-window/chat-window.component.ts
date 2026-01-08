import { Component, effect, inject, Input, OnChanges, SimpleChanges } from "@angular/core";
import { AuthService } from "#services/auth";
import { MessagingService } from "../services/message.service";
import { FormsModule } from "@angular/forms";
import { CommonModule, DatePipe, NgClass } from "@angular/common";
import { TimeToDatePipe } from "#pipes/timetodate";
import { UtillitiesService } from "#services/utilities.service";
import { UiFeedTileComponent } from "src/app/ui/ui-feed-tile/ui-feed-tile.component";
import { Message } from "../models/message";
import { UiButtonPillComponent, UiInputComponent } from "#ui";
import { RecordingTranscriptionService } from "src/app/services/ai/recording-transcription.service";
import { SpeechService } from "src/app/services/ai/speech.eleven.service";
import { TranslatePipe, TranslateService } from "@ngx-translate/core";

@Component({
  standalone: true,
  selector: "app-chat-window",
  templateUrl: "./chat-window.component.html",
  imports: [
    FormsModule,
    CommonModule,
    NgClass,
    TimeToDatePipe,
    DatePipe,
    UiFeedTileComponent,
    UiButtonPillComponent,
    UiInputComponent,
    TranslatePipe
],
})
export class ChatWindowComponent implements OnChanges {
  @Input() selectedConversation: any;
  @Input() messages: any[] = [];
  newMessage = "";

  recording = false;
  uploading = false;
  transcribing = false;
  speaking = false;
  error: string | null = null;
  private audioChunks: BlobPart[] = [];
  private mediaRecorder: MediaRecorder | null = null;
  private currentStream: MediaStream | null = null;

  private messagingService = inject(MessagingService);
  utilities = inject(UtillitiesService)
  private auth = inject(AuthService);
  private recordingTranscription = inject(RecordingTranscriptionService);
  private speechService = inject(SpeechService);
  private translate = inject(TranslateService);

  userId;

  /**
   * TODO 
   * - put the avatar of the other user not your own
   * - get a default avatar colored circle for example
   * - color of the messages
   * - links and things
   */
  constructor() {
    effect(() => {
      if (this.auth.user()) {
        this.userId = this.auth.user().uid;
      }
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if(changes['messages']){
      var messages = changes['messages'].currentValue
      messages.forEach(message => {
        //process if needed
      })
    }
  }

  ngOnInit() {
    console.log(this.messages);
  }

  sendMessage() {
    if (this.selectedConversation && this.newMessage.trim()) {
      const newMessage: Message = {
        from: this.userId,
        date: new Date(),
        read: false,
        message: this.newMessage,
      };

      //if the parent listens then do we need to push?
      this.messagingService
        .sendMessage(this.selectedConversation.id, newMessage)
        .then(() => {
          this.newMessage = ""; // Clear input field
        });
    }
  }

  startRecording() {
    if (this.recording || this.uploading || this.transcribing) return;

    this.error = null;
    this.audioChunks = [];

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.currentStream = stream;
        this.mediaRecorder = new MediaRecorder(stream);

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data && event.data.size > 0) {
            this.audioChunks.push(event.data);
          }
        };

        this.mediaRecorder.onstop = () => {
          const blob = new Blob(this.audioChunks, { type: "audio/webm" });
          this.stopStream();
          this.recording = false;
          if (blob.size > 0) {
            this.uploadAndTranscribe(blob);
          }
        };

        this.mediaRecorder.start();
        this.recording = true;
      })
      .catch((err) => {
        console.error(err);
        this.error = this.translate.instant("messaging.errors.microphone");
        this.stopStream();
        this.recording = false;
      });
  }

  cancelRecording() {
    this.error = null;
    if (this.mediaRecorder && this.recording) {
      this.mediaRecorder.stop();
    } else {
      this.stopStream();
    }
    this.recording = false;
    this.audioChunks = [];
  }

  confirmRecording() {
    if (!this.mediaRecorder || !this.recording) return;
    this.mediaRecorder.stop();
  }

  private stopStream() {
    if (this.currentStream) {
      this.currentStream.getTracks().forEach((t) => t.stop());
      this.currentStream = null;
    }
  }

  private uploadAndTranscribe(blob: Blob) {
    this.uploading = true;
    this.transcribing = true;
    this.error = null;

    this.recordingTranscription
      .transcribeRecording(blob)
      .then((transcript) => {
        const text = transcript?.trim();
        if (!text) {
          this.error = this.translate.instant("messaging.errors.transcription");
          return;
        }
        this.newMessage = text;
        this.sendMessage();
      })
      .catch((err) => {
        console.error(err);
        this.error = this.translate.instant("messaging.errors.upload");
      })
      .finally(() => {
        this.uploading = false;
        this.transcribing = false;
      });
  }

  speak(text: string, voiceId: string) {
    if (!text || this.speaking) return;
    this.speaking = true;

    try {
      this.speechService.textToSpeech(text, voiceId,(results: any) => {
        const url = results?.data?.url;
        if (!url) {
          this.speaking = false;
          return;
        }
        const audio = new Audio(url);
        const reset = () => (this.speaking = false);
        audio.addEventListener("ended", reset, { once: true });
        audio.addEventListener("error", reset, { once: true });
        audio.play().catch((err) => {
          console.error(err);
          reset();
        });
      });
    } catch (err) {
      console.error(err);
      this.speaking = false;
    }
  }
}
