import { Component, Output, EventEmitter, ViewChild, ElementRef, Input, inject } from '@angular/core';
import { MarkdownService } from '../../services/markdown.service';
import { FormsModule } from '@angular/forms';
import { SafeHtml } from '@angular/platform-browser';
import { ImageService } from '#services/image.service';
import { CopyCodeDirective } from '../../directives/copy-code';
import { UiTabComponent } from 'src/app/ui/ui-tab/ui-tab.component';


@Component({
  selector: 'ui-markdown-editor',
  standalone: true,
  imports: [FormsModule, 
    UiTabComponent, 
    CopyCodeDirective],
  templateUrl: './ui-markdown-editor.component.html'
})
export class UiMarkdownEditorComponent {

  @Input() markdown: string = '';
  @Input() showPreview: boolean = false;
  @Output() contentChange = new EventEmitter<string>();
  @Output() imageUploaded = new EventEmitter<string>();
  @ViewChild('editor') editor!: ElementRef<HTMLTextAreaElement>;

  @Input() rows = this.showPreview ? 10 : 30

  rendered: SafeHtml = '';
  imageService = inject(ImageService);

  tabs = [
    {key: "editor", label: "Editor"},
    {key: "preview", label: "Preview"}
  ]

  activeTab = "editor";

  constructor(private markdownService: MarkdownService) {}

  ngOnChanges() {
    this.updatePreview();
    this.rows = this.showPreview ? 10 : 30
  }

  setTab(tab){
    this.activeTab = tab;
  }

  onTextChange(value: string) {
    this.markdown = value;
    this.contentChange.emit(value);
    this.updatePreview();
  }

  async updatePreview() {
    this.rendered = await this.markdownService.convert(this.markdown);
  }

  /** Insert at cursor */
  private insertAtCursor(text: string) {
    const textarea = this.editor.nativeElement;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.setRangeText(text, start, end, 'end');
    this.onTextChange(textarea.value);
  }

  /** Toolbar click */
  onToolbarImage() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      if (input.files?.length) this.uploadImage(input.files[0]);
    };
    input.click();
  }

  /** Drag & drop */
  onDrop(event: DragEvent) {
    event.preventDefault();
    const file = event.dataTransfer?.files[0];
    if (file) this.uploadImage(file);
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
  }

  /** Paste image */
  onPaste(event: ClipboardEvent) {
    const file = event.clipboardData?.items[0]?.getAsFile();
    if (file) this.uploadImage(file);
  }

  /** Upload to Firebase + insert */
  private async uploadImage(file: File) {
    this.imageService.handleFile(file, "", (url) => {
      this.insertAtCursor(`![](${url})`);
      this.imageUploaded.emit(url);
    });
  }

  
}
