import { Injectable } from '@angular/core';
import { DbInstanceService } from './db-instance.service';
import { Feedback } from '#models/feedback';

@Injectable({
  providedIn: 'root'
})
export class DbFeedbackService  extends DbInstanceService<Feedback> {

  constructor() { 
    super();
    this.collectionName = 'feedback';
  }
  
}
