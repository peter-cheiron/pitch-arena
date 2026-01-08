import { CommonModule } from '@angular/common';
import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  standalone: true,
  selector: 'app-footer',
  templateUrl: './footer.component.html',
  imports: [CommonModule, RouterLink]
})
export class FooterComponent {

  protected readonly footerLinks = [
    { label: 'Contact Us', route: '/contact', href: "" },
    { label: 'FAQ', route: '/faq', href: "" },
    { label: 'Terms', route: '/terms', href: "" },
    { label: 'Privacy', route: '/privacy', href: "" }
  ];

  protected readonly socialLinks = [
    {
      label: '@X',
      href: 'https://x.com',
      icon: {
        viewBox: '0 0 1200 1227',
        path: 'M1200 0L745.458 558.157 1200 1227H963.284L610.701 726.43 205.545 1227H0L482.392 626.731 0 0h244.63l321.452 452.469L960.233 0H1200Z'
      }
    },
    {
      label: '@Instagram',
      href: 'https://instagram.com',
      icon: {
        viewBox: '0 0 24 24',
        path: 'M7.75 2A5.75 5.75 0 0 0 2 7.75v8.5A5.75 5.75 0 0 0 7.75 22h8.5A5.75 5.75 0 0 0 22 16.25v-8.5A5.75 5.75 0 0 0 16.25 2h-8.5Zm0 1.5h8.5A4.25 4.25 0 0 1 20.5 7.75v8.5a4.25 4.25 0 0 1-4.25 4.25h-8.5A4.25 4.25 0 0 1 3.5 16.25v-8.5A4.25 4.25 0 0 1 7.75 3.5Zm8.625 2a.875.875 0 1 0 0 1.75.875.875 0 0 0 0-1.75ZM12 7.25a4.75 4.75 0 1 0 0 9.5 4.75 4.75 0 0 0 0-9.5Zm0 1.5a3.25 3.25 0 1 1 0 6.5 3.25 3.25 0 0 1 0-6.5Z'
      }
    }
  ];
}
