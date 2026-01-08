import { Component, computed, effect, inject, signal } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { WaitService } from './ui/dialogs/wait-service/wait-service.component';
import { NavigationService } from '#services/navigation.service';
import { LocaleService } from '#services/locale.service';
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { Profile } from '#models/profile';
import { NavigationHeaderComponent } from "./standard/navigation-header/navigation-header.component";
import { WaitDialogComponent } from "./ui/dialogs/wait-dialog/wait-dialog.component";
import { FooterComponent } from "./standard/footer/footer.component";

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, NavigationHeaderComponent, WaitDialogComponent, FooterComponent],
  standalone:true,
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
   wait = inject(WaitService);

  //the idea is to have better back support
  navigationService = inject(NavigationService)
  title = 'pitch-arena';
  warningDialog = signal(false);
  localeService = inject(LocaleService);

  router = inject(Router)

  //for these to work we need a firebase application setup and a deployment
  /**/
  auth = inject(AuthService);
  user = computed(() => this.auth.user());
  private profileService = inject(DbUserService)
  profile: Profile;
  

  constructor(){
    /**
     * welcome and check the environment type
     */
    console.log('*****************************');
    console.log('** welcome to your app.    **');
    console.log('*****************************');

    /*
    //will be unlocked with maps
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${environment.GOOGLE_MAPS}&libraries=places`;
      document.head.appendChild(script);
      */


    // init lang
    this.localeService.init();

    effect(() => {
      //anything to check like profile?
    })
  }

  showHeader(){
    return this.user() ? true :false; 
  }

  showFooter(){
    return false;  
  }
}
