import { Component, Input } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-hero',
  templateUrl: './ui-hero.component.html'
})
export class UiHeroComponent {

  @Input() title!: string;
  @Input() description!: string;
  @Input() image!: string;

}
