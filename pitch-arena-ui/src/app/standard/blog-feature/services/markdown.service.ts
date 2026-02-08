import { Injectable } from '@angular/core';
import { marked, Renderer } from 'marked';
import hljs from 'highlight.js/lib/core';          // ← core only
import typescript from 'highlight.js/lib/languages/typescript';
import xml from 'highlight.js/lib/languages/xml';  // used for HTML
import plaintext from 'highlight.js/lib/languages/plaintext'; // ← add this
import bash from 'highlight.js/lib/languages/bash'; // ← add this
import css from 'highlight.js/lib/languages/css'; // ← add this
import shell from 'highlight.js/lib/languages/shell'; // ← add this


import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

// register minimal languages + aliases
hljs.registerLanguage('typescript', typescript);
hljs.registerLanguage('bash', bash);
hljs.registerLanguage('css', css);
hljs.registerLanguage('shell', shell);
hljs.registerLanguage('ts', typescript);
hljs.registerLanguage('tsx', typescript); // optional
hljs.registerLanguage('xml', xml);
hljs.registerLanguage('html', xml);
hljs.registerLanguage('plaintext', plaintext); // ← and this
hljs.registerLanguage('text', plaintext);      // optional alias

@Injectable({ providedIn: 'root' })
export class MarkdownService {
  constructor(private sanitizer: DomSanitizer) {
    const renderer = new Renderer();

renderer.code = ({ text, lang }) => {
      const requested = (lang || '').toLowerCase();
      const normalized =
        requested === 'htm' ? 'html' :
        requested === 'js'  ? 'javascript' :
        requested;

      const can = normalized && hljs.getLanguage(normalized);
      const highlighted = can
        ? hljs.highlight(text, { language: normalized, ignoreIllegals: true }).value
        : hljs.highlight(text, { language: 'plaintext' }).value;

      // Button lives in the figure; we copy from <code> sibling's innerText
      return `
        <figure class="code-figure">
      <button type="button" class="copy-btn" aria-label="Copy code">Copy</button>
      <pre class="code-pre"><code data-code class="hljs ${normalized || 'plaintext'}">${highlighted}</code></pre>
    </figure>
      `;
    };

    // Image rendering with figure + Tailwind classes
    renderer.image = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `
        <figure class="my-4">
          <img src="${href}" alt="${text}"${titleAttr} class="block max-w-full mx-auto rounded shadow" />
          ${text ? `<figcaption class="text-sm text-gray-500 text-center mt-2">${text}</figcaption>` : ''}
        </figure>
      `;
    };

    marked.setOptions({ renderer });
  }

  async convert(markdown: string): Promise<SafeHtml> {
    if (markdown) {
      const rawHtml = await marked.parse(markdown);
      return this.sanitizer.bypassSecurityTrustHtml(rawHtml as string);
    } else {
      return '';
    }
  }
}
