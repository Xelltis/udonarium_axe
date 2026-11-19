import { TestBed } from '@angular/core/testing';
import { SUPPORTED_LANGS } from '@axe/application/i18n/transloco.config';
import { layDictionaries } from '@axe/testing/transloco-testing';
import { TranslocoService } from '@jsverse/transloco';
import { firstValueFrom } from 'rxjs';

describe('the dictionaries every spec is given', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('stand as Transloco itself leaves them once it has loaded them', async () => {
    const transloco = TestBed.inject(TranslocoService);
    const kept = transloco as unknown as { cache: Map<string, unknown> };
    for (const lang of SUPPORTED_LANGS) {
      const given = transloco.getTranslation(lang);
      expect(Object.keys(given).length).toBeGreaterThan(1000);

      kept.cache.delete(lang);
      await firstValueFrom(transloco.load(lang));

      const loaded = transloco.getTranslation(lang);
      expect(loaded).not.toBe(given);
      expect(loaded).toEqual(given);
    }
  });

  it('are not laid again by a load, as a pipe in a template makes', async () => {
    const transloco = TestBed.inject(TranslocoService);
    for (const lang of SUPPORTED_LANGS) {
      const given = transloco.getTranslation(lang);

      expect(await firstValueFrom(transloco.load(lang))).toBe(given);
      expect(transloco.getTranslation(lang)).toBe(given);
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

  it('go in by the way the service offers where it keeps what it has loaded otherwise, and translate the same', () => {
    const transloco = TestBed.inject(TranslocoService);
    const inner = transloco as unknown as { translations: Map<string, unknown>; cache: unknown };
    const laid = transloco.getTranslation('en');
    const cache = inner.cache;
    try {
      inner.translations.clear();
      inner.cache = undefined;
      const offered = vi.spyOn(transloco, 'setTranslation');

      layDictionaries(transloco);

      expect(offered).toHaveBeenCalledTimes(SUPPORTED_LANGS.length);
      expect(transloco.getTranslation('en')).toEqual(laid);
      expect(transloco.translate('common.hiddenName')).toBe('？？？');
      expect(transloco.translate('common.hiddenName', {}, 'en')).toBe('???');
    } finally {
      inner.cache = cache;
    }
  });
});
