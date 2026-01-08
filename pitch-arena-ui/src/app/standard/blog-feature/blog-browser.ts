import { Component, computed, effect, inject, ViewChild } from '@angular/core';
import { DbBlogService } from './services/db-blog.service';
import { AuthService } from '#services/auth';
import { UiBlogEditorComponent } from "./blog-editor/ui-blog-editor.component";


@Component({
  selector: 'blog-navigator',
  imports: [
    UiBlogEditorComponent
],
  template: `
    <div>
        <div class="flex">
            <div class="ml-4 mt-8 w-1/5">
              <p class="font-bold">Select a blog to edit</p>
              @for(b of blogs; track b.id){
                  <div (click)="blogSelected(b.id)" 
                  class='cursor-pointer p-2 text-sm'>{{b.title}}</div>
              }
            </div>
            <blog-editor #blogEditor class="w-full"></blog-editor>
        </div>
    </div>
  `,
  standalone: true
})
export class BlogBrowser {

  @ViewChild('blogEditor') blogEditor!: UiBlogEditorComponent;

    blogService = inject(DbBlogService);
    auth = inject(AuthService);
    user = computed(() => this.auth.user())

    blogs = []

    constructor(){
        effect(() => {
            if(this.user()){
                this.blogService.listDocsRealtime(docs => {
                    this.blogs = docs;
                })
            }
        })
    }

    blogSelected(id){
      this.blogEditor.open(id)
    }


}