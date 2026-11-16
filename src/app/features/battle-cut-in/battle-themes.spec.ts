import { BATTLE_THEMES, type BattleTheme } from '@axe/domain/battle/battle-settings';
import { BATTLE_PICTURE_LOOK, battleThemeLook } from '@axe/features/battle-cut-in/battle-themes';

describe('battleThemeLook()', () => {
  /** Where each stage keeps its picture in view, and the colours its left and right plates are marked in. */
  const EXPECTED: Record<BattleTheme, { focus: string; left: string; right: string; banner: string }> = {
    fantasy: { focus: '60% 45%', left: '#6fb7ff', right: '#ff6b6b', banner: '#ffe7a8' },
    modern: { focus: '50% 50%', left: '#4aa3ff', right: '#ff4d5e', banner: '#f4f8ff' },
    horror: { focus: '55% 45%', left: '#a8b4c0', right: '#e04050', banner: '#f6dcdc' },
    cyberpunk: { focus: '50% 50%', left: '#2ef2ff', right: '#ff2e88', banner: '#e9fdff' },
    mecha: { focus: '50% 55%', left: '#38bdf8', right: '#ff8a1f', banner: '#ffd29a' },
    'fantasy-day': { focus: '60% 50%', left: '#3b8cff', right: '#ff5a5a', banner: '#fff4d0' },
    'modern-day': { focus: '50% 50%', left: '#2f8cff', right: '#ff4d5e', banner: '#ffffff' },
    'horror-day': { focus: '65% 50%', left: '#b8c4b0', right: '#c8323c', banner: '#e8eadc' },
    'cyberpunk-day': { focus: '50% 50%', left: '#2ef2ff', right: '#ff2e88', banner: '#fffaf0' },
    'mecha-day': { focus: '50% 50%', left: '#38bdf8', right: '#ff8a1f', banner: '#fff1d6' },
  };

  it('has a look for every stage the tool draws, and for no other', () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...BATTLE_THEMES].sort());
    for (const theme of BATTLE_THEMES) expect(battleThemeLook(theme)).toBeDefined();
  });

  it.each(BATTLE_THEMES.map((theme) => [theme]))('marks the %s stage in its own colours', (theme) => {
    const look = battleThemeLook(theme);

    expect({ focus: look.focus, left: look.left, right: look.right, banner: look.banner['color'] }).toEqual(
      EXPECTED[theme]
    );
  });

  it.each(BATTLE_THEMES.map((theme) => [theme]))(
    'draws the %s stage on the picture named after it, with a small copy to choose it by',
    (theme) => {
      const look = battleThemeLook(theme);

      expect(look.image).toBe(`./assets/images/battle/${theme}.webp`);
      expect(look.thumbnail).toBe(`./assets/images/battle/thumb/${theme}.webp`);
    }
  );

  it.each(BATTLE_THEMES.map((theme) => [theme]))(
    'gives the %s stage lines that fade out at both ends, a sweep of light and a shadowed banner',
    (theme) => {
      const look = battleThemeLook(theme);

      expect(look.edge).toMatch(/^linear-gradient\(to right, transparent, .+, transparent\)$/);
      expect(look.sweep).toMatch(/^linear-gradient\(to right, transparent, rgb\(.+\), transparent\)$/);
      expect(Object.keys(look.banner).sort()).toEqual(['color', 'text-shadow']);
    }
  );

  it('answers the same look each time a stage is asked for', () => {
    expect(battleThemeLook('horror')).toBe(battleThemeLook('horror'));
  });
});

describe('BATTLE_PICTURE_LOOK', () => {
  it('marks the sides in the usual blue and red, with no picture of its own', () => {
    expect([BATTLE_PICTURE_LOOK.left, BATTLE_PICTURE_LOOK.right]).toEqual(['#4aa3ff', '#ff5a5a']);
    expect(Object.keys(BATTLE_PICTURE_LOOK).sort()).toEqual(['banner', 'edge', 'left', 'right', 'sweep']);
  });
});
