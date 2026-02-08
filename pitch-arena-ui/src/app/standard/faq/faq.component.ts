import { Component,inject,OnInit } from '@angular/core';
import { trigger, state, style, transition, animate } from '@angular/animations';
import { SeoService } from '#services/seo.service';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { NgClass } from '@angular/common';

const FALLBACK_FAQ_TRANSLATION = {
  faq: {
    title: 'syndicai',
    seo: {
      title: 'syndicai the first ai powered digital syndic for ',
      description: '.',
    },
    items: [
      {
        question: 'What is this?',
        answer: 'Well if you read the home page you should have an idea ...',
      },
      {
        question: 'Can I try it?',
        answer:
          'Currently its only in alpha and being entered into a hackathon. If you are part of the jury then contact me, anyone else please leave a message and I will get back to you.',
      },
    ],
  },
};

@Component({
  standalone: true,
  selector: 'app-faq',
  imports: [TranslatePipe, NgClass],
  templateUrl: './faq.component.html',
  animations: [
    trigger('toggleHeight', [
      state('closed', style({ height: '0px', paddingTop: '0', paddingBottom: '0', opacity: 0 })),
      state('open', style({ height: '*', opacity: 1 })),
      transition('closed <=> open', animate('300ms ease-in-out')),
    ]),
  ],
})
export class FaqComponent implements OnInit{
  constructor(private seo: SeoService, private translate: TranslateService) {}

  faqs = [];

  ngOnInit() {
    this.ensureFaqTranslation();
    this.translate.get('faq.items').subscribe((items) => {
      this.faqs = items;
    });
    this.translate.get([
      'faq.seo.title',
      'faq.seo.description'
    ]).subscribe(translations => {
      this.seo.setSeo({
        title: translations['faq.seo.title'],
        description: translations['faq.seo.description'],
        canonical: '  ',
        ogTitle: translations['faq.seo.title'],
        ogDescription: translations['faq.seo.description']
      });
    });
  }

  toggleFaq(selectedFaq: any) {
    this.faqs.forEach(f => {
      f.open = f === selectedFaq ? !f.open : false;
    });
  }  

  private ensureFaqTranslation() {
    const lang = this.translate.currentLang || this.translate.defaultLang || 'en';
    const faqItems = this.translate.translations?.[lang]?.['faq']?.items;

    if (!Array.isArray(faqItems)) {
      this.translate.setTranslation(lang, FALLBACK_FAQ_TRANSLATION, true);
    }
  }
}
