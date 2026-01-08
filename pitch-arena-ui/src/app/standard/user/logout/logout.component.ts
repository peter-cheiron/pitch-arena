import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '#services/auth';
import { UiButtonPillComponent } from '#ui';
import { timer } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-logout',
  templateUrl: './logout.component.html',
  imports: [UiButtonPillComponent],
  //imports: [UiButtonPillComponent],
})
export class LogoutComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  constructor() {}

  logout(){
    //TODO the logout can be faster than the bootstrap class destroy
    console.log("logout called but is it working?")
    timer(1000).subscribe(() => {
      this.auth.signOut();
      this.router.navigateByUrl('/');
    });
  }

  
}
