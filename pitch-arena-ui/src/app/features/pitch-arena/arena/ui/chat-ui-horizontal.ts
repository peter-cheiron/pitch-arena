import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, effect, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { VoiceService } from "../../services/voice.service";
import { ChatUIMessage } from "./chat-ui";

@Component({
  selector: 'chat-ui-horizontal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './chat-ui-horizontal.html',
})
export class ChatUiHorizontalComponent {
  @ViewChild('chatWindow') chatWindow?: ElementRef<HTMLElement>;
  private voice = inject(VoiceService);

  @Input() messages: ChatUIMessage[] = [];

  @Input() placeholder = 'Type your message...';
  @Input() disabled = false;
  @Input() sending = false;
  @Input() inputText = '';
  @Input() recording = false;
  @Input() playingMessageId: string | null = null;
  @Output() inputTextChange = new EventEmitter<string>();
  @Output() send = new EventEmitter<string>();
  @Output() startRecording = new EventEmitter<void>();
  @Output() stopRecording = new EventEmitter<void>();
  @Output() ensureVoice = new EventEmitter<string>();
  @Output() playVoice = new EventEmitter<ChatUIMessage>();

  readonly userBubbleStyle = {
    borderColor: 'var(--color-border)',
    background: 'color-mix(in srgb, var(--color-accent) 12%, var(--color-surface))',
  };

  readonly aiBubbleStyle = {
    borderColor: 'var(--color-border)',
    background: 'color-mix(in srgb, var(--color-bg) 70%, var(--color-surface))',
  };

  constructor() {
    effect(() => {
      if (!this.hasExternalVoiceHandlers()) {
        this.recording = this.voice.recording();
      }
    });
  }

  ngOnChanges() {
    queueMicrotask(() => this.scrollChatToBottom());
  }

  onInputChange(value: string) {
    this.inputText = value;
    this.inputTextChange.emit(value);
  }

  submit() {
    const trimmed = this.inputText.trim();
    if (!trimmed || this.disabled || this.sending) return;
    this.send.emit(trimmed);
    this.inputText = '';
  }

  toggleRecording() {
    if (this.disabled || this.sending) return;
    if (this.hasExternalVoiceHandlers()) {
      if (this.recording) {
        this.stopRecording.emit();
      } else {
        this.startRecording.emit();
      }
      return;
    }

    if (this.voice.recording()) {
      this.voice.stopRecording();
    } else {
      this.voice.startRecording((text) => this.handleVoiceTranscript(text));
    }
  }

  private handleVoiceTranscript(text: string) {
    const cleaned = (text ?? '').trim();
    if (!cleaned) return;

    if (this.disabled || this.sending) {
      this.onInputChange(cleaned);
      return;
    }

    this.inputText = cleaned;
    this.submit();
  }

  private hasExternalVoiceHandlers() {
    return this.startRecording.observers.length > 0 || this.stopRecording.observers.length > 0;
  }

  private scrollChatToBottom() {
    const el = this.chatWindow?.nativeElement;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }
}
