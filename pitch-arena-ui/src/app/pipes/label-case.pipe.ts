import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'labelCase',
  standalone: true
})
export class LabelCasePipe implements PipeTransform {
  transform(value: string): string {
    if (!value) return '';
    // Insert space before all caps and capitalize the first letter
    const result = value
      .replace(/([a-z])([A-Z])/g, '$1 $2')     // "caseColor" -> "case Color"
      .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2') // "URLValue" -> "URL Value"
      .replace(/^./, str => str.toUpperCase()); // Capitalize first letter
    return result;
  }
}
