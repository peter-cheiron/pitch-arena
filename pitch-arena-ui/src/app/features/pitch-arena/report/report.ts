import { CommonModule } from '@angular/common';
import { Component, Inject } from '@angular/core';
import { DialogModule, DialogRef, DIALOG_DATA } from '@angular/cdk/dialog';
import { EndSummary } from '../arena/helpers';

@Component({
  selector: 'report-card',
  imports: [CommonModule, DialogModule],
  templateUrl: './report.html',
  standalone: true
})
export class Report {
  constructor(
    public ref: DialogRef<boolean>,
    @Inject(DIALOG_DATA) public data: ReportDialogData,
  ) {}

  get summary(): EndSummary | null {
    return this.data?.summary ?? null;
  }

  get coach(): CoachReport | null {
    const raw = this.data?.coachReport ?? null;
    if (!raw) return null;
    return (raw as any).coach ?? raw;
  }

  get judgeRuns(): JudgeRunLike[] {
    return this.data?.judgeRuns ?? [];
  }

  get pitch(): string {
    return String(this.data?.profile?.['pitch'] ?? '').trim();
  }

  verdictClass(verdict: EndSummary['verdict'] | undefined): string {
    if (verdict === 'pass') return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    if (verdict === 'fail') return 'bg-rose-100 text-rose-800 border-rose-200';
    return 'bg-amber-100 text-amber-800 border-amber-200';
  }
}

export type ReportDialogData = {
  title?: string;
  summary?: EndSummary | null;
  coachReport?: CoachReport | null;
  judgeRuns?: JudgeRunLike[];
  profile?: Record<string, unknown> | null;
};

export type JudgeRunLike = {
  judgeLabel?: string;
  score?: number;
  comment?: string;
  question?: string;
  answer?: string;
  round?: number;
};

export type CoachReport = {
  overallScore?: number;
  summary?: string;
  strength?: string[];
  fixes?: string[];
  drill?: string;
  gaps?: string[];
  criteria?: Array<{
    id?: string;
    label?: string;
    score?: number;
    note?: string;
  }>;
};
