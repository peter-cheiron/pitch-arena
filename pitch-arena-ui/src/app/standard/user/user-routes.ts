import { Route } from "@angular/router";
import { LoginPageComponent } from "./login/login-page.component";
import { LogoutComponent } from "./logout/logout.component";
import { SignupEmailPageComponent } from "./signup-email-page/signup-email-page.component";
import { ProfileComponent } from "./profile/profile.component";

export const userRoutes: Route[] = [

  { path: 'login', component: LoginPageComponent, pathMatch: 'full' },
  { path: 'logout', component: LogoutComponent, pathMatch: 'full' },
  { path: 'signup-email', component: SignupEmailPageComponent, pathMatch: 'full' },
  { path: 'profile', component: ProfileComponent, pathMatch: 'full' },
]
