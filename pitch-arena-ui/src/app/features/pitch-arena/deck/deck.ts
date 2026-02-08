import { Component, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
//worlds longest path award is to ....
import { UiMarkdownEditorComponent } from "src/app/standard/blog-feature/markdown/ui-markdown-editor/ui-markdown-editor.component";
import { UiButtonPillComponent } from "#ui";
import { HostService } from '../services/host.service';
import { ArenaService } from '../services/arena-service';
import { HostProfile } from '../arena-models';
import { UiTabComponent } from "src/app/ui/ui-tab/ui-tab.component";
import { WaitService } from 'src/app/ui/dialogs/wait-service/wait-service.component';
import { pitch_pitch_arena } from '../services/utilities';
import { DbPitchService, Pitch } from '#services/db/db-pitch.service';

@Component({
  selector: 'app-deck',
  imports: [UiMarkdownEditorComponent, UiButtonPillComponent, UiTabComponent],
  templateUrl: './deck.html',
  standalone: true
})
export class Deck {

  router = inject(Router)
  hostService = inject(HostService)
  arenaService = inject(ArenaService)
  route = inject(ActivatedRoute)

  pitchService = inject(DbPitchService)
  pitches = signal<Pitch[]>([])

  markdown = pitch_pitch_arena //"";
  hostProfile: HostProfile = {}

  path = "";

  tabs = [
    {label: 'Pitches', key:'pitch'},
    {label: 'Text', key:'text'},
    {label: 'Slides', key: 'slides'},
    {label: 'PDF', key: 'pdf'},
    {label: 'Video', key: 'video'},
  ]

  activeTab = 'pitch'

  waitService = inject(WaitService)

  ngOnInit() {
    const path = this.route.snapshot.paramMap.get('path') ?? 'gemini';
    this.loadArena(path);

    this.pitchService.listDocs().then(pitches => {
      this.pitches.set(pitches)
    })
  }

  private async loadArena(path: string) {
    const cfg = await this.arenaService.getArenaConfig(path);
    this.path = path;
    const host = cfg?.judges?.find((judge) => judge.id === 'host') ?? null;
    if (host?.profileConfig?.length) {
      this.hostProfile = this.hostService.getNewProfile(host.profileConfig);
      console.log("got the profile", this.hostProfile)
      return;
    }
    this.hostProfile = {};
  }

  submit(){
    if(this.markdown.length <= 0){
      return; //todo add warning here
    }
    this.waitService.show("Wait a second", "We are taking a look at your introduction.")
    this.hostService.parseMarkdownWithGemini(this.markdown, this.hostProfile).then(profile => {
      
        const payload = { ...profile, 
          pitch: this.markdown
        };

        //TODO one idea would be to uses sessions ... this isn't a bad idea 

        localStorage.setItem('arena:pending', JSON.stringify(payload));

        this.waitService.hide()

        this.router.navigate(['/arena', this.path], {
          queryParams: { from: 'preparse' }
        });
    })
  }

    launch(content){
    this.waitService.show("Wait a second", "We are taking a look at your introduction.")
    this.hostService.parseMarkdownWithGemini(content, this.hostProfile).then(profile => {
      
        const payload = { ...profile, 
          pitch: this.markdown
        };

        //TODO one idea would be to uses sessions ... this isn't a bad idea 

        localStorage.setItem('arena:pending', JSON.stringify(payload));

        this.waitService.hide()

        this.router.navigate(['/arena', this.path], {
          queryParams: { from: 'preparse' }
        });
    })
  }

  runPitch(id){
    this.pitchService.getById(id).then(pitch => {
      this.launch(pitch.content)
    })
  }

  cancel(){

  }

}
