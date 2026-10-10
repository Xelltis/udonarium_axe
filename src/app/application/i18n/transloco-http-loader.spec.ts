import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { TranslocoHttpLoader } from '@axe/application/i18n/transloco-http-loader';
import { firstValueFrom } from 'rxjs';

describe('TranslocoHttpLoader', () => {
  let http: HttpTestingController;
  let loader: TranslocoHttpLoader;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    loader = TestBed.inject(TranslocoHttpLoader);
  });

  afterEach(() => http.verify());

  it('fetches a language’s translations from the bundled assets', async () => {
    const loaded = firstValueFrom(loader.getTranslation('ja'));

    const request = http.expectOne('assets/i18n/ja.json');
    expect(request.request.method).toBe('GET');
    request.flush({ common: { button: { close: '閉じる' } } });

    expect(await loaded).toEqual({ common: { button: { close: '閉じる' } } });
  });

  it('asks for the file named after the language it is given', () => {
    void firstValueFrom(loader.getTranslation('ko')).catch(() => undefined);

    http.expectOne('assets/i18n/ko.json').flush({});
  });
});
