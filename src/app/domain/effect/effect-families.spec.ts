import { contrastRatio, parseHexColor, relativeLuminance } from '@axe/core/util/tonal-color';
import { DEFAULT_EFFECT_PRESET_SEEDS } from '@axe/domain/effect/builtin-effect-presets';
import {
  EFFECT_FAMILY_ORDER,
  effectFamilyColor,
  effectFamilyRank,
  OTHER_FAMILY_COLOR,
} from '@axe/domain/effect/effect-families';

/** The grounds a family's colour is drawn on: the panel's and the list's, in each theme. */
const DARK_GROUNDS = ['#171c23', '#21262d'];
const LIGHT_GROUNDS = ['#e2d6e8', '#e8dded', '#ded3e8'];

function contrast(color: string, ground: string): number {
  return contrastRatio(relativeLuminance(parseHexColor(color)!), relativeLuminance(parseHexColor(ground)!));
}

describe('the families of effects', () => {
  const bundled = [...new Set(DEFAULT_EFFECT_PRESET_SEEDS.map((seed) => seed.tagName))];

  it('lists every family of the effects that come with the tool, in the order they are shown', () => {
    expect(bundled.filter((family) => !EFFECT_FAMILY_ORDER.includes(family))).toEqual([]);
    expect([...bundled].sort((left, right) => effectFamilyRank(left) - effectFamilyRank(right)).slice(0, 4)).toEqual([
      '物理',
      '打撃',
      '射撃',
      '炎',
    ]);
  });

  it('puts a family a table named itself after those, and the effects of no family last', () => {
    expect(effectFamilyRank('自作')).toBeGreaterThan(effectFamilyRank('組み立て'));
    expect(effectFamilyRank('')).toBeGreaterThan(effectFamilyRank('自作'));
  });

  it('gives every bundled family a colour of its own, and any other family the neutral one', () => {
    const colors = bundled.map((family) => effectFamilyColor(family));

    expect(new Set(colors.map((color) => color.dark)).size).toBe(bundled.length);
    expect(new Set(colors.map((color) => color.light)).size).toBe(bundled.length);
    expect(colors).not.toContain(OTHER_FAMILY_COLOR);
    expect(effectFamilyColor('自作')).toBe(OTHER_FAMILY_COLOR);
    expect(effectFamilyColor('')).toBe(OTHER_FAMILY_COLOR);
    expect(effectFamilyColor(' 炎 ')).toBe(effectFamilyColor('炎'));
  });

  it('marks every family in a colour that stands 3:1 off the ground it is drawn on, in both themes', () => {
    for (const family of [...EFFECT_FAMILY_ORDER, '自作']) {
      const color = effectFamilyColor(family);
      for (const ground of DARK_GROUNDS)
        expect(contrast(color.dark, ground), `${family} dark`).toBeGreaterThanOrEqual(3);
      for (const ground of LIGHT_GROUNDS) {
        expect(contrast(color.light, ground), `${family} light`).toBeGreaterThanOrEqual(3);
      }
    }
  });
});
