import { Injectable, signal } from '@angular/core';

/*
 This service guarantees that unique IDs are generated for each UI component.  
*/
@Injectable({ providedIn: 'root' })
export class UiService {
  private i = signal(0);
  getId() {
    const id = `syndicfr-${this.i()}`;
    this.i.update((v) => v + 1);
    return id;
  }
}
