import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';

export type Key = {
  value: string;
  id?: string;
}

@Injectable({
  providedIn: 'root'
})
export class DbKeyService  extends DbInstanceService<Key> {

  constructor() { 
    super();
    this.collectionName = 'keys';
  }
  
}
