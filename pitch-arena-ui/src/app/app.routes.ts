import { Routes } from '@angular/router';
import { LandingPageComponent } from './standard/landing-page/landing-page';
import { userRoutes } from './standard/user/user-routes';
import { contactRoutes } from './standard/contact/contactRoutes';
import { AuthGuard } from './auth.guard';
import { Arenas } from './features/pitch-arena/arenas/arenas';
import { FaqComponent } from './standard/faq/faq.component';
import { Terms } from './standard/terms/terms';
import { ArenaDetails } from './features/pitch-arena/arena-details/arena-details';
import { ArenaPage } from './features/pitch-arena/arena/arena-page';
import { Sorry } from './features/sorry/sorry';
import { ArenaAuthGuard } from './arena.guard';
import { Deck } from './features/pitch-arena/deck/deck';
import { ArenaDesigner } from './features/pitch-arena/arena-designer/arena-designer';
import { Lab } from './features/pitch-arena/lab/lab';
import { Pitches } from './features/pitch-arena/pitches/pitches';
import { CoachTest } from './features/pitch-arena/coach-test/coach-test';

export const routes: Routes = [
{ path: '', component: LandingPageComponent, pathMatch: 'full' },

//TODO replace with proper authgurad later ArenaAuthGuard
{ path: 'arena', component: ArenaPage, pathMatch: 'full', canActivate: [ArenaAuthGuard] },
{ path: 'arena/:path', component: ArenaPage, pathMatch: 'full', canActivate: [ArenaAuthGuard] },

//TODO think about the deckguard as we will have to parse
{ path: 'deck', component: Deck, pathMatch: 'full', canActivate: [ArenaAuthGuard] },
{ path: 'deck/:path', component: Deck, pathMatch: 'full', canActivate: [ArenaAuthGuard] },


{ path: 'arenas/:path', component: ArenaDetails, pathMatch: 'full', canActivate: [ArenaAuthGuard] },
{ path: 'arenas', component: Arenas, pathMatch: 'full', canActivate: [ArenaAuthGuard] },

{ path: 'designer', component: ArenaDesigner, pathMatch: 'full', canActivate: [ArenaAuthGuard] },

{ path: 'coach', component: CoachTest, pathMatch: 'full', canActivate: [ArenaAuthGuard] },
{ path: 'lab', component: Lab, pathMatch: 'full', canActivate: [ArenaAuthGuard] },
{ path: 'pitches', component: Pitches, pathMatch: 'full', canActivate: [ArenaAuthGuard] },

  ...userRoutes,
  ...contactRoutes,

  { path: 'faq', component: FaqComponent, pathMatch: 'full' },
  { path: 'terms', component: Terms, pathMatch: 'full' },
  { path: 'sorry', component: Sorry, pathMatch: 'full' },
  
];
