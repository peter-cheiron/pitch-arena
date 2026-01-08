import { inject, Injectable, signal, effect, PLATFORM_ID } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

import {
  Auth,
  signInWithPopup,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  GoogleAuthProvider,
  onAuthStateChanged,
  signOut,
  type User,
  createUserWithEmailAndPassword,
} from '@angular/fire/auth';
import { DbUserService } from '#services/db';
import { isPlatformBrowser } from '@angular/common';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  user = signal<User | null>(null);
  private returnUrl = signal<string | null>(null);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  //private auth = inject(Auth);
  private userService = inject(DbUserService);

  private platformId = inject(PLATFORM_ID);
  private isBrowser = isPlatformBrowser(this.platformId);
  private auth = this.isBrowser ? inject(Auth, { optional: true }) : null;

  constructor() {
    if (this.auth) {
      onAuthStateChanged(this.auth, (user) => {
        this.user.set(user);
      });
    }

    effect(() => {
      this.route.queryParamMap.subscribe((query) => {
        this.returnUrl.set(query.get('returnUrl') ?? null);
      });
    });
  }

  async handleRedirect() {
    console.log("trying redirect", this.returnUrl())
    const path = this.returnUrl() ? this.returnUrl() : '/';
    await this.router.navigateByUrl(path);
    /*
    await this.router.navigate(path.split('/').slice(1), {
      replaceUrl: true,
      queryParamsHandling: 'merge',
      queryParams: { returnUrl: undefined },
    });*/
  }

  authStateReady() {
    return this.auth.authStateReady();
  }

  async signInWithGoogle() {
    await signInWithPopup(this.auth, new GoogleAuthProvider());
    const exists = await this.userService.exists(this.user().email);
    if (!exists) {
      //here it has to be by id not email TODO change the name of the function
      await this.userService.createWithCustomid({
        profileImage: this.user().photoURL,
        email: this.user().email,
        displayName: this.user().displayName,
        firstName: this.user().displayName
      });
    }
    await this.handleRedirect();
  }

  async signUpWithEmail(email, password, displayName) {
    await createUserWithEmailAndPassword(this.auth, email, password);
    const exists = await this.userService.exists(this.user().email);
    if (!exists) {
      //here it has to be by id not email TODO change the name of the function
      await this.userService.createWithCustomid({
        profileImage: "",
        email: this.user().email,
        displayName: displayName,
      });
    }
    await this.handleRedirect();
  }

  async signInWithEmailAndPassword(email: string, password: string) {
    await signInWithEmailAndPassword(this.auth, email, password);
    await this.handleRedirect();
  }

  // https://cloud.google.com/identity-platform/docs/admin/email-enumeration-protection?hl=fr
  async sendPasswordResetEmail(email: string) {
    await sendPasswordResetEmail(this.auth, email);
  }

  async signOut() {
    await signOut(this.auth);
  }
}
