import { Routes } from '@angular/router';
import { LandingPageComponent } from './standard/landing-page/landing-page';
import { PitchArenaTv } from './features/pitch-arena-tv/pitch-arena-tv';
import { userRoutes } from './standard/user/user-routes';
import { contactRoutes } from './standard/contact/contactRoutes';
import { AuthGuard } from './standard/user/auth.guard';
import { PitchArena } from './features/pitch-arena/pitch-arena';

export const routes: Routes = [
{ path: '', component: LandingPageComponent, pathMatch: 'full' },
{ path: 'arena', component: PitchArena, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arena2', component: PitchArena, pathMatch: 'full', canActivate: [AuthGuard] },

  ...userRoutes,
  ...contactRoutes,
];
