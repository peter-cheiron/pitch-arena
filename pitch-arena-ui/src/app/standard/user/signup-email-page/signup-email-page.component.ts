import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiButtonPillComponent } from '#ui';
import { TranslatePipe } from '@ngx-translate/core';
import { AuthService } from '#services/auth';
import { UiInputComponent } from 'src/app/ui/ui-input/ui-input.component';

@Component({
  standalone: true,
    selector: 'app-signup-email-page',
    templateUrl: './signup-email-page.component.html',
    imports: [
    //LoginMenubarComponent, 
    FormsModule,
    UiButtonPillComponent,
    UiInputComponent,
    TranslatePipe
]
})
export class SignupEmailPageComponent {

  login = {
    email: "",
    password: "",
    displayName: "",
    confirmPassword: "",
    firstName: "",
    lastName: "",
    instagram: "",
    tiktok: ""
  }

  private authService = inject(AuthService)

  constructor(){
    
  }

  //TODO add the other properties too
  signup(){

      this.authService.signUpWithEmail(this.login.email, 
        this.login.password,
        this.login.displayName);

  }

}
