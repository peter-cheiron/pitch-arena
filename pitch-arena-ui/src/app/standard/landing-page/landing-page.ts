// pitch-arena-landing.component.ts
import { Component } from '@angular/core';

type PreviewCard = {
  title: string;
  score: string;
  body: string;
  points?: string[];
};

type HowStep = {
  step: string;
  tag: string;
  title: string;
  description: string;
};

type ModeBlock = {
  title: string;
  badge: string;
  description: string;
  bullets: string[];
};

type JudgeCard = {
  role: 'VC' | 'CTO' | 'CPO' | 'CMO' | 'CFO';
  tag: string;
  blurb: string;
};

type OutputBlock = {
  title: string;
  description: string;
  chips: string[];
};

type Plan = {
  title: string;
  price: string;
  description: string;
  bullets: string[];
  cta: string;
};

@Component({
  selector: 'app-pitch-arena-landing',
  standalone: true,
  templateUrl: './landing-page.html',
})
export class LandingPageComponent {
  currentYear = new Date().getFullYear();

  previewCards: PreviewCard[] = [
    {
      title: 'VC Judge',
      score: '6.5/10',
      body: 'Big upside, but your wedge is still fuzzy and the buyer is unclear.',
      points: ['Name the buyer.', 'Pick a tight niche.', 'Prove demand with 5 pilots.'],
    },
    {
      title: 'CTO Judge',
      score: '7.2/10',
      body: 'Feasible, but your MVP scope is bloated. Reduce complexity and ship faster.',
      points: ['Cut integrations.', 'Single happy path first.', 'Measure time-to-value.'],
    },
    {
      title: 'Product Judge',
      score: '6.7/10',
      body: 'Problem is real, but the user journey needs one crisp outcome, not 12 features.',
      points: ['Define the “Aha”.', 'Remove optional flows.', 'Test with 10 users.'],
    },
  ];

  howItWorks: HowStep[] = [
    {
      step: '01',
      tag: 'Pitch',
      title: 'Drop your pitch',
      description:
        'Paste a one-liner, a full pitch, or upload notes. Pitch Arena normalises it into a clean summary.',
    },
    {
      step: '02',
      tag: 'Judges',
      title: 'Get challenged by a panel',
      description:
        'Each judge scores with a rubric, highlights risks, and asks hard questions from their domain.',
    },
    {
      step: '03',
      tag: 'Iterate',
      title: 'Improve, rescore, repeat',
      description:
        'Answer the questions, refine your pitch, and run the next round. Progress is tracked across rounds.',
    },
  ];

  modes: ModeBlock[] = [
    {
      title: 'Fun Mode (Arcade)',
      badge: 'Fast feedback',
      description:
        'Quick pressure-testing with sharp, high-energy critique. Perfect for early-stage ideas.',
      bullets: [
        'Short context → cheaper & faster',
        'Punchy feedback + clear scores',
        'Great for brainstorming and iteration',
        '“One more round” game vibe (without losing realism)',
      ],
    },
    {
      title: 'Pro Mode (Deep Arena)',
      badge: 'Serious analysis',
      description:
        'Long-context evaluation with deeper structure. Designed for founders preparing real decks and decisions.',
      bullets: [
        'Deep context: docs, notes, prior rounds',
        'Stricter rubrics and investor-grade tone',
        'Focus on risks, assumptions, next experiments',
        'Outputs a clear action plan and roadmap',
      ],
    },
  ];

  judges: JudgeCard[] = [
    {
      role: 'VC',
      tag: 'Fundability',
      blurb: 'Market size, wedge, defensibility, and whether this can become a venture-scale company.',
    },
    {
      role: 'CTO',
      tag: 'Feasibility',
      blurb: 'MVP scope, technical risk, architecture simplicity, and how fast a small team can ship.',
    },
    {
      role: 'CPO',
      tag: 'Product',
      blurb: 'Problem clarity, user pain, value delivery, retention, and what the true “Aha moment” is.',
    },
    {
      role: 'CMO',
      tag: 'GTM',
      blurb: 'Positioning, differentiation, channels, and whether acquisition can be repeatable and affordable.',
    },
    {
      role: 'CFO',
      tag: 'Economics',
      blurb: 'Pricing, unit economics, capital intensity, runway realism, and where the model breaks.',
    },
  ];

  outputs: OutputBlock[] = [
    {
      title: 'Scores that move over time',
      description:
        'Every round produces a score + delta. You can see what improved, what regressed, and why.',
      chips: ['Overall score', 'Dimension scores', 'Score delta', 'Consensus view'],
    },
    {
      title: 'Hard questions (not generic tips)',
      description:
        'Judges ask the uncomfortable questions founders avoid — then use your answers as memory next round.',
      chips: ['Tough questions', 'Assumption testing', 'Risk flags', 'Follow-up pressure'],
    },
    {
      title: 'Next steps you can execute',
      description:
        'A crisp plan: experiments, MVP cuts, positioning tweaks, and what would change the verdict.',
      chips: ['MVP cuts', 'Pilot plan', 'Messaging', 'Go/No-Go criteria'],
    },
  ];

  plans: Plan[] = [
    {
      title: 'Free',
      price: '€0',
      description: 'Perfect to pressure-test ideas and run a few quick rounds.',
      bullets: [
        'Fun mode rounds',
        'Core judge panel (VC, CTO, Product)',
        'Basic scoring + feedback',
        'Export summary',
      ],
      cta: 'Start free',
    },
    {
      title: 'Pro',
      price: '€—',
      description: 'For founders who want deeper context, serious iteration, and investor-grade outputs.',
      bullets: [
        'Pro mode rounds (deep analysis)',
        'Full judge panel (VC, CTO, CPO, CMO, CFO)',
        'Long context across rounds',
        'Action plan + stronger synthesis',
      ],
      cta: 'Join waitlist',
    },
  ];
}
