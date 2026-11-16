import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { SUPPORTED_LANGS } from '@axe/application/i18n/transloco.config';
import {
  isPieceResetCommand,
  isTableResetCommand,
  parseBuffClearanceCommand,
} from '@axe/domain/character/buff-bulk-removal';
import { CHAT_LINT_CODES } from '@axe/domain/chat-syntax/chat-lint';
import { readDefaultResetCommand } from '@axe/domain/data/resource-command-words';

type Tree = Record<string, unknown>;

function flatten(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value !== 'object' || value === null) return { [prefix]: String(value) };
  return Object.entries(value as Tree).reduce<Record<string, string>>((all, [key, child]) => {
    return { ...all, ...flatten(child, prefix.length > 0 ? `${prefix}.${key}` : key) };
  }, {});
}

function templatesIn(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return templatesIn(path);
    return path.endsWith('.html') ? [path] : [];
  });
}

const KEY_IN_TEMPLATE = /'([a-zA-Z][a-zA-Z0-9_.]*)'\s*\|\s*transloco/g;

describe('translation keys', () => {
  const dictionaries = Object.fromEntries(
    SUPPORTED_LANGS.map((lang) => [lang, flatten(JSON.parse(readFileSync(`src/assets/i18n/${lang}.json`, 'utf-8')))])
  );

  it('say every chat syntax finding, built from its code, in every language', () => {
    for (const lang of SUPPORTED_LANGS) {
      const missing = CHAT_LINT_CODES.filter((code) => !dictionaries[lang][`feature.chat.lint.${code}`]);
      expect(missing, lang).toEqual([]);
    }
  });

  it('give the chat syntax menu, in every language, words the reset commands are read by', () => {
    for (const lang of SUPPORTED_LANGS) {
      const word = (key: string) => dictionaries[lang][`feature.chat.syntax.${key}`];

      expect(parseBuffClearanceCommand(`&*${word('buffKindWord')}-`), lang).toEqual({ kind: 'buffs' });
      expect(parseBuffClearanceCommand(`&*${word('debuffKindWord')}-`), lang).toEqual({ kind: 'debuffs' });
      expect(isPieceResetCommand(`&${word('resetWord')}-`), lang).toBe(true);
      expect(isTableResetCommand(`&&${word('resetWord')}-`), lang).toBe(true);
      expect(readDefaultResetCommand(`:*=${word('defaultWord')}`), lang).toEqual({ kind: 'all' });
    }
  });

  it('hold the same keys in every language', () => {
    const reference = Object.keys(dictionaries['ja']).sort();
    for (const lang of SUPPORTED_LANGS) {
      expect(Object.keys(dictionaries[lang]).sort()).toEqual(reference);
    }
  });

  it('leave nothing empty, which the screens would show as the key itself', () => {
    const empty = Object.entries(dictionaries).flatMap(([language, dictionary]) =>
      Object.entries(dictionary)
        .filter(([, text]) => text === '')
        .map(([key]) => `${language}: ${key}`)
    );

    expect(empty).toEqual([]);
  });

  it('name, in the hint shown while an effect is held ready, the keys and the button that cast it and call it off', () => {
    for (const lang of SUPPORTED_LANGS) {
      const hint = dictionaries[lang]['feature.effect.pickingHint'];
      expect(hint, lang).toContain('Enter');
      expect(hint, lang).toContain('Esc');
      expect(hint, lang).toContain(dictionaries[lang]['feature.tabletop.targetBand.fire']);
    }
    expect(dictionaries['ja']['feature.effect.pickingHint']).not.toContain(' ');
  });

  it('cover every key the screens ask for', () => {
    const missing: string[] = [];
    for (const template of templatesIn('src/app')) {
      const source = readFileSync(template, 'utf-8');
      for (const [, key] of source.matchAll(KEY_IN_TEMPLATE)) {
        if (!key.includes('.')) continue;
        for (const [language, dictionary] of Object.entries(dictionaries)) {
          if (!(key in dictionary)) missing.push(`${language}: ${key} (${template})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });
});
