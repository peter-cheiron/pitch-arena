import { HttpClient } from '@angular/common/http';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { ArenaConfig } from '../models/arena-config';
import { UiButtonPillComponent } from "#ui";
import { Router } from '@angular/router';
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { Dialog } from '@angular/cdk/dialog';
import { TermsDialogComponent } from 'src/app/standard/terms/terms-dialog/terms-dialog';

@Component({
  selector: 'app-arenas',
  imports: [UiButtonPillComponent],
  templateUrl: './arenas.html'
})
export class Arenas {

  //--required for terms and conditions--//
  auth = inject(AuthService)
  user = computed(() => {
    return this.auth.user();
  })
  profile = null;
  profileService = inject(DbUserService)
  dialog = inject(Dialog);
  //--eof user

  router = inject(Router)

  //note that I need to move the config to a nice safe storage space and 
  //also add in an editor and viewer.
  private http = inject(HttpClient);

  arenas = [
    {name: "proptech", 
      image:"",
      description: "This is a proptech panel for the completely fake jury on the 2026 proptech innovation council", 
      path: "proptech"},
    {name: "standard", 
      image:"",
      description: "This is a default arena made up of a VC, CTO, product expert and a nice gentle host.", 
      path: "arena_classic"},
    {name: "gemini 2026", 
      image:"",
      description: "Panel aligned with Gemini 3 Hackathon judging criteria and weights.", 
      path: "arena_gemini3_hackathon"}
  ]

  path = null;

  config = signal<ArenaConfig | null>(null)
  selectedArena = signal<(typeof this.arenas)[number] | null>(null)

  constructor(){
    effect(() => {
      if(this.user()){
        this.profileService.getById(this.user().uid).then(profile => {
          this.profile = profile;
          if(!profile.termsRead){
            //create a dialog that forces this
            this.openTerms()
          }
        })
      }
    })
  }

  openTerms() {
  const ref = this.dialog.open<boolean>(TermsDialogComponent, {
    data: { title: 'Pitch Arena — Terms & Disclaimer' },
  });

  ref.closed.subscribe((accepted) => {
    if (accepted) {
      // e.g. set a flag in localStorage or profile doc
      //localStorage.setItem('pitchArenaTermsAccepted', new Date().toISOString());
      this.profileService.update(this.user().uid, {termsRead: true}).then(v => {
        console.log("terms accepted you may continue")
      })
    }else{
      console.log("you didn't accept them!")
      //TODO need to think of the best way to get this message across ...
      this.router.navigateByUrl("/terms?message=READ_PLEASE")
    }
  });
}

  selectArena(arena: (typeof this.arenas)[number]) {
    this.selectedArena.set(arena);
    this.loadArena(arena.path);
    this.path = arena.path;
  }

  loadArena(path: string){
    this.http.get<ArenaConfig>('/assets/arenas/' + path + ".json").subscribe(value => {
      this.config.set(value)
    })
  }

  launchArena(){
    this.router.navigateByUrl("/arena/" + this.path )
  }

  launchLab(){
    this.router.navigateByUrl("/lab/" + this.path )
  }

}
