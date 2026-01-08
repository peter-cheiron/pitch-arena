import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'cleanText'
})
export class CleanTextPipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    return value
      .replace(/\t/g, ' ')       // tabs → spaces
      .replace(/\s{2,}/g, ' ')   // multiple spaces → one
      .replace(/\n{2,}/g, '\n')  // condense multiple newlines
      .trim();
  }
}
