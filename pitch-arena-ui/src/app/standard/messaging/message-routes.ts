import { Route } from "@angular/router";
import { MessagingComponent } from "./messaging.component";
import { AuthGuard } from "./auth.guard";

export const messageRoutes: Route[] = [
    { path: 'messages', component: MessagingComponent, pathMatch: 'full', canActivate: [AuthGuard]  },
]