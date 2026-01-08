// src/app/ui/simple-dialog/simple-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';


@Component({
  standalone: true,
  imports: [DialogModule],
  selector: 'app-simple-dialog',
  template: `
    <div class="rounded-lg bg-white shadow-xl border w-full max-w-[480px]">
      <div class="px-4 py-3 border-b font-semibold">{{ data?.title || 'Dialog' }}</div>
      <div class="p-4">
        <ng-content></ng-content>
        @if (data?.message) {
          <p>{{ data.message }}</p>
        }
      </div>
      <div class="px-4 py-3 border-t flex justify-end gap-2">
        <button class="px-3 py-1 rounded border" (click)="ref.close(false)">Cancel</button>
        <button class="px-3 py-1 rounded bg-neutral-900 text-white" (click)="ref.close(true)">OK</button>
      </div>
    </div>
    `
})
export class SimpleDialogComponent {
  constructor(public ref: DialogRef<boolean>, @Inject(DIALOG_DATA) public data: any) {}
}