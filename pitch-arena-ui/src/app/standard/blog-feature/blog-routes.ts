import { Routes } from "@angular/router";
import { BlogComponent } from "./blog/blog.component";
import { BlogBrowser } from "./blog-browser";
import { BlogStrip } from "./blog-strip";

export const blogRoutes: Routes = [
      { path: 'blog/:id', component: BlogComponent, pathMatch: 'full' },//works
      { path: 'blog-editor', component: BlogBrowser, pathMatch: 'full' },
      { path: 'blog-strip', component: BlogStrip, pathMatch: 'full' },
]