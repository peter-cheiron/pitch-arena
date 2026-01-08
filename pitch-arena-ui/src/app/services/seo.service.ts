import { Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';

@Injectable({
  providedIn: 'root'
})
export class SeoService {

  constructor(private title: Title, private meta: Meta) {
    
  }

  /**
   * What do all of these mean and are they needed all of the time?
   * @param options 
   */
  setSeo(options: {
    title: string;
    description: string;
    canonical?: string;
    ogTitle?: string;
    ogDescription?: string;
    ogImage?:string;
    keywords?: string[];
  }) {
    this.title.setTitle(options.title);

    this.meta.updateTag({ name: 'description', content: options.description });
    if (options.ogImage) {
      this.meta.updateTag({ property: 'og:image', content: options.ogImage });
    }
    if(options.keywords){
      this.meta.updateTag({ property: 'keywords', content: options.keywords.join(', ') });
    }
    
    this.meta.updateTag({ name: 'og:image', content: options.ogImage });
    this.meta.updateTag({ property: 'og:logo', content: options.ogImage });
    // Open Graph & Twitter tags
    this.meta.updateTag({ property: 'og:title', content: options.ogTitle || options.title });
    this.meta.updateTag({ name: 'twitter:title',content: options.ogTitle || options.title });
    this.meta.updateTag({ property: 'og:description', content: options.ogDescription || options.description });
    this.meta.updateTag({ name: 'twitter:description', content: options.ogDescription || options.description });
    if (options.ogImage) {
     
      this.meta.updateTag({ name: 'twitter:image',content: options.ogImage })
    }
    // Optionally add canonical link
    if (options.canonical) {
      this.setCanonicalUrl(options.canonical);
    }
  }

  private setCanonicalUrl(url: string) {
    let link: HTMLLinkElement = document.querySelector("link[rel='canonical']") || document.createElement('link');
    link.setAttribute('rel', 'canonical');
    link.setAttribute('href', url);
    if (!link.parentNode) {
      document.head.appendChild(link);
    }
  }
}
