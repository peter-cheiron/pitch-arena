import { Component, computed, effect, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { Dialog } from '@angular/cdk/dialog';
import { TermsDialogComponent } from 'src/app/standard/terms/terms-dialog/terms-dialog';

@Component({
  selector: 'app-arenas',
  imports: [],
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

  arenas = [
    {name: "proptech", 
      image:"/assets/images/proptech.jpg",
      description: "This is a proptech panel for the completely fake jury on the 2026 proptech innovation council", 
      path: "proptech"},
    {name: "standard", 
      image:"/assets/images/arena.jpg",
      description: "This is a default arena made up of a VC, CTO, product expert and a nice gentle host.", 
      path: "arena_classic"},
    {name: "gemini 2026", 
      image:"/assets/images/gemini-3.webp",
      description: "Panel aligned with Gemini 3 Hackathon judging criteria and weights.", 
      path: "arena_gemini3_hackathon"},
    {name: "gemini fast", 
      image:"/assets/images/gemini-3.webp",
      description: "A faster test arena for demo and testing purposes.", 
      path: "gemini"},
    {name: "Solo VC", 
      image:"/assets/images/vc.jpg",
      description: "A one on one with an annoying VC that hates investing.", 
      path: "solo_vc"}
  ]

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

  goToDetails(arena: (typeof this.arenas)[number]) {
    this.router.navigateByUrl("/arenas/" + arena.path)
  }

}
