
import { Component, Input, Output, EventEmitter, input } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  standalone: true,
  selector: 'ui-chips',
  templateUrl: './ui-chips.component.html',
  imports: [FormsModule]
})
//TODO fix to use styles from theme 
export class UIChips {
  @Input() suggestions: string[] = [];
  @Input() value: string[] = [];
  @Input() toSplit: string;
  @Output() valueChange = new EventEmitter<string[]>();
  
  required = input<string>();
  disabled = input<boolean>();
  label = input<string>();
  placeholder = input<string>('');
  id = input<string>();
  inputText = '';
  filteredSuggestions: string[] = [];

ngOnInit() {
  if (!Array.isArray(this.value)) {
    if (this.toSplit && this.toSplit.includes(',')) {
      this.value = this.toSplit.split(',').map(s => s.trim());
    } else if (this.toSplit) {
      this.value = [this.toSplit.trim()];
    } else {
      this.value = [];
    }
    this.valueChange.emit(this.value); // ensure parent gets the proper value
  }
}

  onInputChange() {
    this.filteredSuggestions = this.suggestions.filter(
      s => s.toLowerCase().includes(this.inputText.toLowerCase()) && !this.value.includes(s)
    );
  }

selectSuggestion(term: string) {
  const clean = term.trim();
  if (clean && !this.value.includes(clean)) {
    const updated = [...this.value, clean]; // ✅ create a new array
    this.valueChange.emit(updated);
  }
  this.inputText = '';
  this.filteredSuggestions = [];
}

removeChip(term: string) {
  const updated = this.value.filter(v => v !== term); // ✅ create a new array
  this.valueChange.emit(updated);
}
}