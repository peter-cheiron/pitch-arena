import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';

export type Pitch = {
  userId?: string;
  content: string;
  id?: string;
  tags?: string[];
  title: "",
  description?: "",
  image?: "",

}

@Injectable({
  providedIn: 'root'
})
export class DbPitchService  extends DbInstanceService<Pitch> {

  constructor() { 
    super();
    this.collectionName = 'pitches';
  }
  
}
