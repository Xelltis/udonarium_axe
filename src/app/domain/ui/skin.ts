import { MAX_LIFT, MAX_SPREAD, MIN_SPREAD, SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';

/**
 * How the picker files the skins.
 *
 * The groups are what a reader is choosing between rather than what the code does with
 * them: every skin below the standard one is the same kind of thing.
 */
export type SkinGroup = 'standard' | 'hue' | 'dark' | 'legible' | 'scene' | 'board' | 'custom';

export interface Skin {
  id: string;
  mode: SkinMode;
  group: SkinGroup;
  /** What the recipe makes, or nothing at all where the stylesheet already says it. */
  recipe: SkinRecipe | null;
}

/** The skin that changes nothing: the stylesheet's own light and dark blocks show through. */
export const STANDARD_SKIN = 'standard';

/** The one skin whose recipe comes from the person using it rather than from this list. */
export const CUSTOM_SKIN = 'custom';

function skin(id: string, mode: SkinMode, group: SkinGroup, recipe: SkinRecipe | null): Skin {
  return { id, mode, group, recipe };
}

export const SKINS: readonly Skin[] = [
  skin(STANDARD_SKIN, 'light', 'standard', null),
  skin(STANDARD_SKIN, 'dark', 'standard', null),

  skin('parchment', 'light', 'hue', { hue: 82, chroma: 14, accentHue: 160, accentChroma: 30 }),
  skin('sakura', 'light', 'hue', { hue: 10, chroma: 12, accentHue: 265, accentChroma: 50 }),
  skin('amber', 'light', 'hue', { hue: 60, chroma: 26, accentHue: 150, accentChroma: 36 }),
  skin('bamboo', 'light', 'hue', { hue: 155, chroma: 20, accentHue: 10, accentChroma: 48 }),
  skin('asagi', 'light', 'hue', { hue: 195, chroma: 18, accentHue: 35, accentChroma: 48 }),
  skin('wisteria', 'light', 'hue', { hue: 285, chroma: 16, accentHue: 150, accentChroma: 32 }),
  skin('silver', 'light', 'hue', { hue: 220, chroma: 5, accentHue: 10, accentChroma: 50 }),

  skin('nightParchment', 'dark', 'dark', { hue: 70, chroma: 12, accentHue: 80, accentChroma: 40 }),
  skin('deepSea', 'dark', 'dark', { hue: 210, chroma: 16, accentHue: 190, accentChroma: 45 }),
  skin('scorched', 'dark', 'dark', { hue: 40, chroma: 14, accentHue: 35, accentChroma: 55 }),

  skin('plainLight', 'light', 'legible', { hue: 90, chroma: 3, accentHue: 250, accentChroma: 50, contrast: 'high' }),
  skin('plainDark', 'dark', 'legible', { hue: 250, chroma: 3, accentHue: 220, accentChroma: 45, contrast: 'high' }),
  skin('mono', 'light', 'legible', { hue: 0, chroma: 0, accentHue: 0, accentChroma: 0 }),
  skin('daylight', 'light', 'legible', {
    hue: 80,
    chroma: 7,
    accentHue: 245,
    accentChroma: 55,
    contrast: 'high',
    lift: -4,
  }),

  skin('snowfield', 'light', 'scene', { hue: 240, chroma: 6, accentHue: 250, accentChroma: 45, lift: 6 }),
  skin('forest', 'light', 'scene', { hue: 140, chroma: 16, accentHue: 30, accentChroma: 50 }),
  skin('catacomb', 'dark', 'scene', { hue: 300, chroma: 8, accentHue: 90, accentChroma: 40 }),
  skin('lavaTube', 'dark', 'scene', { hue: 30, chroma: 20, accentHue: 45, accentChroma: 60 }),

  skin('slateDesk', 'light', 'board', {
    hue: 240,
    chroma: 10,
    spread: MAX_SPREAD,
    titlebarHue: 150,
    titlebarChroma: 26,
    accentHue: 152,
    accentChroma: 40,
  }),
  skin('creamBoard', 'light', 'board', {
    hue: 80,
    chroma: 13,
    spread: MIN_SPREAD,
    textHue: 38,
    textChroma: 50,
    accentHue: 35,
    accentChroma: 62,
  }),
];

/** What a new custom skin starts from, so the sliders open on something readable. */
export const CUSTOM_SEED: Readonly<Record<SkinMode, SkinRecipe>> = {
  light: { hue: 82, chroma: 14, accentHue: 250, accentChroma: 45 },
  dark: { hue: 220, chroma: 12, accentHue: 220, accentChroma: 45 },
};

export function skinsFor(mode: SkinMode): Skin[] {
  return SKINS.filter((entry) => entry.mode === mode);
}

export function skinById(id: string, mode: SkinMode): Skin | null {
  return SKINS.find((entry) => entry.id === id && entry.mode === mode) ?? null;
}

/**
 * The skin an id names, with anything unknown read as the standard one.
 *
 * A skin lives in this browser rather than in the room, so the id can outlive the build
 * that wrote it: a skin dropped from the list has to fall back rather than leave a seat
 * with no colours at all. `custom` passes through, since its recipe is stored beside it.
 */
export function asSkinId(value: unknown, mode: SkinMode): string {
  if (typeof value !== 'string' || value.length < 1) return STANDARD_SKIN;
  if (value === CUSTOM_SKIN) return CUSTOM_SKIN;
  return skinById(value, mode) ? value : STANDARD_SKIN;
}

function clamp(value: unknown, low: number, high: number, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(low, Math.min(high, value)) : fallback;
}

/** A recipe read back out of the text a browser kept, with every number pulled into range. */
export function asRecipe(value: unknown, mode: SkinMode): SkinRecipe {
  const seed = CUSTOM_SEED[mode];
  if (!value || typeof value !== 'object') return seed;
  const raw = value as Record<string, unknown>;
  const recipe: SkinRecipe = {
    hue: clamp(raw['hue'], 0, 360, seed.hue) % 360,
    chroma: clamp(raw['chroma'], 0, 40, seed.chroma),
    accentHue: clamp(raw['accentHue'], 0, 360, seed.accentHue) % 360,
    accentChroma: clamp(raw['accentChroma'], 0, 80, seed.accentChroma),
    lift: clamp(raw['lift'], -MAX_LIFT, MAX_LIFT, 0),
    spread: clamp(raw['spread'], MIN_SPREAD, MAX_SPREAD, 0),
    contrast: raw['contrast'] === 'high' ? 'high' : 'normal',
  };
  if (typeof raw['textHue'] === 'number') recipe.textHue = clamp(raw['textHue'], 0, 360, 0) % 360;
  if (typeof raw['textChroma'] === 'number') recipe.textChroma = clamp(raw['textChroma'], 0, 60, 0);
  if (typeof raw['titlebarHue'] === 'number') recipe.titlebarHue = clamp(raw['titlebarHue'], 0, 360, 0) % 360;
  if (typeof raw['titlebarChroma'] === 'number') recipe.titlebarChroma = clamp(raw['titlebarChroma'], 0, 60, 0);
  return recipe;
}

export function parseRecipe(text: string | null, mode: SkinMode): SkinRecipe {
  if (!text) return CUSTOM_SEED[mode];
  try {
    return asRecipe(JSON.parse(text), mode);
  } catch {
    return CUSTOM_SEED[mode];
  }
}
