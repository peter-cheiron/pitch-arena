import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';
import { SEO } from '#models/SEO';

@Injectable({
  providedIn: 'root'
})
export class DbSEOService  extends DbInstanceService<SEO> {

  constructor() { 
    super();
    this.collectionName = 'SEO';
  }
  
}
