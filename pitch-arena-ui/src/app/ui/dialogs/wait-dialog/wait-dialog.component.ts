import { Component, input, computed, signal, effect, OnDestroy } from '@angular/core';

@Component({
  selector: 'wait-dialog',
  standalone: true,
  templateUrl: './wait-dialog.component.html'
})
export class WaitDialogComponent implements OnDestroy {
  /** Control visibility */
  visible = input<boolean>(false);
  /** Message under the spinner */
  message = input<string>('Working…');
  /** Optional small note */
  subtext = input<string | undefined>(undefined);

  private readonly alternates = [
    'Still working…',
    'Almost there…',
    'Final touches…',
    'Wrapping things up…'
  ];
  private rotation?: number;
  private position = 0;
  readonly displayed = signal<string>(this.message());

  readonly aria = computed(() => this.displayed() || 'Loading');

  constructor() {
    effect(
      () => {
        const rotationList = this.buildRotationList();
        const active = this.visible();

        this.stopRotation();
        this.position = 0;
        this.displayed.set(rotationList[0] ?? 'Working…');

        if (active && rotationList.length > 1) {
          this.rotation = window.setInterval(() => {
            this.position = (this.position + 1) % rotationList.length;
            this.displayed.set(rotationList[this.position]);
          }, 2400);
        }
      },
      { allowSignalWrites: true }
    );
  }

  ngOnDestroy(): void {
    this.stopRotation();
  }

  private buildRotationList(): string[] {
    const seen = new Set<string>();
    const list = [this.message(), ...this.alternates];
    return list.filter((msg) => {
      if (seen.has(msg)) return false;
      seen.add(msg);
      return true;
    });
  }

  private stopRotation() {
    if (this.rotation !== undefined) {
      clearInterval(this.rotation);
      this.rotation = undefined;
    }
  }
}
