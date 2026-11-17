import { TestBed } from '@angular/core/testing';
import { SUPPORTED_LANGS } from '@axe/application/i18n/transloco.config';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

describe('the dictionaries every spec is given', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('stand as Transloco itself leaves them once it has loaded them', async () => {
    const transloco = TestBed.inject(TranslocoService);
    for (const lang of SUPPORTED_LANGS) {
      const given = transloco.getTranslation(lang);
      expect(Object.keys(given).length).toBeGreaterThan(1000);

      await firstValueFrom(transloco.load(lang));

      const loaded = transloco.getTranslation(lang);
      expect(loaded).not.toBe(given);
      expect(loaded).toEqual(given);
    }
  });

  it('are translated from before anything is loaded', () => {
    const transloco = TestBed.inject(TranslocoService);

    expect(transloco.translate('common.hiddenName')).toBe('？？？');
    expect(transloco.translate('common.hiddenName', {}, 'en')).toBe('???');
  });

  it('are left as they were by a spec that changes a string', () => {
    const before = TestBed.inject(TranslocoService).getTranslation('ja')['common.hiddenName'];
    TestBed.inject(TranslocoService).setTranslationKey('common.hiddenName', 'changed', { lang: 'ja' });
    expect(TestBed.inject(TranslocoService).translate('common.hiddenName')).toBe('changed');

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({});

    expect(TestBed.inject(TranslocoService).translate('common.hiddenName')).toBe(before);
  });
});
