
import { Component, Input } from '@angular/core';

@Component({
  selector: 'ui-icon-multi-svg',
  standalone: true,
  templateUrl: './ui-icon-multi-svg.component.html',
  imports: []
})
export class UiIconMultiSvgComponent {

  @Input() type: string = "social";

  //TODO theme the svg icons so that you can reverse them etc
  @Input() theme: string = "primary";

  getClass(){
    return this.theme === 'secondary'
      ? 'fill-[var(--color-accent,#22c55e)]'
      : 'fill-[var(--color-primary,#10b981)]';
  }

  getText(){
    return this.theme === 'secondary'
      ? 'fill-[var(--color-text,#1f2937)]'
      : 'fill-[var(--color-surface,#ffffff)]';
  }

}
