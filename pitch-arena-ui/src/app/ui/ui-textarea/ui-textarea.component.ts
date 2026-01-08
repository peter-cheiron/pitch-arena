import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { UiService } from '#services/ui.service';
import { NgClass } from '@angular/common';

@Component({
  standalone: true,
  selector: 'ui-textarea',
  templateUrl: './ui-textarea.component.html',
  imports: [FormsModule, NgClass],
})
export class UiTextAreaComponent extends UiService {
  @Input() value!: string | number;
  @Output() valueChange = new EventEmitter<string | number>();

  @Input() name: string = '';
  @Input() label: string = '';
  @Input() rows: string | number = 4;
  @Input() placeholder: string = '';
  @Input() disabled: boolean = false;
  @Input() required: string = '';
  @Input() hasBorder: boolean = true;
  id = this.getId();

   onValueChange(event: Event) {
    const input = (event.target as HTMLTextAreaElement).value;
    this.valueChange.emit(input);
  }
}
