import { Component, effect, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '#services/auth';

import {
  UiButtonPillComponent
} from '#ui';
import { TranslatePipe } from '@ngx-translate/core';
import { UiInputComponent } from 'src/app/ui/ui-input/ui-input.component';
import { UiIconGoogleComponent } from "src/app/ui/ui-icon/ui-icon-google/ui-icon-google.component";


@Component({
  standalone: true,
  selector: 'app-login-page',
  templateUrl: './login-page.component.html',
  imports: [
    RouterLink,
    UiInputComponent,
    UiButtonPillComponent,
    TranslatePipe,
    UiIconGoogleComponent,
],
})
export class LoginPageComponent implements OnInit {
  auth = inject(AuthService);
  viewMode = signal<'email-password' | 'forgot-password' | 'forgot-password-email-send' | null>(null);
  email = "";
  password = "";
  loading = signal(false);
  error = signal(false);
  returnUrl = '/arena';

  constructor(private route: ActivatedRoute, private router: Router) {
    effect(() => {
      this.viewMode(); // watch trigger
      this.error.set(null);
      this.email = "";
      this.password = "";
      this.loading.set(false);
    });
  }

  ngOnInit() {
    this.route.queryParams.subscribe((params) => {
      if (params['returnUrl']) {
        this.returnUrl = decodeURIComponent(params['returnUrl']);
      }
    });
  }

  async signInWithEmailAndPassword(e: Event) {
    e.preventDefault();
    if (this.loading()) return;
    this.error.set(false);
    this.loading.set(true);
    
    try {
      await this.auth.signInWithEmailAndPassword(this.email, this.password);
      console.log('redirecting to url : ',this.returnUrl)
      this.router.navigateByUrl(this.returnUrl);
    } catch {
      this.error.set(true);
      this.loading.set(false);
    }
  }

  async sendPasswordResetEmail(e: Event) {
    e.preventDefault();
    if (this.loading()) return;
    this.loading.set(true);
    await this.auth.sendPasswordResetEmail(this.email);
    this.viewMode.set('forgot-password-email-send');
  }
}
