import { Component, inject, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UiMarkdownComponent } from '../markdown/ui-markdown/ui-markdown.component';
import { Blog, DbBlogService } from '../services/db-blog.service';
import { SeoService } from '#services/seo.service';


@Component({
  selector: 'app-blog',
  imports: [UiMarkdownComponent],
  standalone: true,
  templateUrl: './blog.component.html'
})
export class BlogComponent {

  seo = inject(SeoService)

  @Input() content = "";
    blogService = inject(DbBlogService)
    route = inject(ActivatedRoute)

  ngOnInit(){
      
    const id = this.route.snapshot.paramMap.get('id')
    this.blogService.getById(id).then(content => {
      this.content = content.content;
      this.seo.setSeo({
        title: content.title,
        description: content.description, 
        keywords: content.keywords
      })
    })
  

  }  


}
