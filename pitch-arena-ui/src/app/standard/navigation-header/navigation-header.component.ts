import { Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { RouterLink, Router, RouterModule } from '@angular/router';
import { AuthService } from '#services/auth';
import { DbUserService } from '#services/db';
import { Profile } from 'src/app/standard/user/models/profile';
import { UiIconUserComponent } from 'src/app/ui/ui-icon/ui-icon-user/ui-icon-user.component';
import { TranslatePipe } from '@ngx-translate/core';
import { LocaleService } from '../../services/locale.service';

@Component({
  standalone: true,
  selector: 'app-navigation-header',
  templateUrl: 'navigation-header.component.html',
  imports: [
    RouterLink,
    RouterModule,
    UiIconUserComponent,
    TranslatePipe,
  ],
})
export class NavigationHeaderComponent {
  tabMenu = [
  { textSymbol: 'header.home', path: '/', id: 10, children: []},
 // { textSymbol: 'header.arena', path: '/arena', id: 11, children: []} ,
  { textSymbol: 'header.faq', path: '/faq', id: 12, children: []} ,
  { textSymbol: 'header.contact', path: '/contact', id: 14 }
];

  loggedInMenu = [
  //{ textSymbol: 'header.dashboard', path: '/dashboard', id: 10, children: []},
     { textSymbol: 'header.arenas', path: '/arenas', id: 13, children: []} ,
   { textSymbol: 'header.arena', path: '/arena', id: 11, children: []} ,
   { textSymbol: 'header.lab', path: '/lab', id: 12, children: []} ,
  //{ textSymbol: 'header.locale', id: 1}
];

  dropdownMenu = [
    { textSymbol: 'header.profile',  path: '/profile',   id: 6 },
    { textSymbol: 'header.messages', path: '/messages',  id: 7 },
    { textSymbol: 'header.contact',  path: '/contact',             id: 8 },
    { textSymbol: 'header.logout',   path: '/logout',  id: 9 },

  ];

  router = inject(Router);
  auth = inject(AuthService);
  user = computed(() => this.auth.user());
  locale = inject(LocaleService);
  localeLabel = computed(() => (this.locale.lang() ?? '(en/fr)').toUpperCase());

  private profileService = inject(DbUserService);
  profile = signal<Profile | undefined>(undefined);

  unReadMessages = signal(false);
  unreadCount = signal(0);

  headerHidden = signal(false);
  private lastScrollY = 0;

  sidebarOpen = false;
  userMenuOpen = signal(false); // 👈 new popup state
  projectMenuOpen = signal(false); // 👈 new


  constructor() {
    effect(() => {
      if (this.auth.user()) {
        this.tabMenu = this.loggedInMenu;
        //this.dropdownMenu.push(...this.loggedInMenu)
        this.profileService.getById(this.auth.user().uid).then((p) => {
          this.profile.set(p);
          // unread messages logic can come back later
        });
      }
    });
  }

  switchLocale() {
    const locales = this.locale.locales;
    const current = this.locale.lang();
    const currentIndex = locales.indexOf(current ?? locales[0]);
    const next = locales[(currentIndex + 1) % locales.length] ?? locales[0];
    this.locale.lang.set(next);
  }

  logout() {
    // this.auth.signOut();
    this.router.navigateByUrl('/');
  }

  openSidebar() {
    this.sidebarOpen = true;
  }

  sidebarClose() {
    this.sidebarOpen = false;
  }

  // ...

  toggleUserMenu(event: MouseEvent) {
    event.stopPropagation();
    this.userMenuOpen.update(v => !v);
  }

  closeUserMenu() {
    this.userMenuOpen.set(false);
  }

  toggleProjectMenu(event: MouseEvent) {
    event.stopPropagation();
    this.projectMenuOpen.update(v => !v);
  }

  closeProjectMenu() {
    this.projectMenuOpen.set(false);
  }

  @HostListener('document:click')
  onDocumentClick() {
    this.closeUserMenu();
    this.closeProjectMenu();
  }

  @HostListener('window:scroll')
  onWindowScroll() {
    const currentY = window.scrollY || 0;
    if (currentY <= 0) {
      this.headerHidden.set(false);
    } else if (currentY > this.lastScrollY) {
      this.headerHidden.set(true);
    } else {
      this.headerHidden.set(false);
    }
    this.lastScrollY = currentY;
  }
}
