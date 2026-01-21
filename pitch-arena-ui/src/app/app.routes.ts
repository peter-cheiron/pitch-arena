import { Routes } from '@angular/router';
import { LandingPageComponent } from './standard/landing-page/landing-page';
import { userRoutes } from './standard/user/user-routes';
import { contactRoutes } from './standard/contact/contactRoutes';
import { AuthGuard } from './standard/user/auth.guard';
import { Arenas } from './features/pitch-arena/arenas/arenas';
import { FaqComponent } from './standard/faq/faq.component';
import { Terms } from './standard/terms/terms';
import { ArenaPage } from './features/pitch-arena/chat/arena-page';
import { ArenaDetails } from './features/pitch-arena/arena-details/arena-details';

export const routes: Routes = [
{ path: '', component: LandingPageComponent, pathMatch: 'full' },
{ path: 'arena', component: ArenaPage, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arena/:path', component: ArenaPage, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arenas/:path', component: ArenaDetails, pathMatch: 'full', canActivate: [AuthGuard] },
{ path: 'arenas', component: Arenas, pathMatch: 'full', canActivate: [AuthGuard] },

  ...userRoutes,
  ...contactRoutes,

  { path: 'faq', component: FaqComponent, pathMatch: 'full' },
  { path: 'terms', component: Terms, pathMatch: 'full' },
  
];
