import { Injectable, WritableSignal, signal } from '@angular/core';
import { getDownloadURL, getStorage, ref, uploadBytes } from '@angular/fire/storage';
import { SpeechService } from '#services/ai/speech.eleven.service';
import { ChatUIMessage } from '../chat/ui/chat-ui';

//TODO note toself to test this as I think I just broke it
@Injectable({ providedIn: 'root' })
export class VoiceService {
  private audio = new Audio();
  currentlyPlayingMsgId = signal<string | null>(null);

  recording = signal<boolean>(false);
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private storage = getStorage();

  constructor(private speech: SpeechService) {}

  stopAudio() {
    try {
      this.audio.pause();
      this.audio.currentTime = 0;
    } catch {}
    this.currentlyPlayingMsgId.set(null);
  }

  playMsg(msg: ChatUIMessage) {
    if (!msg.audioUrl) return;

    if (this.currentlyPlayingMsgId() === msg.id) {
      this.stopAudio();
      return;
    }

    this.stopAudio();
    this.audio.src = msg.audioUrl;
    this.audio
      .play()
      .then(() => this.currentlyPlayingMsgId.set(msg.id))
      .catch(() => this.currentlyPlayingMsgId.set(null));

    this.audio.onended = () => this.currentlyPlayingMsgId.set(null);
  }

  ensureVoice(
    msgId: string,
    chat: WritableSignal<ChatUIMessage[]>,
    judgeVoices: Record<string, string>
  ) {
    const msg = chat().find((m) => m.id === msgId);
    if (!msg || msg.role !== 'ai') return;
    if (msg.audioState === 'loading') return;
    if (msg.audioUrl) return;

    chat.update((list) =>
      list.map((m) =>
        m.id === msgId ? { ...m, audioState: 'loading' as const } : m
      )
    );

    const voiceId = msg.voiceId;// || judgeVoices[msg.judgeId!];

    this.speech
      .textToSpeechUrl(msg.text, voiceId)
      .then((url) => {
        chat.update((list) =>
          list.map((m) =>
            m.id === msgId
              ? { ...m, audioUrl: url, audioState: 'ready' as const }
              : m
          )
        );
        const updated = chat().find((m) => m.id === msgId);
        if (updated?.audioUrl) this.playMsg(updated);
      })
      .catch((err) => {
        console.error(err);
        chat.update((list) =>
          list.map((m) =>
            m.id === msgId ? { ...m, audioState: 'error' as const } : m
          )
        );
      });
  }

  startRecording(onTranscript: (text: string) => void) {
    if (this.recording()) return;

    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        this.audioChunks = [];
        this.mediaRecorder = new MediaRecorder(stream);
        this.recording.set(true);

        this.mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) this.audioChunks.push(e.data);
        };

        this.mediaRecorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop());
          this.handleRecordedAudio(onTranscript);
        };

        this.mediaRecorder.start();
      })
      .catch((err) => console.error('Mic access denied', err));
  }

  stopRecording() {
    if (!this.mediaRecorder || !this.recording()) return;
    this.recording.set(false);
    this.mediaRecorder.stop();
  }

  private handleRecordedAudio(onTranscript: (text: string) => void) {
    const blob = new Blob(this.audioChunks, { type: 'audio/webm' });
    const filename = `voice/${crypto.randomUUID()}.webm`;
    const audioRef = ref(this.storage, filename);

    uploadBytes(audioRef, blob)
      .then(() => getDownloadURL(audioRef))
      .then((url) => this.applySpeechUrl(url, onTranscript))
      .catch((err) => console.error('Upload failed', err));
  }

  private applySpeechUrl(url: string, onTranscript: (text: string) => void) {
    this.speech
      .speechToText(url)
      .then((text) => {
        const cleaned = (text ?? '').trim();
        if (!cleaned) return;
        onTranscript(cleaned);
      })
      .catch((err) => console.error('speechToText failed', err));
  }
}
