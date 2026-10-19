import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Translation, TranslocoLoader } from '@jsverse/transloco';
import { version as APP_VERSION } from '@pkg';

@Injectable({ providedIn: 'root' })
export class TranslocoHttpLoader implements TranslocoLoader {
  private readonly http = inject(HttpClient);

  /**
   * Fetches the translation file for a language from the bundled assets. The app's version goes in
   * its address, so that a release is never read with the file a browser kept from one before,
   * which lacks the words the new one added and shows their keys in their place.
   */
  getTranslation(lang: string) {
    return this.http.get<Translation>(`assets/i18n/${lang}.json?v=${encodeURIComponent(APP_VERSION)}`);
  }
}
