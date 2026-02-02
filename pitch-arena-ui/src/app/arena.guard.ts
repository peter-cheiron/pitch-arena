import { Injectable, computed, inject } from '@angular/core';
import {
  CanActivate,
  Router,
  type ActivatedRouteSnapshot,
  type RouterStateSnapshot,
} from '@angular/router';

import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { DbKeyService } from '#services/db/db-key.service';
import { where } from '@angular/fire/firestore';

@Injectable({
  providedIn: 'root',
})
export class ArenaAuthGuard implements CanActivate {
  private auth = inject(AuthService);
  private router = inject(Router);
  private profileService = inject(DbUserService);
  private keyService = inject(DbKeyService);

  user = computed(() => this.auth.user());
  async canActivate(route: ActivatedRouteSnapshot, state: RouterStateSnapshot) {
    const user = this.user();
    if (!user) {
      return this.router.createUrlTree(['/login'], {
        queryParamsHandling: 'merge',
        queryParams: { returnUrl: state.url },
      });
    }

    const isArena = state.url.includes('/arena');

    if (!isArena) return true;

    const profile = await this.profileService.getById(user.uid);
    const key = String(profile?.demoAccessKey ?? '').trim();
    if (!key) return this.router.createUrlTree(['/sorry']);

    const keys = await this.keyService.runQuery({
      where: where('value', '==', key),
    });

    if (keys?.length > 0) return true;

    return this.router.createUrlTree(['/sorry']);
  }
}
