import { Component, computed, effect, inject } from '@angular/core';
import { UiInputComponent, UiButtonPillComponent } from "#ui";
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { Profile } from '#models/profile';

@Component({
  selector: 'app-sorry',
  imports: [UiInputComponent, UiButtonPillComponent],
  templateUrl: './sorry.html',
  standalone: true
})
export class Sorry {

  auth = inject(AuthService)
  user = computed(() => this.auth.user())
  profileService = inject(DbUserService)
  profile: Profile;
  demoAccessKey = "";

  statusMessage = "";

  constructor(){
    effect(() => {
      if(this.user()){
        this.profileService.getById(this.user().uid).then(p => {
          this.profile = p;
          this.demoAccessKey = p.demoAccessKey;
        })
      }
    })
  }

  saveDemoKey(){
    this.profileService.update(this.user().uid, {
      demoAccessKey: this.demoAccessKey
    }).then(resp => {
      console.log("should be set now")
    })
  }

}
