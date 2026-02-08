import { NgClass } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';

@Component({
  standalone: true,
  selector: 'ui-tab-section',
  templateUrl: './ui-tab.component.html',
  imports: [NgClass]
})
export class UiTabComponent {
  @Input()  activeTab: string;
  @Output() activeTabChange = new EventEmitter<string>();

  @Output() tabChanged = new EventEmitter<string>();
  @Input() tabs;
  @Input() showExtras = false;




  /*
  tabs = [
    { key: 'reference', label: 'Reference' },
    { key: 'collections', label: 'Collections' },
    { key: 'wishes', label: 'Wishes' },
    { key: 'microbrands', label: 'Microbrands' },
    { key: 'offers', label: 'Offers' },
    { key: 'brands', label: 'Brands' },
  ];
  */

  selectTab(tabKey: string) {
    this.activeTab = tabKey;
    this.tabChanged.emit(tabKey);
    this.activeTabChange.emit(tabKey)
  }
}
