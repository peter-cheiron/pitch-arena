import { Component, computed, effect, HostListener, inject, Input, signal } from '@angular/core';
import { Profile } from '../models/profile';
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { FormsModule } from '@angular/forms';

import { UiInputComponent } from 'src/app/ui/ui-input/ui-input.component';
import { UiTextAreaComponent } from '#ui';


@Component({
  standalone: true,
  selector: 'user-profile',
  templateUrl: './profile.component.html',
  imports: [
    FormsModule,
    
    UiInputComponent,
    UiTextAreaComponent
],
})
export class ProfileComponent {

  role = ""

  activeSection = 'profile';

  editMode = false;

  profileImage: string | ArrayBuffer | null = '../../assets/upload-profile.jpg';
  file = undefined;
  openDialog = signal<boolean>(false);

  collection;
  collectionParent; //the object itself

    private auth = inject(AuthService);
    private profileService = inject(DbUserService);
    

    profile: Profile = {
      firstName: '',
      lastName: '',
      displayName: '',
      email: '',
      about: '',
      roles: [],
      userId: ''
    };
    

  @Input() canEdit = true;
  @Input() promotionalContent = true;

  user = computed(() => this.auth.user());

  tabs = [
    { key: 'contact', label: 'Contact' },
    { key: 'page', label: 'Page' },
    { key: 'messages', label: 'Messages' },
  ];

  constructor() {
      effect(() => {
        if(this.auth.user()){
          this.profileService.getById(this.auth.user().uid).then(p => {
            this.profile = p;
          })
        }
      })
  }
  
  activateSection(tab){
    this.activeSection = tab;
  }

  doSavePerhaps(){
    if(this.editMode){
      this.profileService.update(this.profile.userId, this.profile).then(result => {
        console.log("profile should be updated.")
      })
    }
    this.editMode = !this.editMode
  }

  closeDialog() {
    this.openDialog.set(false);
  }

  isMobile: boolean = window.innerWidth < 768; // Default check on load

  @HostListener('window:resize')
  onResize() {
    this.isMobile = window.innerWidth < 768;
  }
}
