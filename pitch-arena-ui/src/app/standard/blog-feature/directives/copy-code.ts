import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy } from '@angular/core';

@Directive({ selector: '[appCopyCode]',
  standalone: true
 })
export class CopyCodeDirective implements AfterViewInit, OnDestroy {
  private cleanup?: () => void;

  constructor(private el: ElementRef<HTMLElement>, private zone: NgZone) {}

  ngAfterViewInit() {
    console.log("called")
    const root = this.el.nativeElement;

    const onClick = async (e: Event) => {
      console.log(e)
      const t = e.target as HTMLElement;
      if (!t || !t.classList.contains('copy-btn')) return;

      e.preventDefault();
      e.stopPropagation();

      const fig = t.closest('.code-figure') as HTMLElement | null;
      const codeEl = fig?.querySelector('[data-code]') as HTMLElement | null;
      const text = codeEl?.innerText ?? '';

      if (!text) {
        this.flash(t, 'Empty');
        return;
      }

      try {
        // Preferred: Clipboard API (needs https or localhost)
        if (typeof navigator.clipboard?.writeText === 'function' && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          this.flash(t, 'Copied!');
          return;
        }

        // Fallback: hidden textarea (works on Safari/iOS)
        this.copyViaHiddenTextarea(text);
        this.flash(t, 'Copied!');
      } catch (err) {
        console.error('Copy failed:', err);
        this.flash(t, 'Failed');
      }
    };

    this.zone.runOutsideAngular(() => {
      root.addEventListener('click', onClick);
      this.cleanup = () => root.removeEventListener('click', onClick);
    });
  }

  ngOnDestroy() { this.cleanup?.(); }

  private copyViaHiddenTextarea(text: string) {
    const ta = document.createElement('textarea');
    ta.value = text;
    // Keep it truly off-screen and unstyled to avoid page jump
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    ta.style.opacity = '0';
    document.body.appendChild(ta);

    // iOS needs explicit selection range
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);

    const ok = document.execCommand('copy'); // returns boolean in some browsers
    document.body.removeChild(ta);
    if (!ok) throw new Error('execCommand copy returned false');
  }

  private flash(btn: HTMLElement, msg: string) {
    const old = btn.textContent || 'Copy';
    btn.textContent = msg;
    btn.classList.add('copied');
    setTimeout(() => { btn.textContent = old; btn.classList.remove('copied'); }, 1200);
  }
}
