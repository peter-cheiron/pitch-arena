import { Component, inject } from '@angular/core';
import { pitch_pitch_arena } from '../services/utilities';
import { ArenaService } from '../services/arena-service';
import { UiButtonPillComponent } from "#ui";
import { CoachService } from '../services/coach.service';

@Component({
  selector: 'app-coach-test',
  imports: [UiButtonPillComponent],
  templateUrl: './coach-test.html',
  standalone: true
})
export class CoachTest {

  pitch = pitch_pitch_arena;
  qa = q;
  arenaConfig;

  coach = inject(CoachService)

  arenaService = inject(ArenaService)
  arenaPath = "gemini-clean";
  loading = false;
  error = ''
  results = []

  //coach advice is
  advice;

  async ngOnInit(){
    const path = this.arenaPath.trim() || 'gemini-clean';
    this.loading = true;
    this.error = '';
    this.results = [];

    try {
      const cfg = await this.arenaService.getArenaConfig(path);
      if (!cfg) {
        this.arenaConfig = null;
        this.error = `Arena not found: ${path}`;
        return;
      }
      this.arenaPath = path;
      this.arenaConfig = cfg;
    } finally {
      this.loading = false;
    }
  }

  runTest(){
    this.coach.run(this.arenaConfig, this.pitch, this.qa).then(results => {
      console.log(results)
      this.advice = results;
    })
  }

}

export const q = {
  "exportedAt": "2026-01-29T15:58:11.715Z",
  "interactions": [
    {
      "questioner": "ai",
      "responder": "user",
      "question": "Welcome so who are you, and what are you trying to build?",
      "answer": "peter with pitch arena"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "Give me your one-sentence pitch. What problem are you solving?",
      "answer": "you know you have a big pitch to do but you get tired of practising with the cat, pitch arena never tires"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "Who is your specific target user? Be precise.",
      "answer": "founders, makers, anyone that has to pitch"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "What’s the one thing you deliberately cut from the demo?",
      "answer": "video characters, no time"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "Can you show me exactly how Gemini simulates a specific investor's persona and questioning style during the live demo?",
      "answer": "yes it basically does what you do it has a global objective and its own personal motivations and criteria we blend these to create meaninful and pertinent questions"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "The relief of getting a honest critique at 2 AM is a great user moment for any founder. To make this work in a weekend, you need to focus on one specific part of the pitch process like the Q&A session.\nWhat is the single most important feedback metric the user sees immediately after they finish their rehearsal?",
      "answer": "they get a scorecard of what the judges think based on the global objective pass/fail and also the sub objectives of the judges"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "What assumption would you test first if you had a week?",
      "answer": "user engagement"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "Distinct judge personalities sound good, but I need to see how the user interacts with them beyond reading a list of questions. The global objective sounds a bit abstract for a high-speed demo.\nHow will you show the audio-visual feedback loop during the pitch so we see Gemini processing the founder's live delivery in real time?",
      "answer": "the global objective is required as it keeps the judges focused on the goal and their questions test the pitch against the goal"
    },
    {
      "questioner": "ai",
      "responder": "user",
      "question": "A scorecard is a decent start, but founders need to know exactly where they lost the room during the talk. Seeing the scores is one thing, but knowing the reason behind a low score is what keeps them coming back.\nWill the scorecard pinpoint the exact timestamp in the recording where the founder lost the judge's interest?",
      "answer": "no we don't think that we can achieve that level of precision and generally thats not the way people work: you get vague idea of what is working or not but not 'at that second I failed'"
    }
  ]
}
