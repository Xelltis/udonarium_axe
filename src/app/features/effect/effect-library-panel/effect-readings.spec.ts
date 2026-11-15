import { readFileSync } from 'node:fs';

import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import { EFFECT_FAMILY_ORDER } from '@axe/domain/effect/effect-families';
import { EFFECT_KINDS } from '@axe/domain/effect/effect-kind';
import { readingOf } from '@axe/features/effect/effect-library-panel/effect-readings';

/** A character no reading was found for: a kanji left as written. */
const UNREAD = /[㐀-鿿々]/;

describe('how the names of effects are read', () => {
  it('reads a name word by word, taking the longest word at each place', () => {
    expect(readingOf('火の粉')).toBe('ひのこ');
    expect(readingOf('火の矢')).toBe('ひのや');
    expect(readingOf('聖なる吐息')).toBe('せいなるといき');
    expect(readingOf('光線銃・連射')).toBe('こうせんじゅう・れんしゃ');
  });

  it('leaves kana, letters and words it does not list as written', () => {
    expect(readingOf('ファイアボルト')).toBe('ファイアボルト');
    expect(readingOf('Fire Bolt')).toBe('Fire Bolt');
    expect(readingOf('鰹の一撃')).toBe('鰹の一撃');
    expect(readingOf('')).toBe('');
  });

  it('reads every name of the effects that come with the tool', () => {
    const unread = DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.name).filter((name) => UNREAD.test(readingOf(name)));

    expect(unread).toEqual([]);
  });

  it('reads every family that comes with the tool, and every kind as the Japanese screen names it', () => {
    const japanese = JSON.parse(readFileSync('src/assets/i18n/ja.json', 'utf-8')) as {
      feature: { effect: { kinds: Record<string, string> } };
    };
    const kinds = EFFECT_KINDS.map((kind) => japanese.feature.effect.kinds[kind]);

    expect(kinds.every((name) => typeof name === 'string' && name.length > 0)).toBe(true);
    expect([...EFFECT_FAMILY_ORDER, ...kinds].filter((name) => UNREAD.test(readingOf(name)))).toEqual([]);
  });
});
