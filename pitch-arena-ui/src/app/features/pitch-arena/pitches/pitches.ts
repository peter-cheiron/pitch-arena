import { AuthService } from '#services/auth';
import { DbPitchService, Pitch } from '#services/db/db-pitch.service';
import { Component, computed, effect, inject, signal } from '@angular/core';
import { UiTabComponent } from "src/app/ui/ui-tab/ui-tab.component";
import { UiButtonPillComponent, UiInputComponent, UiTextAreaComponent } from "#ui";
import { UiMarkdownComponent } from "src/app/standard/blog-feature/markdown/ui-markdown/ui-markdown.component";
import { UiImageComponent } from "src/app/ui/ui-image/ui-image.component";
import { UiMarkdownEditorComponent } from "src/app/standard/blog-feature/markdown/ui-markdown-editor/ui-markdown-editor.component";
import { UIChips } from "src/app/ui/ui-chips/ui-chips.component";

@Component({
  selector: 'app-pitches',
  imports: [UiTabComponent, UiButtonPillComponent, UiMarkdownComponent, UiInputComponent, UiTextAreaComponent, 
    UiImageComponent, UiMarkdownEditorComponent, UIChips],
  templateUrl: './pitches.html',
  standalone: true
})
export class Pitches {

  pitchService = inject(DbPitchService);
  pitches = signal<Pitch[]>([]);

  auth = inject(AuthService);
  user = computed(() => this.auth.user())

  currentTab = "editor"
    tabs = [
    { key: 'editor', label: 'Editor' },
    { key: 'preview', label: 'Preview' },
    { key: 'tile', label: 'Tile' },
  ]

  pitch: Pitch = {
    title: "",
    description: "",
    tags: [],
    image: "",
    content: ""
  }

  unsubscribe;

  constructor(){
    effect(() => {
      if(this.user()){
        const id = this.user().uid;
        //TODO add user id as constraint
        this.unsubscribe = this.pitchService.listDocsRealtime(
          (docs) => this.pitches.set(docs)
        )
      }
    })
  }

  destroy(){
    console.log("destry called")
    this.unsubscribe();
    this.unsubscribe = null;
  }

  save(){
    if(this.pitch.id){
      //update
      this.pitchService.update(this.pitch.id, this.pitch).then(done => {
        console.log("updated")
      })
    }else{
      //Create
      this.pitchService.create(this.pitch).then(id => {
        this.pitch.id = id;
      })
    }
  }

  new(){
    this.pitch = {
      title: "",
      description: "",
      tags: [],
      image: "",
      content: ""
    }
  }

  imageFile(event){

  }

  pitchSelected(id){
    this.pitchService.getById(id).then(pitch => {
      this.pitch = pitch
    })
  }

}
