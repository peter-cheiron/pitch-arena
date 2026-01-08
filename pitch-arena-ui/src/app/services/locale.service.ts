import { effect, inject, Injectable, signal } from '@angular/core';
import { TranslateService, type LangChangeEvent } from '@ngx-translate/core';
import { LocaleStorageService } from './localeStorage';

@Injectable({
  providedIn: 'root',
})
export class LocaleService {
  private readonly isBrowser = typeof navigator !== 'undefined';
  locales: string[] = ['en', 'fr'];
  lang = signal<string | null>(null);
  private translate = inject(TranslateService);
  private storage = inject(LocaleStorageService);

  constructor() {
    this.translate.onLangChange.subscribe((event: LangChangeEvent) => {
      console.log(event.lang)
      this.lang.set(event.lang);
      this.storage.lang.set(event.lang);
    });

    effect(() => {
      this.translate.use(this.lang());
    });
  }

  init() {
    if (this.storage.lang()) {
      this.lang.set(this.storage.lang());
    } else if (this.isBrowser) {
      let detected = false;
      for (const language of navigator.languages) {
        const [r] = language.match(/([^-]*)/) ?? [];
        if (r && this.locales.includes(r)) {
          this.lang.set(r);
          detected = true;
          break;
        }
      }

      if (!detected) {
        this.lang.set(this.locales[0]);
      }
    } else {
      this.lang.set(this.locales[0]);
    }
  }

  /**
   * gets the translation direct.
   * @param key 
   * @param term 
   */
  getLocalisedVersion(key, term){
    this.translate.get(key).subscribe(translation => {
      term(translation);
    })
  }
}
