import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';
import { CMSObject } from '#models/cms';

@Injectable({
  providedIn: 'root'
})
export class DbCMSService  extends DbInstanceService<CMSObject> {

  constructor() { 
    super();
    this.collectionName = 'CMSContent';
  }
  
}
