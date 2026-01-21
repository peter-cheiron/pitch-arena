import { Component, Input } from '@angular/core';

@Component({
  selector: 'judge-card',
  imports: [],
  templateUrl: './judge-card.html',
  standalone: true
})
export class JudgeCard {
  @Input() topTitle = "Round 1";
  @Input() rightTag = "Score";
  @Input() name = "VC Judge";
  @Input() hp = "6.8";
  @Input() isMini = true;

  @Input() imageLabel = null;

  @Input() criteriaTitle = "Fundability";
  @Input() criteriaText = "Market size, wedge, defensibility.";
  @Input() rating = 2;

  @Input() criteria2Title = "Feasibility";
  @Input() criteria2Text = "MVP scope, technical risk, speed to ship.";
  @Input() rating2 = 2;

  @Input() weakness = "transparancy";
  @Input() resist = "hand-wavy";
  @Input() tone = "";
}
