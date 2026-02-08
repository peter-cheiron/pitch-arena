// src/app/ui/terms-dialog/terms-dialog.component.ts
import { Component, Inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';

export type TermsDialogData = {
  title?: string;
  acceptLabel?: string;
  cancelLabel?: string;
  // Optional: if you want to inject HTML, keep it trusted + sanitize upstream.
  // For simple usage, just hardcode the content in the template below.
};

@Component({
  standalone: true,
  imports: [DialogModule],
  selector: 'app-terms-dialog',
  template: `
    <div class="rounded-lg bg-white shadow-xl border w-full max-w-[720px]">
      <div class="px-4 py-3 border-b font-semibold">
        {{ data?.title || 'Terms & Disclaimer' }}
      </div>

      <div class="p-4">
        <div class="max-h-[60vh] overflow-auto pr-2 text-sm leading-6 text-neutral-800 space-y-4">
          <section>
            <h3 class="font-semibold">1. No Acceptance, No Endorsement, No Guarantee</h3>
            <p>Pitch Arena is a simulated evaluation experience.</p>
            <ul class="list-disc pl-5">
              <li>Participation does not constitute acceptance, selection, endorsement, or approval of any project, idea, or founder.</li>
              <li>Scores, verdicts, and feedback are illustrative only and have no formal, legal, or commercial meaning.</li>
              <li>No outcome implies eligibility for any program, prize, accelerator, or partnership.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">2. No Funding, No Investment, No Financial Commitment</h3>
            <p>Pitch Arena does not provide funding, investment, grants, or financial support.</p>
            <ul class="list-disc pl-5">
              <li>No money is offered, promised, implied, or committed.</li>
              <li>Nothing constitutes an offer to invest, a solicitation, or financial advice.</li>
              <li>Any “fundable / pass / yes / no” language is purely conversational and non-binding.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">3. Advice Is Experimental and Must Be Used With Judgment</h3>
            <p>Feedback and summaries are generated as part of an AI-assisted simulation.</p>
            <ul class="list-disc pl-5">
              <li>Advice is provided freely and without warranty.</li>
              <li>It may be incomplete, incorrect, biased, or unsuitable for your situation.</li>
              <li>You are responsible for evaluating and deciding whether to act on any feedback.</li>
              <li>This is not a substitute for professional advice (legal, financial, technical, etc.).</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">4. AI-Generated Content</h3>
            <ul class="list-disc pl-5">
              <li>Outputs may vary between sessions and are non-deterministic.</li>
              <li>The system may hallucinate or misunderstand context.</li>
              <li>Do not rely on outputs as factual statements or guarantees.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">5. Data Storage and Privacy</h3>
            <ul class="list-disc pl-5">
              <li>Conversation data and inputs may be stored to enable the experience, continuity, and optional exports.</li>
              <li>Data is not shared, sold, or disclosed to third parties.</li>
              <li>Data can be deleted on request.</li>
              <li>Do not submit confidential or sensitive information you are unwilling to store temporarily.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">6. No Confidentiality or IP Protection</h3>
            <ul class="list-disc pl-5">
              <li>Submissions are treated as non-confidential.</li>
              <li>You retain ownership of your ideas; Pitch Arena provides no IP protection guarantees.</li>
              <li>Do not submit trade secrets or information requiring NDA-level protection.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">7. Limitation of Liability</h3>
            <ul class="list-disc pl-5">
              <li>Pitch Arena is provided “as is”, without warranties of any kind.</li>
              <li>We are not liable for decisions, losses, damages, or consequences arising from use.</li>
              <li>Use of the platform is at your own risk.</li>
            </ul>
          </section>

          <section>
            <h3 class="font-semibold">8. Acceptance</h3>
            <p>
              By clicking <span class="font-medium">Accept</span>, you acknowledge you have read,
              understood, and agreed to these terms.
            </p>
          </section>
        </div>

        <label class="mt-4 flex items-start gap-2 text-sm text-neutral-800">
          <input
            type="checkbox"
            class="mt-1"
            [checked]="checked"
            (change)="checked = !checked"
          />
          <span>I understand this is a simulated panel (no acceptance, no funding) and I accept the terms.</span>
        </label>
      </div>

      <div class="px-4 py-3 border-t flex justify-end gap-2">
        <button class="px-3 py-1 rounded border" (click)="ref.close(false)">
          {{ data?.cancelLabel || 'Cancel' }}
        </button>
        <button
          class="px-3 py-1 rounded bg-neutral-900 text-white disabled:opacity-50 disabled:cursor-not-allowed"
          [disabled]="!checked"
          (click)="ref.close(true)"
        >
          {{ data?.acceptLabel || 'Accept' }}
        </button>
      </div>
    </div>
  `,
})
export class TermsDialogComponent {
  checked = false;
  constructor(public ref: DialogRef<boolean>, @Inject(DIALOG_DATA) public data: TermsDialogData) {}
}
