import { Lch, lchToRgb, parseHexColor, relativeLuminance, rgbToLch } from '@axe/core/util/tonal-color';

/** Which side of the light/dark switch a skin dresses. */
export type SkinMode = 'light' | 'dark';

/** How far apart the surfaces and the text are set. */
export type SkinContrast = 'normal' | 'high';

/**
 * What a skin is, in the terms a person can be handed a slider for.
 *
 * Everything a theme needs — forty custom properties — comes out of these few numbers, so
 * a skin someone builds in the panel and a skin that ships with the app are the same kind
 * of thing, and both can be checked for readability the same way.
 */
export interface SkinRecipe {
  /** Where the surfaces sit on the wheel, in degrees. */
  hue: number;
  /** How much colour the ground carries. Zero is a grey skin. */
  chroma: number;
  /** Where the accent sits. It is free to be nowhere near the surfaces. */
  accentHue: number;
  accentChroma: number;
  /** Text follows the surfaces unless a skin wants its own — a cream board's maroon. */
  textHue?: number;
  textChroma?: number;
  /** Moves every surface up or down the ladder together, leaving the ink where it is. */
  lift?: number;
  /**
   * How many tones the ground sits below the panels, on top of what the ladder already says.
   *
   * Negative lifts the ground above them, which is how a page of pale cream carrying darker
   * reply blocks is built.
   */
  spread?: number;
  /** The titlebar's own hue, for a chrome that was never the same colour as its panels. */
  titlebarHue?: number;
  titlebarChroma?: number;
  contrast?: SkinContrast;
}

/** How far a skin may shift its surfaces before the ink stops carrying over them. */
export const MAX_LIFT = 10;

/**
 * How far the ground may fall behind the panels.
 *
 * Text is drawn straight onto the ground in a few places, so the ground cannot keep
 * falling: at the far end of this it still carries body text at the reading standard.
 */
export const MAX_SPREAD = 11;

/** How far the ground may rise above them, which is as far as the ladder has room for. */
export const MIN_SPREAD = -20;

/** The custom properties a skin sets, keyed by the name the stylesheet reads. */
export type SkinTokens = Readonly<Record<string, string>>;

interface Stop {
  /** CIE L*. */
  tone: number;
  /** How much of the recipe's chroma this surface keeps. */
  share: number;
}

interface Ramp {
  bg: Stop;
  surface: Stop;
  elevated: Stop;
  titlebar: Stop;
  input: Stop;
  menu: Stop;
  quoteBg: Stop;
  quoteHover: Stop;
  ghostHeader: Stop;
  caret: Stop;
  text: number;
  muted: number;
  dim: number;
  quoteText: number;
  accent: number;
  accentHover: number;
  quoteName: number;
  danger: number;
  dangerHover: number;
  success: number;
  /** How strongly borders and hovers are drawn over the surfaces. */
  edge: number;
  /** Whether the ink laid over the surfaces is the dark end or the light end. */
  ink: 'dark' | 'light';
}

/**
 * The two ladders every skin climbs.
 *
 * Chroma falls as lightness rises on the light ladder and as it falls on the dark one, so
 * the ground carries the colour and the panel a reader looks at for an hour carries about
 * half of it. Holding the tones fixed is what lets one skin be compared with another: the
 * only thing that moves between them is the colour.
 */
const LIGHT: Ramp = {
  bg: { tone: 78, share: 1 },
  surface: { tone: 86, share: 0.72 },
  elevated: { tone: 92, share: 0.5 },
  titlebar: { tone: 82, share: 0.93 },
  input: { tone: 94, share: 0.43 },
  menu: { tone: 93, share: 0.43 },
  quoteBg: { tone: 89, share: 0.57 },
  quoteHover: { tone: 85, share: 0.72 },
  ghostHeader: { tone: 84, share: 0.86 },
  caret: { tone: 72, share: 1 },
  text: 24,
  muted: 42,
  dim: 56,
  quoteText: 20,
  accent: 38,
  accentHover: 30,
  quoteName: 32,
  danger: 40,
  dangerHover: 35,
  success: 47,
  edge: 0.3,
  ink: 'dark',
};

const DARK: Ramp = {
  bg: { tone: 13, share: 1 },
  surface: { tone: 18, share: 0.8 },
  elevated: { tone: 24, share: 0.6 },
  titlebar: { tone: 20, share: 0.9 },
  input: { tone: 12, share: 0.5 },
  menu: { tone: 11, share: 0.5 },
  quoteBg: { tone: 19, share: 0.65 },
  quoteHover: { tone: 24, share: 0.8 },
  ghostHeader: { tone: 8, share: 1 },
  caret: { tone: 26, share: 0.9 },
  text: 92,
  muted: 68,
  dim: 40,
  quoteText: 88,
  accent: 70,
  accentHover: 80,
  quoteName: 78,
  danger: 68,
  dangerHover: 78,
  success: 70,
  edge: 0.34,
  ink: 'light',
};

/** What "high" does: pull the surfaces apart and push the ink to the far end. */
function stretch(ramp: Ramp): Ramp {
  const pull = (stop: Stop): Stop => ({
    tone: ramp.ink === 'dark' ? Math.min(98, stop.tone + (stop.tone - 78) * 0.5 + 3) : Math.max(2, stop.tone - 4),
    share: stop.share * 0.7,
  });
  return {
    ...ramp,
    bg: pull(ramp.bg),
    surface: pull(ramp.surface),
    elevated: pull(ramp.elevated),
    titlebar: pull(ramp.titlebar),
    input: pull(ramp.input),
    menu: pull(ramp.menu),
    quoteBg: pull(ramp.quoteBg),
    quoteHover: pull(ramp.quoteHover),
    ghostHeader: pull(ramp.ghostHeader),
    caret: pull(ramp.caret),
    text: ramp.ink === 'dark' ? 12 : 98,
    muted: ramp.ink === 'dark' ? 34 : 72,
    dim: ramp.ink === 'dark' ? 48 : 52,
    quoteText: ramp.ink === 'dark' ? 10 : 96,
    accent: ramp.ink === 'dark' ? 32 : 76,
    accentHover: ramp.ink === 'dark' ? 24 : 86,
    quoteName: ramp.ink === 'dark' ? 26 : 82,
    danger: ramp.ink === 'dark' ? 34 : 68,
    edge: ramp.edge * 1.8,
  };
}

function rampOf(mode: SkinMode, contrast: SkinContrast): Ramp {
  const base = mode === 'light' ? LIGHT : DARK;
  return contrast === 'high' ? stretch(base) : base;
}

function hex(lch: Lch): string {
  const byte = (channel: number) =>
    Math.round(Math.min(1, Math.max(0, channel)) * 255)
      .toString(16)
      .padStart(2, '0');
  const [r, g, b] = lchToRgb(lch);
  return `#${byte(r)}${byte(g)}${byte(b)}`;
}

function alpha(lch: Lch, amount: number): string {
  const [r, g, b] = lchToRgb(lch);
  const byte = (channel: number) => Math.round(Math.min(1, Math.max(0, channel)) * 255);
  return `rgba(${byte(r)}, ${byte(g)}, ${byte(b)}, ${Number(amount.toFixed(3))})`;
}

function surface(stop: Stop, recipe: SkinRecipe, ramp: Ramp): Lch {
  const lift = Math.max(-MAX_LIFT, Math.min(MAX_LIFT, recipe.lift ?? 0));
  const spread = Math.max(MIN_SPREAD, Math.min(MAX_SPREAD, recipe.spread ?? 0));
  const reach = Math.abs(ramp.elevated.tone - ramp.bg.tone) || 1;
  const below = ramp.elevated.tone - stop.tone;
  const tone = stop.tone - (spread * below) / reach + lift;
  return { tone: Math.max(2, Math.min(98, tone)), chroma: recipe.chroma * stop.share, hue: recipe.hue };
}

/** The colour the ink is drawn in, which is the surfaces' own hue unless a skin says otherwise. */
function inkHue(recipe: SkinRecipe): { hue: number; chroma: number } {
  return {
    hue: recipe.textHue ?? recipe.hue,
    chroma: recipe.textChroma ?? Math.min(recipe.chroma * 0.6, 12),
  };
}

/**
 * Every custom property a skin sets, worked out from its recipe.
 *
 * The names are the ones `styles.css` already reads, so a skin is applied by writing these
 * onto the document element and cleared by removing them: the stylesheet's own light and
 * dark blocks are what shows through when nothing is written.
 */
export function skinTokens(recipe: SkinRecipe, mode: SkinMode): SkinTokens {
  const ramp = rampOf(mode, recipe.contrast ?? 'normal');
  const ink = inkHue(recipe);
  const onDark = mode === 'dark';

  const at = (stop: Stop) => surface(stop, recipe, ramp);
  const bg = at(ramp.bg);
  const elevated = at(ramp.elevated);
  const titlebar = at(ramp.titlebar);
  const ghostHeader = at(ramp.ghostHeader);
  const accent: Lch = { tone: ramp.accent, chroma: recipe.accentChroma, hue: recipe.accentHue };
  const danger: Lch = { tone: ramp.danger, chroma: 58, hue: 28 };

  const edge: Lch = { tone: onDark ? 62 : 30, chroma: Math.min(recipe.chroma, 10), hue: recipe.hue };
  const over = (amount: number) => alpha(edge, amount);

  return {
    '--ui-bg': hex(bg),
    '--ui-surface': hex(at(ramp.surface)),
    '--ui-elevated': hex(elevated),

    '--ui-panel-bg': alpha(elevated, onDark ? 0.9 : 0.94),
    '--ui-panel-border': over(ramp.edge),
    '--ui-bubble-caret-border': hex(at(ramp.caret)),
    '--ui-panel-glow': alpha(accent, 0.07),
    '--ui-titlebar-bg': hex(
      recipe.titlebarHue === undefined
        ? titlebar
        : { ...titlebar, hue: recipe.titlebarHue, chroma: recipe.titlebarChroma ?? recipe.chroma }
    ),
    '--ui-titlebar-border': over(ramp.edge * 0.82),
    '--ui-hover': over(ramp.edge * 0.26),
    '--ui-selected': alpha(accent, 0.2),
    '--ui-ghost-bg': alpha(elevated, onDark ? 0.6 : 0.72),
    '--ui-ghost-header-bg': alpha(ghostHeader, 0.92),

    '--ui-menu-bg': alpha(at(ramp.menu), onDark ? 0.96 : 0.98),
    '--ui-menu-border': over(ramp.edge),
    '--ui-menu-hover': alpha(accent, 0.12),
    '--ui-menu-separator': over(ramp.edge * 0.7),

    '--ui-text': hex({ tone: ramp.text, ...ink }),
    '--ui-text-muted': hex({ tone: ramp.muted, hue: ink.hue, chroma: Math.min(ink.chroma + 1, 13) }),
    '--ui-text-dim': hex({ tone: ramp.dim, hue: ink.hue, chroma: Math.min(ink.chroma + 2, 14) }),

    '--ui-accent': hex(accent),
    '--ui-accent-hover': hex({ ...accent, tone: ramp.accentHover, chroma: Math.max(0, recipe.accentChroma - 3) }),
    '--ui-accent-glow': alpha(accent, 0.28),
    '--ui-accent-bg': alpha(accent, 0.12),

    '--ui-quote-bg': hex(at(ramp.quoteBg)),
    '--ui-quote-hover-bg': hex(at(ramp.quoteHover)),
    '--ui-quote-border': hex(accent),
    '--ui-quote-text': hex({ tone: ramp.quoteText, ...ink }),
    '--ui-quote-name': hex({ ...accent, tone: ramp.quoteName, chroma: Math.max(0, recipe.accentChroma - 4) }),

    '--ui-danger': hex(danger),
    '--ui-danger-hover': hex({ ...danger, tone: ramp.dangerHover, chroma: 55 }),
    '--ui-danger-glow': alpha(danger, 0.28),
    '--ui-danger-bg': alpha(danger, 0.1),

    '--ui-success': hex({ tone: ramp.success, chroma: 50, hue: 140 }),

    '--ui-suit-black': onDark ? hex(accent) : '#000000',

    '--ui-input-bg': hex(at(ramp.input)),
    '--ui-input-border': over(ramp.edge * 0.82),

    '--ui-shadow-sm': `0 2px 8px ${alpha({ tone: onDark ? 0 : 30, chroma: 0, hue: 0 }, onDark ? 0.5 : 0.16)}`,
    '--ui-shadow-md': [
      `0 4px 20px ${alpha({ tone: onDark ? 0 : 30, chroma: 0, hue: 0 }, onDark ? 0.65 : 0.2)}`,
      `0 1px 4px ${alpha({ tone: onDark ? 0 : 30, chroma: 0, hue: 0 }, onDark ? 0.4 : 0.12)}`,
    ].join(', '),
    '--ui-shadow-lg': [
      `0 8px 40px ${alpha({ tone: onDark ? 0 : 30, chroma: 0, hue: 0 }, onDark ? 0.75 : 0.24)}`,
      `0 2px 8px ${alpha({ tone: onDark ? 0 : 30, chroma: 0, hue: 0 }, onDark ? 0.5 : 0.16)}`,
    ].join(', '),
  };
}

/** How far apart two of a skin's own colours read, for the checks a skin has to pass. */
export function skinContrast(tokens: SkinTokens, a: string, b: string): number {
  const first = parseHexColor(tokens[a] ?? '');
  const second = parseHexColor(tokens[b] ?? '');
  if (!first || !second) return 0;
  return contrastOf(relativeLuminance(first), relativeLuminance(second));
}

function contrastOf(a: number, b: number): number {
  const high = Math.max(a, b);
  const low = Math.min(a, b);
  return (high + 0.05) / (low + 0.05);
}

/** The tone a skin's panels sit at, which is what a bubble colour has to be worked out against. */
export function panelTone(tokens: SkinTokens): number {
  const rgb = parseHexColor(tokens['--ui-elevated'] ?? '');
  return rgb ? rgbToLch(rgb).tone : 92;
}
