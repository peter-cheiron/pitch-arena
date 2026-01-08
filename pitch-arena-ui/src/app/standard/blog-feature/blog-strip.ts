import { Component, computed, effect, inject } from "@angular/core";
import { DbBlogService } from "./services/db-blog.service";
import { AuthService } from "#services/auth";
import { RouterLink } from "@angular/router";

@Component({
  selector: "blog-strip",
  imports: [ RouterLink],
  template: `
    <div class="mt-6 grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
      @for(p of blogs; track p){

      <article
        class="group rounded-2xl border bg-white shadow-sm hover:shadow transition overflow-hidden flex flex-col"
      >
        @if (p.image) {
        <img
          [src]="p.image"
          width="960"
          height="720"
          [alt]="p.title"
          class="h-40 w-full object-cover"
        />
        }
        <div class="p-5 flex flex-col gap-3">
          <h3
            class="text-lg font-semibold group-hover:text-blue-600 transition"
          >
            {{ p.title }}
          </h3>
          <p class="text-sm text-gray-600">{{ p.blurb }}</p>
          <div class="mt-1 flex flex-wrap gap-2">
            @for (t of p.tags; track t) {
            <span class="text-xs rounded-full border px-2 py-0.5 bg-gray-50">{{
              t
            }}</span>
            }
          </div>
          <div class="mt-2">
            <a
              class="text-sm text-blue-600 hover:underline"
              [routerLink]="['/blog', p.id]"
              >Read it →</a
            >
          </div>
        </div>
      </article>
      }
    </div>
  `,
  standalone: true,
})
export class BlogStrip {
  blogService = inject(DbBlogService);
  auth = inject(AuthService);
  user = computed(() => this.auth.user());
  blogs = [];

  constructor() {
    effect(() => {
      if (this.user()) {
        this.blogService.listDocsRealtime((docs) => {
          this.blogs = docs.filter(d => d.visible);
        });
      }
    });
  }
}
