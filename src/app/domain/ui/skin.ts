import { MAX_LIFT, MAX_SPREAD, MIN_SPREAD, SkinMode, SkinRecipe } from '@axe/domain/ui/skin-palette';

/**
 * How the picker files the skins.
 *
 * The groups are what a reader is choosing between rather than what the code does with
 * them: every skin below the standard one is the same kind of thing.
 */
export type SkinGroup = 'standard' | 'hue' | 'legible' | 'scene' | 'board' | 'custom';

export interface Skin {
  id: string;
  mode: SkinMode;
  group: SkinGroup;
  /** What the recipe makes, or nothing at all where the stylesheet already says it. */
  recipe: SkinRecipe | null;
  /**
   * Colours pinned by hand, laid over what the recipe worked out.
   *
   * The ramp exists so that any two skins can be compared and so that the sliders cannot
   * reach something unreadable. A skin quoting a real screen has no such duty: it has one
   * right answer, and the ramp's job there is only to fill in what the quote does not say.
   */
  pinned?: Readonly<Record<string, string>>;
}

/** The skin that changes nothing: the stylesheet's own light and dark blocks show through. */
export const STANDARD_SKIN = 'standard';

/** The one skin whose recipe comes from the person using it rather than from this list. */
export const CUSTOM_SKIN = 'custom';

function skin(
  id: string,
  mode: SkinMode,
  group: SkinGroup,
  recipe: SkinRecipe | null,
  pinned?: Readonly<Record<string, string>>
): Skin {
  return { id, mode, group, recipe, pinned };
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

  skin('sumi', 'dark', 'hue', { hue: 70, chroma: 3, accentHue: 220, accentChroma: 45 }),
  skin('nightParchment', 'dark', 'hue', { hue: 70, chroma: 12, accentHue: 80, accentChroma: 40 }),
  skin('scorched', 'dark', 'hue', { hue: 40, chroma: 14, accentHue: 35, accentChroma: 55 }),
  skin('ebi', 'dark', 'hue', { hue: 355, chroma: 14, accentHue: 10, accentChroma: 50 }),
  skin('kokimurasaki', 'dark', 'hue', { hue: 305, chroma: 14, accentHue: 290, accentChroma: 45 }),
  skin('konjou', 'dark', 'hue', { hue: 265, chroma: 16, accentHue: 250, accentChroma: 50 }),
  skin('deepSea', 'dark', 'hue', { hue: 210, chroma: 16, accentHue: 190, accentChroma: 45 }),
  skin('tokiwa', 'dark', 'hue', { hue: 145, chroma: 14, accentHue: 140, accentChroma: 45 }),

  skin('plainLight', 'light', 'legible', { hue: 90, chroma: 3, accentHue: 250, accentChroma: 50, contrast: 'high' }),
  skin('plainDark', 'dark', 'legible', { hue: 250, chroma: 3, accentHue: 220, accentChroma: 45, contrast: 'high' }),
  skin('mono', 'light', 'legible', { hue: 0, chroma: 0, accentHue: 0, accentChroma: 0 }),
  skin('monoDark', 'dark', 'legible', { hue: 0, chroma: 0, accentHue: 0, accentChroma: 0 }),
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
  skin('iceCave', 'dark', 'scene', { hue: 225, chroma: 13, accentHue: 210, accentChroma: 45 }),
  skin('sandTomb', 'dark', 'scene', { hue: 65, chroma: 13, accentHue: 55, accentChroma: 50 }),
  skin('cavern', 'dark', 'scene', { hue: 255, chroma: 5, accentHue: 30, accentChroma: 50 }),

  skin('slateDesk', 'light', 'board', {
    hue: 240,
    chroma: 10,
    spread: MAX_SPREAD,
    titlebarHue: 150,
    titlebarChroma: 26,
    accentHue: 152,
    accentChroma: 40,
  }),
  skin(
    'lcdGreen',
    'dark',
    'board',
    { hue: 120, chroma: 12, accentHue: 110, accentChroma: 55 },
    {
      '--ui-bg': '#081f08',
      '--ui-surface': '#0b2b0b',
      '--ui-elevated': '#0f380f',
      '--ui-panel-bg': 'rgba(15, 56, 15, 0.94)',
      '--ui-panel-border': '#306230',
      '--ui-bubble-caret-border': '#306230',
      '--ui-titlebar-bg': '#0b2b0b',
      '--ui-titlebar-border': '#306230',
      '--ui-hover': 'rgba(155, 188, 15, 0.12)',
      '--ui-selected': 'rgba(155, 188, 15, 0.26)',
      '--ui-menu-bg': 'rgba(11, 43, 11, 0.97)',
      '--ui-menu-border': '#306230',
      '--ui-menu-hover': 'rgba(155, 188, 15, 0.18)',
      '--ui-menu-separator': '#245022',
      '--ui-text': '#9bbc0f',
      '--ui-text-muted': '#8bac0f',
      '--ui-text-dim': '#5d7a1a',
      '--ui-accent': '#e8f0a0',
      '--ui-accent-hover': '#f4f8cc',
      '--ui-accent-bg': 'rgba(232, 240, 160, 0.14)',
      '--ui-quote-bg': '#123f11',
      '--ui-quote-hover-bg': '#174915',
      '--ui-quote-border': '#e8f0a0',
      '--ui-quote-text': '#9bbc0f',
      '--ui-quote-name': '#e8f0a0',
      '--ui-danger': '#f08a4a',
      '--ui-danger-hover': '#f7ab7c',
      '--ui-success': '#8bac0f',
      '--ui-input-bg': '#0b2b0b',
      '--ui-input-border': '#306230',
      '--ui-suit-black': '#e8f0a0',
    }
  ),
  skin(
    'commandWindow',
    'dark',
    'board',
    { hue: 285, chroma: 22, accentHue: 90, accentChroma: 60 },
    {
      '--ui-bg': '#00001c',
      '--ui-surface': '#101a5a',
      '--ui-elevated': '#1a2a7a',
      '--ui-panel-bg': 'rgba(26, 42, 122, 0.94)',
      '--ui-panel-border': '#c8d0ff',
      '--ui-bubble-caret-border': '#c8d0ff',
      '--ui-titlebar-bg': '#101a5a',
      '--ui-titlebar-border': '#c8d0ff',
      '--ui-hover': 'rgba(255, 255, 255, 0.14)',
      '--ui-selected': 'rgba(255, 216, 92, 0.32)',
      '--ui-menu-bg': 'rgba(16, 26, 90, 0.97)',
      '--ui-menu-border': '#c8d0ff',
      '--ui-menu-hover': 'rgba(255, 216, 92, 0.2)',
      '--ui-menu-separator': '#5a68c0',
      '--ui-text': '#ffffff',
      '--ui-text-muted': '#b8c4f0',
      '--ui-text-dim': '#7f8cc8',
      '--ui-accent': '#ffd85c',
      '--ui-accent-hover': '#ffe895',
      '--ui-accent-bg': 'rgba(255, 216, 92, 0.16)',
      '--ui-quote-bg': '#101a5a',
      '--ui-quote-hover-bg': '#16226e',
      '--ui-quote-border': '#ffd85c',
      '--ui-quote-text': '#ffffff',
      '--ui-quote-name': '#ffd85c',
      '--ui-danger': '#ff8a8a',
      '--ui-danger-hover': '#ffb0b0',
      '--ui-success': '#8cf08c',
      '--ui-input-bg': '#101a5a',
      '--ui-input-border': '#c8d0ff',
      '--ui-suit-black': '#ffd85c',
    }
  ),
  skin(
    'eightBit',
    'dark',
    'board',
    { hue: 250, chroma: 2, accentHue: 250, accentChroma: 55 },
    {
      '--ui-bg': '#000000',
      '--ui-surface': '#0c0c0c',
      '--ui-elevated': '#181818',
      '--ui-panel-bg': 'rgba(24, 24, 24, 0.94)',
      '--ui-panel-border': '#fcfcfc',
      '--ui-bubble-caret-border': '#bcbcbc',
      '--ui-titlebar-bg': '#0c0c0c',
      '--ui-titlebar-border': '#bcbcbc',
      '--ui-hover': 'rgba(252, 252, 252, 0.12)',
      '--ui-selected': 'rgba(60, 188, 252, 0.3)',
      '--ui-menu-bg': 'rgba(12, 12, 12, 0.97)',
      '--ui-menu-border': '#bcbcbc',
      '--ui-menu-hover': 'rgba(60, 188, 252, 0.2)',
      '--ui-menu-separator': '#585858',
      '--ui-text': '#fcfcfc',
      '--ui-text-muted': '#bcbcbc',
      '--ui-text-dim': '#7c7c7c',
      '--ui-accent': '#3cbcfc',
      '--ui-accent-hover': '#a4e4fc',
      '--ui-accent-bg': 'rgba(60, 188, 252, 0.16)',
      '--ui-quote-bg': '#101010',
      '--ui-quote-hover-bg': '#1c1c1c',
      '--ui-quote-border': '#3cbcfc',
      '--ui-quote-text': '#fcfcfc',
      '--ui-quote-name': '#fcfc54',
      '--ui-danger': '#f85838',
      '--ui-danger-hover': '#fc9868',
      '--ui-success': '#b8f818',
      '--ui-input-bg': '#0c0c0c',
      '--ui-input-border': '#bcbcbc',
      '--ui-suit-black': '#3cbcfc',
    }
  ),
  skin(
    'mazeAmber',
    'dark',
    'board',
    { hue: 65, chroma: 10, accentHue: 65, accentChroma: 60 },
    {
      '--ui-bg': '#0a0600',
      '--ui-surface': '#140d03',
      '--ui-elevated': '#1b1206',
      '--ui-panel-bg': 'rgba(27, 18, 6, 0.92)',
      '--ui-panel-border': '#6b4a12',
      '--ui-bubble-caret-border': '#6b4a12',
      '--ui-titlebar-bg': '#241806',
      '--ui-titlebar-border': '#6b4a12',
      '--ui-hover': 'rgba(255, 176, 0, 0.12)',
      '--ui-selected': 'rgba(255, 176, 0, 0.24)',
      '--ui-menu-bg': 'rgba(20, 13, 3, 0.97)',
      '--ui-menu-border': '#6b4a12',
      '--ui-menu-hover': 'rgba(255, 176, 0, 0.16)',
      '--ui-menu-separator': '#4d350d',
      '--ui-text': '#ffb000',
      '--ui-text-muted': '#c08420',
      '--ui-text-dim': '#8a5f18',
      '--ui-accent': '#ffcc55',
      '--ui-accent-hover': '#ffdd8a',
      '--ui-accent-bg': 'rgba(255, 204, 85, 0.14)',
      '--ui-quote-bg': '#241706',
      '--ui-quote-hover-bg': '#2e1e08',
      '--ui-quote-border': '#ffcc55',
      '--ui-quote-text': '#ffb000',
      '--ui-quote-name': '#ffd98a',
      '--ui-danger': '#ff6b4a',
      '--ui-danger-hover': '#ff9578',
      '--ui-success': '#c9d94a',
      '--ui-input-bg': '#140d03',
      '--ui-input-border': '#6b4a12',
      '--ui-suit-black': '#ffcc55',
    }
  ),
  skin(
    'creamBoard',
    'light',
    'board',
    { hue: 45, chroma: 14, spread: MIN_SPREAD, textHue: 38, textChroma: 50, accentHue: 265, accentChroma: 62 },
    {
      '--ui-bg': '#f0e0d6',
      '--ui-surface': '#f0e0d6',
      '--ui-elevated': '#ffffee',
      '--ui-panel-bg': 'rgba(255, 255, 238, 0.96)',
      '--ui-panel-border': '#cc9988',
      '--ui-bubble-caret-border': '#cc9988',
      '--ui-titlebar-bg': '#ea8e78',
      '--ui-titlebar-border': '#cc7755',
      '--ui-hover': 'rgba(234, 142, 120, 0.24)',
      '--ui-selected': 'rgba(234, 142, 120, 0.45)',
      '--ui-menu-bg': 'rgba(255, 255, 238, 0.98)',
      '--ui-menu-border': '#cc9988',
      '--ui-menu-hover': 'rgba(234, 142, 120, 0.28)',
      '--ui-menu-separator': '#e0b8a4',
      '--ui-text': '#800000',
      '--ui-text-muted': '#a05030',
      '--ui-text-dim': '#c08870',
      '--ui-accent': '#0000ee',
      '--ui-accent-hover': '#0000aa',
      '--ui-accent-bg': 'rgba(0, 0, 238, 0.08)',
      '--ui-quote-bg': '#f0e0d6',
      '--ui-quote-hover-bg': '#e8d4c6',
      '--ui-quote-border': '#ea8e78',
      '--ui-quote-text': '#800000',
      '--ui-quote-name': '#4f6b12',
      '--ui-danger': '#cc0000',
      '--ui-danger-hover': '#aa0000',
      '--ui-success': '#5a7a15',
      '--ui-input-bg': '#ffffff',
      '--ui-input-border': '#cc9988',
    }
  ),
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
