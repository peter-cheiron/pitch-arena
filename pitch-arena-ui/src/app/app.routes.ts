import { Routes } from '@angular/router';
import { LandingPageComponent } from './standard/landing-page/landing-page';
import { userRoutes } from './standard/user/user-routes';
import { contactRoutes } from './standard/contact/contactRoutes';
import { AuthGuard } from './standard/user/auth.guard';
import { PitchArena } from './features/pitch-arena/pitch-arena';
import { PitchArenaLabComponent } from './features/pitch-arena/lab/pitch-arena-lab';
import { Arenas } from './features/pitch-arena/arenas/arenas';
import { FaqComponent } from './standard/faq/faq.component';
import { Terms } from './standard/terms/terms';

export const routes: Routes = [
{ path: '', component: LandingPageComponent, pathMatch: 'full' },
{ path: 'arena', component: PitchArena, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arena/:path', component: PitchArena, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arenas', component: Arenas, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'lab', component: PitchArenaLabComponent, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'lab/:path', component: PitchArenaLabComponent, pathMatch: 'full', canActivate: [AuthGuard] },

  ...userRoutes,
  ...contactRoutes,

  { path: 'faq', component: FaqComponent, pathMatch: 'full' },
  { path: 'terms', component: Terms, pathMatch: 'full' },
  
];
