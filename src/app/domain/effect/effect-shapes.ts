import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';
import type { EffectPreset } from '@axe/domain/effect/effect-preset';

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
 * Every kind has a mark of its own, and a shot one for each look it may fly as, named by `look` as
 * {@link glyphLookOf} gives it.
 */
export const kindGlyphSvg = remembered('kindGlyphSvg', (kind: string, colors: ShapeColors, look?: string): string => {
  const stroke = `fill="none" stroke="${colors.core}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"`;
  const solid = `fill="${colors.core}"`;
  const edgeStroke = `fill="none" stroke="${colors.edge}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;

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
      return glyph(shotGlyphBody(look ?? '', colors));
    case 'nova':
      return glyph(
        `<circle cx="50" cy="50" r="15" fill="none" stroke="${colors.core}" stroke-width="8"/><path d="M50 4 V24 M50 76 V96 M4 50 H24 M76 50 H96 M17 17 L31 31 M69 69 L83 83 M83 17 L69 31 M31 69 L17 83" ${edgeStroke}/>`
      );
    case 'burst':
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
      return glyph(`<path d="M58 4 L26 52 L48 52 L40 96 L74 44 L52 44 Z" ${solid}/>`);
    case 'arc':
      return glyph(
        `<path d="M12 52 L30 30 L44 64 L58 34 L72 62 L88 46" ${stroke}/><circle cx="10" cy="54" r="8" fill="${colors.edge}"/><circle cx="90" cy="44" r="8" fill="${colors.edge}"/>`
      );
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
        `<circle cx="50" cy="50" r="14" ${solid}/><path d="M50 30 L60 8 H40 Z M50 70 L40 92 H60 Z M30 50 L8 40 V60 Z M70 50 L92 60 V40 Z" fill="${colors.edge}"/>`
      );
    case 'smite':
      return glyph(
        `<path d="M40 4 H60 L66 74 H34 Z" ${solid}/><ellipse cx="50" cy="82" rx="38" ry="10" fill="none" stroke="${colors.edge}" stroke-width="7"/>`
      );
    case 'halo':
      return glyph(
        `<ellipse cx="50" cy="50" rx="42" ry="17" fill="none" stroke="${colors.core}" stroke-width="9"/><path d="M50 18 L58 42 L82 50 L58 58 L50 82 L42 58 L18 50 L42 42 Z" fill="${colors.edge}"/>`
      );
    case 'sanctuary':
      return glyph(
        `<circle cx="50" cy="50" r="41" fill="none" stroke="${colors.core}" stroke-width="7"/><path d="M50 22 L78 50 L50 78 L22 50 Z M30 30 H70 V70 H30 Z" fill="none" stroke="${colors.edge}" stroke-width="6" stroke-linejoin="round"/>`
      );
    case 'shadow':
      return glyph(
        `<ellipse cx="50" cy="84" rx="42" ry="10" fill="${colors.edge}"/><path d="M22 84 L32 30 L42 84 Z M40 84 L52 6 L62 84 Z M60 84 L72 38 L80 84 Z" ${solid}/>`
      );
    case 'darkorb':
      return glyph(
        `<circle cx="50" cy="50" r="42" fill="none" stroke="${colors.edge}" stroke-width="7"/><circle cx="50" cy="50" r="27" ${solid}/>`
      );
    case 'quake':
      return glyph(
        `<path d="M6 30 L30 40 L24 54 L50 60 L44 74 L94 84" ${stroke}/><path d="M18 64 L40 70 L34 90 L10 84 Z M62 34 L86 44 L80 62 L56 52 Z" fill="${colors.edge}"/>`
      );
    case 'skyblade':
      return glyph(
        `<path d="M43 24 H57 V74 L50 94 L43 74 Z" ${solid}/><path d="M26 16 H74 V26 H26 Z M45 4 H55 V16 H45 Z" fill="${colors.edge}"/>`
      );
    case 'dissolve':
      return glyph(
        `<path d="M12 28 H42 V72 H12 Z" ${solid}/><path d="M50 32 h13 v13 h-13 Z M70 22 h10 v10 h-10 Z M54 56 h11 v11 h-11 Z M76 46 h9 v9 h-9 Z M68 72 h8 v8 h-8 Z M88 30 h6 v6 h-6 Z" fill="${colors.edge}"/>`
      );
    case 'gore':
      return glyph(
        `<path d="M38 14 Q62 46 62 62 Q62 84 38 84 Q14 84 14 62 Q14 46 38 14 Z" ${solid}/><circle cx="76" cy="28" r="9" fill="${colors.edge}"/><circle cx="86" cy="56" r="6" fill="${colors.edge}"/><circle cx="74" cy="80" r="7" fill="${colors.edge}"/>`
      );
    case 'bisect':
      return glyph(`<path d="M12 16 H68 L12 72 Z" ${solid}/><path d="M88 84 H32 L88 28 Z" fill="${colors.edge}"/>`);
    case 'raybeam':
      return glyph(
        `<path d="M8 18 L68 64" fill="none" stroke="${colors.core}" stroke-width="7" stroke-linecap="round"/><path d="M74 48 V92 M52 70 H96 M60 56 L88 84 M88 56 L60 84" fill="none" stroke="${colors.edge}" stroke-width="6" stroke-linecap="round"/>`
      );
    case 'arrowrain':
      return glyph(
        `<path d="M24 6 V58 M12 44 L24 60 L36 44 M76 10 V62 M64 48 L76 64 L88 48" ${stroke}/><path d="M50 30 V88 M37 72 L50 90 L63 72" fill="none" stroke="${colors.edge}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>`
      );
    case 'ballistic':
      return glyph(
        `<path d="M8 88 Q34 -8 66 52" fill="none" stroke="${colors.edge}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 13"/><path d="M56 54 L82 44 L84 86 Z" ${solid}/>`
      );
    default:
      return glyph(`<circle cx="50" cy="50" r="30" ${solid}/>`);
  }
});

/** What ends the look of a shot fired several at a time. */
const VOLLEY_MARK = '+';

/** The line a shot leaves behind it, drawn under whatever leads it. */
function shotTrail(colors: ShapeColors): string {
  return `<path d="M8 68 L48 46" fill="none" stroke="${colors.edge}" stroke-width="8" stroke-linecap="round"/>`;
}

/**
 * What leads a magical bolt, told by what it lands as: frost flies as a crystal, lightning as a
 * spark, rock as a stone and so on, and anything else as the glowing ball every bolt was.
 */
function boltHead(landing: string, colors: ShapeColors): string {
  const line = `fill="none" stroke="${colors.core}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"`;
  switch (landing) {
    case 'frost':
      return `<path d="M70 12 V56 M51 23 L89 45 M89 23 L51 45" ${line}/>`;
    case 'bolt':
    case 'arc':
      return `<path d="M78 8 L54 38 L70 38 L60 62 L90 28 L72 28 Z" fill="${colors.core}"/>`;
    case 'rubble':
    case 'upheaval':
      return `<path d="M52 30 L66 12 L88 20 L92 42 L74 56 L54 48 Z" fill="${colors.core}"/>`;
    case 'vortex':
      return `<path d="M88 34 Q88 14 70 14 Q52 14 52 32 Q52 46 66 46 Q76 46 76 36 Q76 30 70 30" ${line}/>`;
    case 'miasma':
    case 'curse':
      return `<circle cx="60" cy="38" r="13" fill="${colors.core}"/><circle cx="78" cy="28" r="15" fill="${colors.core}"/><circle cx="82" cy="46" r="10" fill="${colors.core}"/>`;
    case 'smite':
    case 'halo':
    case 'sanctuary':
      return `<path d="M70 6 L77 27 L98 34 L77 41 L70 62 L63 41 L42 34 L63 27 Z" fill="${colors.core}"/>`;
    case 'impact':
    case 'bash':
      return `<circle cx="70" cy="34" r="17" fill="none" stroke="${colors.core}" stroke-width="7"/><circle cx="70" cy="34" r="6" fill="${colors.core}"/>`;
    default:
      return `<circle cx="72" cy="34" r="15" fill="${colors.core}"/>`;
  }
}

/** One shot as it looks in flight, by the look the preset names; see {@link glyphLookOf}. */
function oneShotBody(style: string, landing: string, colors: ShapeColors): string {
  const solid = `fill="${colors.core}"`;
  const edge = `fill="${colors.edge}"`;
  const line = `fill="none" stroke="${colors.core}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"`;
  const edgeLine = `fill="none" stroke="${colors.edge}" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"`;
  switch (style) {
    case 'arrow':
      return `<path d="M14 86 L74 26" ${line}/><path d="M92 8 L84 40 L60 16 Z" ${solid}/><path d="M10 72 L26 72 M28 90 L28 74" ${edgeLine}/>`;
    case 'bullet':
      return `<path d="M36 34 H62 Q88 38 94 50 Q88 62 62 66 H36 Z" ${solid}/><path d="M8 40 H24 M4 50 H24 M8 60 H24" ${edgeLine}/>`;
    case 'crescent':
      return `<path d="M44 8 Q96 50 44 92 Q70 50 44 8 Z" ${solid}/><path d="M8 34 H30 M4 50 H34 M8 66 H30" ${edgeLine}/>`;
    case 'blaster':
      return `<path d="M12 64 L88 36" fill="none" stroke="${colors.edge}" stroke-width="22" stroke-linecap="round"/><path d="M14 63 L86 37" fill="none" stroke="${colors.core}" stroke-width="9" stroke-linecap="round"/>`;
    case 'tracer':
      return `<path d="M6 84 L52 46" ${edgeLine}/><circle cx="68" cy="32" r="20" fill="none" stroke="${colors.core}" stroke-width="7"/><path d="M68 4 V22 M68 42 V60 M40 32 H58 M78 32 H96" fill="none" stroke="${colors.core}" stroke-width="6" stroke-linecap="round"/>`;
    case 'missile':
      return `<path d="M30 38 H66 L92 50 L66 62 H30 Z" ${solid}/><path d="M30 38 L14 24 V76 L30 62 Z" ${edge}/>`;
    case 'cruise':
      return `<path d="M8 88 Q10 34 50 40" ${edgeLine}/><path d="M46 24 L92 40 L50 58 Z" ${solid}/>`;
    case 'meteor':
      return `<path d="M10 8 L78 50 L50 78 Z" ${edge}/><circle cx="68" cy="68" r="22" ${solid}/>`;
    default:
      return shotTrail(colors) + boltHead(landing, colors);
  }
}

/** A shot's mark: the one shot, and behind it a fainter second for a look fired several at a time. */
function shotGlyphBody(look: string, colors: ShapeColors): string {
  const volley = look.endsWith(VOLLEY_MARK);
  const [style = '', landing = ''] = (volley ? look.slice(0, -VOLLEY_MARK.length) : look).split(':');
  const one = oneShotBody(style, landing, colors);
  if (!volley) return one;
  return `<g transform="translate(-4 20) scale(0.72)" opacity="0.6">${one}</g><g transform="translate(18 -4) scale(0.82)">${one}</g>`;
}

/** What of a preset tells its mark from another's of the same kind. */
export type GlyphSource = Pick<EffectPreset, 'effectKind' | 'projectileLook' | 'impactKind' | 'shotCount'>;

/**
 * What tells one mark from another of the same kind, for {@link kindGlyphSvg}: a shot is told by
 * what flies, a magical bolt by what it lands as too, and one fired several at a time from one fired
 * alone. Empty for every other kind, each of which has one mark.
 */
export function glyphLookOf(preset: GlyphSource): string {
  if (preset.effectKind !== 'projectile') return '';
  const style = preset.projectileLook;
  const flies = style === 'bolt' ? `bolt:${preset.impactKind}` : style;
  return preset.shotCount > 1 ? flies + VOLLEY_MARK : flies;
}

/** The mark of a preset on a list, in its own colours: its kind's, and for a shot the one of what it fires. */
export function presetGlyphSvg(preset: GlyphSource & Pick<EffectPreset, 'colorPrimary' | 'colorSecondary'>): string {
  return kindGlyphSvg(
    preset.effectKind,
    { core: preset.colorPrimary, edge: preset.colorSecondary },
    glyphLookOf(preset)
  );
}

function glyph(body: string): string {
  return svg(body);
}
