import {
  asRecipe,
  asSkinId,
  CUSTOM_SKIN,
  parseRecipe,
  skinById,
  SKINS,
  skinsFor,
  STANDARD_SKIN,
} from '@axe/domain/ui/skin';
import { skinContrast, skinTokens } from '@axe/domain/ui/skin-palette';

describe('the skins that ship with the app', () => {
  it('offers the standard one on both ladders', () => {
    expect(skinById(STANDARD_SKIN, 'light')?.recipe).toBeNull();
    expect(skinById(STANDARD_SKIN, 'dark')?.recipe).toBeNull();
  });

  it('gives each ladder something to choose between', () => {
    expect(skinsFor('light').length).toBeGreaterThan(5);
    expect(skinsFor('dark').length).toBeGreaterThan(3);
  });

  it('pins only colours the stylesheet actually reads', () => {
    const known = new Set(Object.keys(skinTokens({ hue: 0, chroma: 0, accentHue: 0, accentChroma: 0 }, 'light')));

    for (const entry of SKINS) {
      for (const name of Object.keys(entry.pinned ?? {})) {
        expect(`${entry.id}: ${name}`).toBe(`${entry.id}: ${known.has(name) ? name : 'unknown token'}`);
      }
    }
  });

  it('names each skin once per ladder', () => {
    for (const mode of ['light', 'dark'] as const) {
      const ids = skinsFor(mode).map((entry) => entry.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('keeps every one of them readable', () => {
    for (const entry of SKINS) {
      if (!entry.recipe) continue;
      const tokens = { ...skinTokens(entry.recipe, entry.mode), ...(entry.pinned ?? {}) };
      const pairs: [string, string][] = [
        ['--ui-text', '--ui-elevated'],
        ['--ui-text-muted', '--ui-elevated'],
        ['--ui-accent', '--ui-elevated'],
        ['--ui-danger', '--ui-elevated'],
        ['--ui-quote-name', '--ui-quote-bg'],
        ['--ui-text', '--ui-bg'],
        // Other surfaces are painted with the titlebar colour and carry the app's ordinary
        // secondary text, so a bar that contrasts with its own panel has to carry it too.
        ['--ui-titlebar-text', '--ui-titlebar-bg'],
        ['--ui-titlebar-muted', '--ui-titlebar-bg'],
      ];
      for (const [ink, ground] of pairs) {
        // A translucent surface is composited over the panel behind it, which this cannot see.
        if (!tokens[ground]?.startsWith('#')) continue;
        const ratio = skinContrast(tokens, ink, ground);
        expect(`${entry.id}/${entry.mode} ${ink} on ${ground}: ${ratio.toFixed(2)}`).toBe(
          `${entry.id}/${entry.mode} ${ink} on ${ground}: ${Math.max(ratio, 4.5).toFixed(2)}`
        );
      }
    }
  });
});

describe('reading a skin back out of what a browser kept', () => {
  it('falls back to the standard one for a skin this build does not have', () => {
    expect(asSkinId('a-skin-from-2029', 'light')).toBe(STANDARD_SKIN);
  });

  it('falls back where the skin belongs to the other ladder', () => {
    expect(asSkinId('parchment', 'dark')).toBe(STANDARD_SKIN);
    expect(asSkinId('parchment', 'light')).toBe('parchment');
  });

  it('answers the standard one for an empty bag', () => {
    expect(asSkinId(null, 'light')).toBe(STANDARD_SKIN);
    expect(asSkinId('', 'light')).toBe(STANDARD_SKIN);
    expect(asSkinId(7, 'light')).toBe(STANDARD_SKIN);
  });

  it('lets the one a person built through', () => {
    expect(asSkinId(CUSTOM_SKIN, 'light')).toBe(CUSTOM_SKIN);
    expect(asSkinId(CUSTOM_SKIN, 'dark')).toBe(CUSTOM_SKIN);
  });
});

describe('reading a recipe a person built', () => {
  it('pulls every number into the range the sliders offer', () => {
    const recipe = asRecipe({ hue: -20, chroma: 500, accentHue: 400, accentChroma: -3, lift: 99 }, 'light');

    expect(recipe.chroma).toBe(40);
    expect(recipe.accentChroma).toBe(0);
    expect(recipe.lift).toBe(10);
    expect(recipe.hue).toBeGreaterThanOrEqual(0);
    expect(recipe.accentHue).toBeLessThan(360);
  });

  it('keeps its own ink colour only where one was written', () => {
    expect(asRecipe({ textHue: 38, textChroma: 45 }, 'light').textHue).toBe(38);
    expect(asRecipe({}, 'light').textHue).toBeUndefined();
  });

  it('reads anything that is not a recipe as the one it starts from', () => {
    expect(asRecipe(null, 'light')).toEqual(asRecipe(undefined, 'light'));
    expect(asRecipe('parchment', 'light')).toEqual(asRecipe(0, 'light'));
  });

  it('survives text that is not a recipe at all', () => {
    expect(parseRecipe('{oh no', 'light')).toEqual(parseRecipe(null, 'light'));
    expect(parseRecipe('', 'dark')).toEqual(parseRecipe(null, 'dark'));
  });

  it('reads back what it wrote', () => {
    const recipe = asRecipe({ hue: 200, chroma: 12, accentHue: 40, accentChroma: 50, lift: -4 }, 'light');

    expect(parseRecipe(JSON.stringify(recipe), 'light')).toEqual(recipe);
  });

  it('makes something readable out of anything the sliders can reach', () => {
    for (const hue of [0, 60, 120, 180, 240, 300]) {
      for (const chroma of [0, 20, 40]) {
        const tokens = skinTokens(asRecipe({ hue, chroma, accentHue: hue, accentChroma: 50 }, 'light'), 'light');
        expect(skinContrast(tokens, '--ui-text', '--ui-elevated')).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
