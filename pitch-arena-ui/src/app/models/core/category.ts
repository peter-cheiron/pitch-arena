export interface Category {
    id?: string;
    title?: string;
    description?: string;
    references: string[];//these are the 
    parentId: string; //a category is owned
  }
  