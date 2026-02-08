import { Injectable } from '@angular/core';
import { DbInstanceService } from '#services/db/db-instance.service';

export interface Blog {
  id?: string;
  title: string;
  content: string;
  description?: string;
  image?: string;
  visible: boolean;
  keywords: string[];
}

@Injectable({
  providedIn: 'root'
})
export class DbBlogService  extends DbInstanceService<Blog> {

  constructor() { 
    super();
    this.collectionName = 'blog';
  }

  
  
}
