import { Component, EventEmitter, Input, Output, input, model, signal, effect, OnDestroy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiButtonPillComponent } from "../ui-button-pill/ui-button-pill.component";

@Component({
  standalone: true,
  selector: 'ui-image',
  templateUrl: './ui-image.component.html',
  imports: [FormsModule, UiButtonPillComponent],
})
export class UiImageComponent implements OnDestroy {
  value = model<File | null>(null);
  label = input<string>();
  accept = input<string>('image/*');

  /** Optional: show a preview URL (blob: or https:) */
  @Input() preview: string | null = null;

  /** Parent-controlled reset trigger. Increment to clear. */
  resetKey = input<number>(0);

  @Input() useAI: boolean = false;
  @Output() fileChanged = new EventEmitter<File | null>();
  @Output() callAIService = new EventEmitter();
  @Output() cleared = new EventEmitter<void>();

  constructor() {
    // When parent bumps resetKey, clear the image
    effect(() => {
      this.resetKey();   // consume signal
      this.clear();      // wipe preview + value
    });
  }

  ngOnDestroy() {
    this.revokePreview();
  }

  onFileSelected(event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (file) {
      this.revokePreview(); // revoke old blob if any
      this.value.set(file);
      this.preview = URL.createObjectURL(file);
      this.fileChanged.emit(file);
    }
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files?.[0];
    if (file && file.type.startsWith('image/')) {
      this.revokePreview();
      this.value.set(file);
      this.preview = URL.createObjectURL(file);
      this.fileChanged.emit(file);
    }
  }

  allowDrop(event: DragEvent) { event.preventDefault(); }

  callAI() { this.callAIService.emit("ai-call"); }

  /** Public: clear preview + model value and emit events */
  clear() {
    this.revokePreview();
    this.preview = null;
    this.value.set(null);
    this.fileChanged.emit(null);
    this.cleared.emit();
  }

  private revokePreview() {
    if (this.preview && this.preview.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.preview); } catch {}
    }
  }
}
