import { Route } from "@angular/router";
import { ContactUsComponent } from "./contact-us.component";

export const contactRoutes: Route[] = [

  { path: 'contact', component: ContactUsComponent, pathMatch: 'full' },
  { path: 'contact?', component: ContactUsComponent, pathMatch: 'full' },
]
