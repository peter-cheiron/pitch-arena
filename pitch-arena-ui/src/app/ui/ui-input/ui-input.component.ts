import { Component, EventEmitter, input, model, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { UiService } from '#services/ui.service';

@Component({
  standalone: true,
  selector: 'ui-input',
  styleUrl: "./ui-input.css",
  templateUrl: './ui-input.component.html',
  imports: [FormsModule],
})
export class UiInputComponent {
  value = model<string | number | Date>(''); // <-- This replaces @Input + @Output
  inline = input<boolean>(true);
  type = input<'text' | 'number' | 'time' | 'date' | 'tel' | 'range' | 'password' | 'email' | 'url'>('text');
  name = input<string>();
  min = input<string | number>();
  max = input<string | number>();
  step = input<string | number>();
  label = input<string>();
  placeholder = input<string>('');
  disabled = input<boolean>();
  required = input<string>();
  pattern = input<string | RegExp>();
  private uiService = new UiService();
  id = this.uiService.getId();

  @Output() onEnter = new EventEmitter();

  emit(){
    this.onEnter.emit()
  }
}
