import { Injectable, inject } from '@angular/core';
import {
  CanActivate,
  Router,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { AuthService } from '#services/auth';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);

  async canActivate(_: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    await this.auth.authStateReady();

    const user = await this.auth.user();

    if (user) return true;
    this.router.navigate(['login'], {
      queryParamsHandling: 'merge',
      queryParams: { returnUrl: state.url },
    });

    return false;
  }
}
