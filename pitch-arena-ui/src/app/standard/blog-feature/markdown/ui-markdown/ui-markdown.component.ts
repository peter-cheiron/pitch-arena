import { CopyCodeDirective } from '../../directives/copy-code';
import { MarkdownService } from '../../services/markdown.service';
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-markdown-viewer',
  standalone: true,
  imports: [CopyCodeDirective],
  templateUrl: './ui-markdown.component.html'
})
export class UiMarkdownComponent {

  @Input() markdown: string = '';
  html: any = '';

  constructor(private markdownService: MarkdownService) {}

  ngOnChanges() {
    this.markdownService.convert(this.markdown).then(html => {
      this.html = html;
    });
  }

}
 