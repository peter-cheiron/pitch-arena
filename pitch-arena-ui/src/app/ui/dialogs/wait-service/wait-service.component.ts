import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class WaitService {
  readonly visible = signal(false);
  readonly message = signal<string>('Working…');
  readonly subtext = signal<string | undefined>(undefined);

  show(msg = 'Working…', sub?: string) {
    this.message.set(msg);
    this.subtext.set(sub);
    this.visible.set(true);
    // optionally lock scroll:
    document.documentElement.style.overflow = 'hidden';
  }

  hide() {
    this.visible.set(false);
    this.subtext.set(undefined);
    document.documentElement.style.overflow = '';
  }

  /** Helper: run an async op with auto show/hide */
  async wrap<T>(promise: Promise<T>, msg = 'Working…', sub?: string): Promise<T> {
    this.show(msg, sub);
    try {
      return await promise;
    } finally {
      this.hide();
    }
  }
}
