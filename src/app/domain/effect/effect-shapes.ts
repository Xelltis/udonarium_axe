import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';

/*
 * The marks of the kinds of effect, drawn as small pictures for the lists and the editors to show
 * which look a preset has, in the preset's own colours.
 */

export interface ShapeColors {
  core: string;
  edge: string;
}

const VIEW_BOX = 'viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"';

function svg(body: string): string {
  perfCounters.bump(PERF_SVG_BUILD);
  return `<svg ${VIEW_BOX} width="100%" height="100%">${body}</svg>`;
}

/** The colours a preset is made with until it is given its own, for a colour that will not do. */
const FALLBACK_COLORS: ShapeColors = { core: '#ffd27f', edge: '#ff5a33' };

/** A colour by hex, name or the rgb and hsl functions, none of which can hold a quote or a bracket. */
const PAINTABLE_COLOR = /^(?:#[0-9a-f]{3,8}|[a-z]+|(?:rgba?|hsla?)\([\d\s.,%/+-]*\))$/i;

/**
 * The colour as a drawing may be written with it, or the fallback for anything else. A preset's
 * colours are written by anyone at the table and come with saved rooms and preset files, and are
 * put into the drawing's attributes, out of which a colour of any other form could break.
 */
export function paintableColor(value: unknown, fallback: string): string {
  return typeof value === 'string' && PAINTABLE_COLOR.test(value.trim()) ? value.trim() : fallback;
}

function isShapeColors(value: unknown): value is ShapeColors {
  return typeof value === 'object' && value !== null && 'core' in value && 'edge' in value;
}

function paintable(colors: ShapeColors): ShapeColors {
  return {
    core: paintableColor(colors.core, FALLBACK_COLORS.core),
    edge: paintableColor(colors.edge, FALLBACK_COLORS.edge),
  };
}

const REMEMBERED_LIMIT = 256;
const drawings = new Map<string, string>();

/** A drawing kept by what it was asked with, whose colours are first made {@link paintableColor | paintable}. */
function remembered<A extends unknown[]>(name: string, build: (...args: A) => string): (...args: A) => string {
  return (...given: A): string => {
    const args = given.map((arg) => (isShapeColors(arg) ? paintable(arg) : arg)) as A;
    const key = name + JSON.stringify(args);
    const kept = drawings.get(key);
    if (kept !== undefined) return kept;
    if (drawings.size >= REMEMBERED_LIMIT) drawings.clear();
    const made = build(...args);
    drawings.set(key, made);
    return made;
  };
}

/**
 * The small mark on the list. The icon set has neither a sword nor an explosion, which
 * would leave a cut standing in as a pair of scissors, so these are drawn from the effects themselves.
 */
export const kindGlyphSvg = remembered('kindGlyphSvg', (kind: string, colors: ShapeColors): string => {
  const stroke = `fill="none" stroke="${colors.core}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`;
  const solid = `fill="${colors.core}"`;

  switch (kind) {
    case 'slash':
      return glyph(
        `<path d="M14 78 Q50 62 86 22" ${stroke}/><path d="M26 86 Q54 74 74 58" fill="none" stroke="${colors.edge}" stroke-width="6" stroke-linecap="round"/>`
      );
    case 'bash':
      return glyph(
        `<circle cx="50" cy="50" r="16" ${solid}/><path d="M50 6 L58 26 L42 26 Z M50 94 L42 74 L58 74 Z M6 50 L26 42 L26 58 Z M94 50 L74 58 L74 42 Z" fill="${colors.edge}"/>`
      );
    case 'projectile':
      return glyph(
        `<path d="M10 62 L58 40" fill="none" stroke="${colors.edge}" stroke-width="8" stroke-linecap="round"/><circle cx="72" cy="34" r="15" ${solid}/>`
      );
    case 'burst':
    case 'nova':
      return glyph(
        `<circle cx="50" cy="50" r="18" ${solid}/><path d="M50 4 L58 30 L42 30 Z M50 96 L42 70 L58 70 Z M4 50 L30 42 L30 58 Z M96 50 L70 58 L70 42 Z M18 18 L40 32 L32 40 Z M82 82 L60 68 L68 60 Z M82 18 L68 40 L60 32 Z M18 82 L32 60 L40 68 Z" fill="${colors.edge}"/>`
      );
    case 'mushroom':
      return glyph(
        `<path d="M18 40 Q50 8 82 40 Q66 46 50 44 Q34 46 18 40 Z" ${solid}/><rect x="42" y="42" width="16" height="46" rx="6" fill="${colors.edge}"/>`
      );
    case 'flame':
      return glyph(
        `<path d="M50 8 Q66 34 58 46 Q74 56 68 74 Q62 92 50 92 Q38 92 32 74 Q26 56 42 46 Q34 34 50 8 Z" ${solid}/>`
      );
    case 'breath':
      return glyph(`<path d="M8 50 Q34 34 92 16 Q62 50 92 84 Q34 66 8 50 Z" ${solid}/>`);
    case 'bolt':
    case 'arc':
      return glyph(`<path d="M58 4 L26 52 L48 52 L40 96 L74 44 L52 44 Z" ${solid}/>`);
    case 'frost':
      return glyph(
        `<path d="M50 6 V94 M11 28 L89 72 M89 28 L11 72" ${stroke}/><circle cx="50" cy="50" r="9" fill="${colors.edge}"/>`
      );
    case 'impact':
      return glyph(
        `<circle cx="50" cy="50" r="40" fill="none" stroke="${colors.core}" stroke-width="8"/><circle cx="50" cy="50" r="18" fill="none" stroke="${colors.edge}" stroke-width="8"/>`
      );
    case 'rubble':
      return glyph(
        `<path d="M20 78 L34 44 L58 56 L46 82 Z" ${solid}/><path d="M58 30 L80 22 L88 48 L64 54 Z" fill="${colors.edge}"/>`
      );
    case 'upheaval':
      return glyph(
        `<path d="M10 88 L34 30 L54 88 Z" ${solid}/><path d="M52 88 L74 46 L92 88 Z" fill="${colors.edge}"/>`
      );
    case 'vortex':
      return glyph(
        `<path d="M20 26 Q50 12 80 26 Q56 38 34 40 Q58 48 74 54 Q54 64 40 66 Q56 74 66 80 Q50 90 38 84" ${stroke}/>`
      );
    case 'miasma':
      return glyph(
        `<circle cx="34" cy="58" r="20" ${solid}/><circle cx="60" cy="46" r="24" ${solid}/><circle cx="72" cy="64" r="16" fill="${colors.edge}"/>`
      );
    case 'curse':
      return glyph(
        `<circle cx="50" cy="50" r="36" fill="none" stroke="${colors.core}" stroke-width="7"/><path d="M32 34 L68 66 M68 34 L32 66" fill="none" stroke="${colors.edge}" stroke-width="9" stroke-linecap="round"/>`
      );
    case 'heal':
      return glyph(`<path d="M40 12 H60 V40 H88 V60 H60 V88 H40 V60 H12 V40 H40 Z" ${solid}/>`);
    case 'aura':
      return glyph(`<path d="M50 8 L86 24 V52 Q86 80 50 94 Q14 80 14 52 V24 Z" ${solid}/>`);
    case 'barrier':
      return glyph(
        `<path d="M50 8 L86 30 V70 L50 92 L14 70 V30 Z" fill="none" stroke="${colors.core}" stroke-width="8"/><path d="M50 30 L68 40 V60 L50 70 L32 60 V40 Z" fill="${colors.edge}"/>`
      );
    case 'beam':
      return glyph(`<path d="M6 44 H70 V56 H6 Z" ${solid}/><path d="M70 30 L96 50 L70 70 Z" fill="${colors.edge}"/>`);
    case 'drain':
      return glyph(`<path d="M50 10 Q78 44 78 62 Q78 88 50 88 Q22 88 22 62 Q22 44 50 10 Z" ${solid}/>`);
    case 'warp':
      return glyph(
        `<ellipse cx="50" cy="50" rx="42" ry="18" fill="none" stroke="${colors.core}" stroke-width="8"/><ellipse cx="50" cy="50" rx="18" ry="42" fill="none" stroke="${colors.edge}" stroke-width="8"/>`
      );
    case 'gravity':
      return glyph(
        `<circle cx="50" cy="50" r="18" ${solid}/><path d="M50 6 L58 26 H42 Z M50 94 L42 74 H58 Z M6 50 L26 42 V58 Z M94 50 L74 58 V42 Z" fill="${colors.edge}"/>`
      );
    default:
      return glyph(`<circle cx="50" cy="50" r="30" ${solid}/>`);
  }
});

function glyph(body: string): string {
  return svg(body);
}
