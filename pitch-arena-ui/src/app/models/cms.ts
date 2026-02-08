/*
What is the story here? 
The idea is that I will add a small cms type of data structure so 
that I don't need to create new objects and services all the time. 
Q: is it worth the effort? 
A: perhaps ... its to make a small test for SSR really
*/

export interface CMSField{
  id: string;
  name: string;
  description?: string;
  type: "string" | "date" | "number" | "boolean";
  value: string
}

export interface CMSObject {
    id?: string;
    title?: string;
    image?: string;
    images?: string[];
    description?: string;
    content?: any;
    fields: CMSField
  }
  