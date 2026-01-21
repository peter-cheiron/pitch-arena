import { CommonModule } from "@angular/common";
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild, effect, inject } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { VoiceService } from "../../services/voice.service";
import { ChatUIMessage } from "./chat-ui";

@Component({
  selector: 'chat-ui-horizontal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="flex h-[44vh] flex-col gap-3 lg:flex-row">
      <div class="flex min-h-0 flex-1 flex-col">
        <div
          #chatWindow
          class="flex-1 overflow-y-auto rounded-2xl border px-4 py-4 space-y-3"
          style="border-color: var(--color-border); background: var(--color-surface);"
        >
          @if (!messages.length) {
            <div class="text-center text-xs" style="color: var(--color-muted);">
              Start the conversation when you are ready.
            </div>
          }

          @for (m of messages; track m.id) {
            @if (m.role === 'system') {
              <div class="flex justify-center">
                <div
                  class="text-[11px] px-3 py-1 rounded-full border"
                  style="border-color: var(--color-border);
                         background: color-mix(in srgb, var(--color-bg) 60%, var(--color-surface));
                         color: var(--color-muted);"
                >
                  @if (m.title) {
                    <span class="font-semibold" style="color: var(--color-text);">{{ m.title }}</span>
                  }
                  <span [ngClass]="{ 'ml-2': !!m.title }">{{ m.text }}</span>
                </div>
              </div>
            } @else {
              <div class="flex" [ngClass]="m.role === 'user' ? 'justify-end' : 'justify-start'">
                <div class="max-w-[85%]">
                  @if (m.role === 'ai') {
                    <div class="mb-1 flex items-center justify-between gap-2">
                      @if (m.title) {
                        <div class="text-[11px]" style="color: var(--color-muted);">{{ m.title }}</div>
                      } @else {
                        <span></span>
                      }

                      <div class="flex items-center gap-2">
                        <button
                          type="button"
                          class="text-[11px] px-2 py-1 rounded-full border transition active:scale-[0.99]"
                          style="border-color: var(--color-border); background: var(--color-surface);"
                          (click)="ensureVoice.emit(m.id)"
                          [disabled]="m.audioState === 'loading'"
                          title="Generate voice"
                        >
                          @if (m.audioState === 'loading') { … }
                          @else { 🔊 }
                        </button>

                        @if (m.audioUrl) {
                          <button
                            type="button"
                            class="text-[11px] px-2 py-1 rounded-full border transition active:scale-[0.99]"
                            style="border-color: var(--color-border);
                                   background: color-mix(in srgb, var(--color-accent) 8%, var(--color-surface));"
                            (click)="playVoice.emit(m)"
                            title="Play / stop"
                          >
                            @if (playingMessageId === m.id) { ⏸ }
                            @else { ▶ }
                          </button>
                        }
                      </div>
                    </div>
                  } @else if (m.title) {
                    <div class="text-[11px] mb-1" style="color: var(--color-muted);">{{ m.title }}</div>
                  }

                  <div
                    class="rounded-2xl border px-3 py-2 text-sm whitespace-pre-wrap"
                    [ngStyle]="m.role === 'user' ? userBubbleStyle : aiBubbleStyle"
                  >
                    {{ m.text }}
                  </div>

                  @if (m.role === 'ai' && m.audioState === 'error') {
                    <div class="mt-1 text-[11px]" style="color: var(--color-danger);">
                      Voice generation failed.
                    </div>
                  }
                </div>
              </div>
            }
          }
        </div>
      </div>

      <div class="flex w-full flex-col gap-2 lg:w-80">
        <textarea
          class="flex-1 min-h-[140px] rounded-2xl border px-3 py-2 text-sm outline-none transition"
          rows="6"
          [ngModel]="inputText"
          (ngModelChange)="onInputChange($event)"
          [placeholder]="placeholder"
          [disabled]="disabled || sending"
          style="border-color: var(--color-border);
                 background: color-mix(in srgb, var(--color-bg)0%, var(--color-surface));
                 color: var(--color-text);"
        ></textarea>
        <div class="flex items-center gap-2">
          <button
            type="button"
            class="rounded-2xl px-4 py-2 text-sm font-semibold transition active:scale-[0.99] disabled:opacity-50"
            [disabled]="!inputText.trim().length || disabled || sending"
            (click)="submit()"
          >
            @if (sending) { Sending… } @else { Send }
          </button>
          <button
            type="button"
            class="rounded-2xl px-3 py-2 border text-sm transition active:scale-[0.99]"
            style="border-color: var(--color-border); background: var(--color-surface);"
            (click)="toggleRecording()"
            [disabled]="disabled || sending"
            title="Record voice"
          >
            @if (recording) { ⏹ Stop }
            @else { 🎙 Speak }
          </button>
        </div>
      </div>
    </div>
  `,
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
