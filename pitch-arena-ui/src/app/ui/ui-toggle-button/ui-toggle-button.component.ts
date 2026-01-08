import { NgClass, NgStyle } from "@angular/common";
import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "ui-toggle-button",
  standalone: true,
  templateUrl: "./ui-toggle-button.component.html",
  //imports: [NgStyle, NgClass], //TODO return to tailwind here
})
export class UiToggleButtonComponent {
  @Input() label?: string;
  @Input() selected = false;
  @Output() selectedChange = new EventEmitter<boolean>();

  onToggle(e: Event) {
    const next = (e.target as HTMLInputElement).checked;
    this.selected = next; // keep local in sync
    this.selectedChange.emit(next); // let parent know
  }
}
