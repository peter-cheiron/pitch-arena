import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-image-avatar',
  standalone: true,
  templateUrl: './ui-image-avatar.component.html'
})
export class UiImageAvatarComponent {

  @Input() url: any;
  @Input() size = "S";

  getSize(){
    if(this.size === 'L'){
      return "h-32 w-32"
    }else if(this.size === 'M'){
      return "h-20 w-20" 
    }else if(this.size === 'XS'){
      return "h-8 w-8"
      
    }else{
      return "h-12 w-12"
    }
  }

}
