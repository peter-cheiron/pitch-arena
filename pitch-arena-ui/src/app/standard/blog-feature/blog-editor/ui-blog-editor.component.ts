import { Component, computed, inject, Input } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { UiMarkdownComponent } from '../markdown/ui-markdown/ui-markdown.component';
import { UiMarkdownEditorComponent } from '../markdown/ui-markdown-editor/ui-markdown-editor.component';
import { UiTabComponent } from 'src/app/ui/ui-tab/ui-tab.component';
import { UiButtonPillComponent } from '#ui';
import { Blog, DbBlogService } from '../services/db-blog.service';
import { UiInputComponent } from '#ui';
import { UiTextAreaComponent } from '#ui';
import { UiImageComponent } from "src/app/ui/ui-image/ui-image.component";
import { ImageService } from '#services/image.service';
import { UiToggleButtonComponent } from "src/app/ui/ui-toggle-button/ui-toggle-button.component";
import { UIChips } from "src/app/ui/ui-chips/ui-chips.component";


@Component({
  selector: 'blog-editor',
  imports: [UiMarkdownComponent,
    UiMarkdownEditorComponent,
    UiTabComponent, UiButtonPillComponent, UiInputComponent, UiTextAreaComponent, UiImageComponent, UiToggleButtonComponent, UIChips],
  templateUrl: './ui-blog-editor.component.html',
  standalone: true
})
export class UiBlogEditorComponent {
  
    tabs = [
    { key: 'editor', label: 'Editor' },
    { key: 'preview', label: 'Preview' },
    { key: 'tile', label: 'Tile' },
  ]

  route = inject(ActivatedRoute)
  @Input() id;

  blogs = inject(DbBlogService)
  blog : Blog = {
    title: '',
    content: '',
    description: '', 
    visible: false,
    keywords: []
  };

  currentTab = "editor"
  blogService = inject(DbBlogService)
  imageService = inject(ImageService)

  visible = false;

  ngOnInit(){
    if(this.route.snapshot.paramMap.get("id")){
      this.id = this.route.snapshot.paramMap.get("id")
    }
  
    if(this.id){
      this.blogService.getById(this.id()).then(content => {
        this.blog = content;
        if(!this.blog.keywords){
          console.log("setting keywords to default")
          this.blog.keywords = [];
        }
        if(!this.blog.visible){
          this.blog.visible = false
        }
      })
    }
  }

  new(){
    this.blog = {
      title: "",
      description: "",
      content: "",
      visible: false, 
      keywords: []
    }
  }

  open(id){
    this.id = id
      this.blogService.getById(this.id).then(content => {
        this.blog = content;
        if(!this.blog.keywords){
          console.log("setting keywords to default")
          this.blog.keywords = [];
        }
        if(!this.blog.visible){
          this.blog.visible = false
        }
    })
  }

  getMarkdownContent(content){
    this.blog.content = content;
  }

  setTab(tab){
    this.currentTab = tab;
  }

  imageFile(image){
    if(image){
      //this.isLoading = true;
      this.imageService.handleFile(image, "blogs", imageURL => {
        console.log("is it working", imageURL)
        this.blog.image = imageURL;
        //this.imageUploaded.set(false);
       // this.isLoading = false;
      })
    }
  }

  save(){
    if(this.blog.id){
      this.blogService.update(this.blog.id, this.blog).then(done => {
        console.log("note updated")
      })
    }else{
      this.blogService.create(this.blog).then(done => {
      console.log("blog was saved", done)
      this.blog.id = done;
    })
    }
  }

}
