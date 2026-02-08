import { Component, computed, input, output } from '@angular/core';
import { CommonModule, NgClass } from '@angular/common';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'ui-button-pill',
  standalone: true,
  imports: [RouterLink, CommonModule, NgClass],
  styles: [`
    .ui-button-pill__content {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
    }

    .ui-button-pill__content img {
      width: 1.25rem;
      height: 1.25rem;
      object-fit: contain;
      flex-shrink: 0;
      border-radius: 0.25rem;
    }
  `],
  template: `
    <!-- link variant -->
    @if (componentType() === 'link') {
      <a
        [routerLink]="routerLink()"
        [queryParams]="queryParams()"
        [target]="target()"
        [ngClass]="btnClass()"
        (click)="onClick.emit($event)">
        <span class="ui-button-pill__content">
          <ng-content></ng-content>
        </span>
      </a>
    }
    
    <!-- href variant -->
    @if (componentType() === 'href') {
      <a
        [href]="href()"
        [target]="target()"
        [ngClass]="btnClass()"
        (click)="onClick.emit($event)">
        <span class="ui-button-pill__content">
          <ng-content></ng-content>
        </span>
      </a>
    }
    
    <!-- button variant -->
    @if (componentType() === 'button') {
      <button
        [attr.type]="type()"
        [disabled]="disabled()"
        [ngClass]="btnClass()"
        (click)="onClick.emit($event)">
        <span class="ui-button-pill__content">
          <ng-content></ng-content>
        </span>
      </button>
    }
    `
})
export class UiButtonPillComponent {
  color = input<'primary' | 'secondary' | 'transparent'>('primary');
  block = input(false);
  size = input<'small' | 'medium'>('medium')
  type = input<'button' | 'submit' | 'reset'>('button');
  routerLink = input<RouterLink['routerLink']>();
  queryParams = input<RouterLink['queryParams']>();
  href = input<string>();
  disabled = input(false);
  target = input<'_self' | '_blank' | '_parent' | '_top'>('_self');
  onClick = output<MouseEvent>();

  componentType = computed(() =>
    'button'
    //this.routerLink() ? 'link' : this.href() ? 'button' : 'button'
  );

  btnClass = computed(() => {
    const base = [
      'inline-flex', 'items-center', 'justify-center',
      'px-3', 'py-1.5', 'rounded-md',
      'text-sm', 'font-medium',
      'transition', 'duration-200', 'ease-in-out',
      'border',
      'focus:outline-none',
      'cursor-pointer',
      'focus:ring-2', 'focus:ring-offset-1',
      'focus:ring-[var(--color-ring)]',
      'focus:ring-opacity-60',
      this.block() ? 'w-full' : ''
    ];

    if (this.disabled()) {
      base.push('opacity-60', 'pointer-events-none');
    }

    switch (this.color()) {
      case 'primary':
        base.push(
          'bg-[var(--color-primary)]',
          // prefer surface/white for contrast; fall back to text if you have a token
          'text-[var(--color-surface)]',
          'border-[var(--color-primary)]',
          'hover:bg-[var(--color-primary-600)]'
        );
        break;

      case 'secondary':
        // outline primary
        base.push(
          'var(--color-surface)',
          'text-[var(--color-primary)]',
          'border-[var(--color-primary)]',
          'hover:bg-[var(--color-primary)]/10'
        );
        break;

      case 'transparent':
        // ghost / subtle
        base.push(
          'bg-transparent',
          'var(--color-text)',
          'border-[var(--color-border)]',
          'hover:bg-[var(--color-border)]/20'
        );
        break;
    }

    return base;
  });
}
