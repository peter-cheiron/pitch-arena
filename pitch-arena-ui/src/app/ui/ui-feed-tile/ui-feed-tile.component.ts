import { Location } from "#models/core/location";
import { CommonModule, NgClass } from "@angular/common";
import { Component, EventEmitter, Input, OnInit, Output } from "@angular/core";

@Component({
  selector: "ui-feed-tile",
  templateUrl: "./ui-feed-tile.component.html",
  standalone: true,
  imports: [NgClass, CommonModule],
})
export class UiFeedTileComponent implements OnInit {
  @Input() commentCount: number;
  @Input() type: string;
  @Input() image!: string;
  @Input() title!: string;
  @Input() description!: string;
  @Input() metadata!: any;
  @Input() location!: Location;
  @Input() url!: string;
  @Input() userName!: string;
  @Input() selected: boolean = false;
  @Input() lastDate!: Date;
  @Input() item!: any;
  @Output() fireEvent = new EventEmitter();

  selectedItem;

  zoomedImage: string | null = null;

  ngOnInit() {
    if (!this.lastDate && this.item) {
      if (this.item.updatedAt) {
        this.lastDate = this.item.updatedAt.toDate();
      } else {
        this.lastDate = this.item.createdAt.toDate();
      }
    }
  }
  event(type) {
    this.fireEvent.emit({
      type: type,
      item: this.item,
    });
  }

  openZoom(imageUrl: string) {
    this.zoomedImage = imageUrl;
  }

  closeZoom() {
    this.zoomedImage = null;
  }

  getValuesToDisplay():any {
    const EXCLUDED = new Set(['Title', 'Description', 'title', 'description']);
    const md = this.metadata ?? {};
    return Object.keys(md).filter(k => !EXCLUDED.has(k));
  }

  getValue(key){
    const value = this.metadata?.[key];
    if (value === null || value === undefined) {
      return '';
    }

    if (Array.isArray(value)) {
      return value
        .map((v) => (v === null || v === undefined ? '' : String(v)))
        .filter(Boolean)
        .join(', ');
    }

    if (typeof value === 'object') {
      const entries = Object.entries(value)
        .map(([k, v]) => [k, v === null || v === undefined ? '' : String(v)]);
      const formatted = entries
        .filter(([, v]) => Boolean(v))
        .map(([k, v]) => `${this.formatKey(k)}: ${v}`)
        .join(', ');
      return formatted || '[details available]';
    }

    if (typeof value === 'boolean') {
      return value ? 'Yes' : 'No';
    }

    return String(value);
  }

  formatKey(key: string): string {
    // Convert camelCase to "Title Case"
    return key
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (str) => str.toUpperCase());
  }
}
