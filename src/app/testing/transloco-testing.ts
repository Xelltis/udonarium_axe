import { EnvironmentProviders, importProvidersFrom, inject, provideAppInitializer, Provider } from '@angular/core';
import { TranslateFn } from '@axe/application/i18n/translate.token';
import { SUPPORTED_LANGS, SupportedLang } from '@axe/application/i18n/transloco.config';
import { Translation, TranslocoService, TranslocoTestingModule } from '@jsverse/transloco';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { Observable, of } from 'rxjs';

const jaDict = JSON.parse(readFileSync(resolve(process.cwd(), 'src/assets/i18n/ja.json'), 'utf-8')) as Translation;
const enDict = JSON.parse(readFileSync(resolve(process.cwd(), 'src/assets/i18n/en.json'), 'utf-8')) as Translation;
const koDict = JSON.parse(readFileSync(resolve(process.cwd(), 'src/assets/i18n/ko.json'), 'utf-8')) as Translation;

const dictionaries: Record<SupportedLang, Translation> = { ja: jaDict, en: enDict, ko: koDict };

/**
 * A dictionary as Transloco keeps one: every string under the keys that lead to it, joined by dots.
 */
function flattened(dictionary: Translation): Translation {
  const flat: Translation = {};
  const lay = (value: unknown, key: string): void => {
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      for (const [name, inner] of Object.entries(value)) lay(inner, key ? `${key}.${name}` : name);
    } else {
      flat[key] = value;
    }
  };
  lay(dictionary, '');
  return flat;
}

/**
 * The dictionaries laid flat once, for every module a spec builds to share. Loading them through
 * Transloco lays each flat and copies it again for every module, some twenty thousand strings a
 * module, which took longer than most specs' own work; so they are put where the service keeps what
 * it has loaded, and where it keeps each load it has made, as they would stand once loaded: read
 * at once or through a load, as a pipe in a template reads, a dictionary is never laid again. The
 * service copies a dictionary before it changes one, and these are frozen, so no spec can change them
 * for the next.
 */
const flatDictionaries: Record<SupportedLang, Translation> = {
  ja: Object.freeze(flattened(jaDict)),
  en: Object.freeze(flattened(enDict)),
  ko: Object.freeze(flattened(koDict)),
};

/**
 * Lays the dictionaries in a Transloco service as loaded. Where the service keeps what it has loaded
 * and the loads it has made as this was written for, in two maps, they are put there as they stand,
 * which costs nothing. Those are the service's own to keep and may change with a new version of it:
 * where either is not such a map, the dictionaries go in by the way the service offers for it, slower
 * and good whatever it keeps inside. `transloco-testing.spec.ts` holds both ways to translating alike.
 */
export function layDictionaries(service: TranslocoService): void {
  const inner = service as unknown as { translations?: unknown; cache?: unknown };
  const kept = inner.translations instanceof Map && inner.cache instanceof Map ? (inner as Kept) : null;
  for (const lang of SUPPORTED_LANGS) {
    if (kept) {
      kept.translations.set(lang, flatDictionaries[lang]);
      kept.cache.set(lang, of(flatDictionaries[lang]));
    } else {
      service.setTranslation(dictionaries[lang], lang, { emitChange: false });
    }
  }
}

/** Where a Transloco service keeps what it has loaded, and the loads it has made, each by language. */
interface Kept {
  readonly translations: Map<string, Translation>;
  readonly cache: Map<string, Observable<Translation>>;
}

export function provideTranslocoTesting(): (Provider | EnvironmentProviders)[] {
  return [
    importProvidersFrom(
      TranslocoTestingModule.forRoot({
        langs: dictionaries,
        translocoConfig: {
          availableLangs: [...SUPPORTED_LANGS],
          defaultLang: 'ja',
          fallbackLang: 'ja',
        },
      })
    ),
    provideAppInitializer(() => layDictionaries(inject(TranslocoService))),
  ];
}

export function createSyncTranslate(lang: SupportedLang): TranslateFn {
  const dict = dictionaries[lang];
  return (key, params) => resolveKey(dict, key, params);
}

function resolveKey(dict: Translation, key: string, params?: Record<string, unknown>): string {
  const parts = key.split('.');
  let cur: unknown = dict;
  for (const part of parts) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  if (typeof cur !== 'string') return key;
  if (!params) return cur;
  return cur.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k: string) => String(params[k] ?? `{{${k}}}`));
}
