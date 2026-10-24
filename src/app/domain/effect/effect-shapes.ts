import { PERF_SVG_BUILD, perfCounters } from '@axe/core/util/perf-counters';

/**
 * Builds the shapes of the effects as drawings.
 *
 * Each is drawn in a square box and sized by the sprite that carries it.
 * The text then does not change with the elapsed time, so nothing is rewritten every
 * frame and the animation on the inner layer does not rewind.
 */

export interface ShapeColors {
  core: string;
  edge: string;
}

const VIEW_BOX = 'viewBox="0 0 100 100" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg"';
const VIEW_BOX_UNIFORM = 'viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg"';

function svg(body: string, uniform = false): string {
  perfCounters.bump(PERF_SVG_BUILD);
  return `<svg ${uniform ? VIEW_BOX_UNIFORM : VIEW_BOX} width="100%" height="100%">${body}</svg>`;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Two definitions of an identifier on one page leave the first in use for both.
 * A short hash of the colour is appended, so two effects fired at once are not mistaken for each other.
 */
function idOf(kind: string, colors: ShapeColors): string {
  const source = `${kind}${colors.core}${colors.edge}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index++) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `${kind}${(hash >>> 0).toString(36)}`;
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

/** The blade of a cut: a crescent pointed at both ends and thick in the middle, which reads as a stroke where a straight bar does not. */
export const crescentSvg = remembered<[colors: ShapeColors, thickness?: number]>(
  'crescentSvg',
  (colors, thickness = 26): string => {
    const id = idOf('c', colors);
    const belly = 50 + thickness / 2;
    const back = 50 - thickness / 2;
    const path =
      `M2 50 Q30 ${round(100 - belly)} 50 ${round(100 - belly)} Q70 ${round(100 - belly)} 98 50` +
      ` Q70 ${round(100 - back)} 50 ${round(100 - back)} Q30 ${round(100 - back)} 2 50 Z`;
    return svg(
      `<defs><linearGradient id="${id}" x1="0" x2="1"><stop offset="0" stop-color="${colors.edge}" stop-opacity="0"/>` +
        `<stop offset="0.32" stop-color="${colors.edge}"/><stop offset="0.5" stop-color="#ffffff"/>` +
        `<stop offset="0.68" stop-color="${colors.core}"/><stop offset="1" stop-color="${colors.core}" stop-opacity="0"/>` +
        `</linearGradient></defs><path d="${path}" fill="url(#${id})"/>`
    );
  }
);

/** The ring of a shock wave, drawn as a line so its edge stays sharp however large it grows. */
export const ringSvg = remembered<[colors: ShapeColors, thickness?: number, dashed?: boolean]>(
  'ringSvg',
  (colors, thickness = 5, dashed = false): string => {
    const radius = 50 - thickness;
    const dash = dashed ? ` stroke-dasharray="${round(radius * 0.32)} ${round(radius * 0.16)}"` : '';
    return svg(
      `<circle cx="50" cy="50" r="${round(radius)}" fill="none" stroke="${colors.edge}"` +
        ` stroke-width="${round(thickness * 1.8)}" stroke-opacity="0.45"${dash}/>` +
        `<circle cx="50" cy="50" r="${round(radius)}" fill="none" stroke="#ffffff"` +
        ` stroke-width="${round(thickness * 0.6)}"${dash}/>`,
      true
    );
  }
);

/** The circle laid at the feet, which is what makes healing and strengthening feel as though they are working. */
export const magicCircleSvg = remembered('magicCircleSvg', (colors: ShapeColors): string => {
  const ticks: string[] = [];
  for (let tick = 0; tick < 12; tick++) {
    const angle = (tick / 12) * Math.PI * 2;
    const inner = 34;
    const outer = 42;
    ticks.push(
      `<line x1="${round(50 + Math.cos(angle) * inner)}" y1="${round(50 + Math.sin(angle) * inner)}"` +
        ` x2="${round(50 + Math.cos(angle) * outer)}" y2="${round(50 + Math.sin(angle) * outer)}"` +
        ` stroke="${colors.core}" stroke-width="2.4" stroke-linecap="round"/>`
    );
  }
  const triangle: string[] = [];
  for (let vertex = 0; vertex < 3; vertex++) {
    const angle = (vertex / 3) * Math.PI * 2 - Math.PI / 2;
    triangle.push(`${round(50 + Math.cos(angle) * 26)},${round(50 + Math.sin(angle) * 26)}`);
  }
  return svg(
    `<circle cx="50" cy="50" r="46" fill="none" stroke="${colors.edge}" stroke-width="2"/>` +
      `<circle cx="50" cy="50" r="31" fill="none" stroke="${colors.core}" stroke-width="1.6" stroke-opacity="0.8"/>` +
      `<polygon points="${triangle.join(' ')}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.85"/>` +
      ticks.join(''),
    true
  );
});

/** A crystal of ice branching six ways, which reads as ice where a square plate does not. */
export const snowflakeSvg = remembered('snowflakeSvg', (colors: ShapeColors): string => {
  const arms: string[] = [];
  for (let arm = 0; arm < 6; arm++) {
    const angle = (arm / 6) * Math.PI * 2;
    const tipX = 50 + Math.cos(angle) * 46;
    const tipY = 50 + Math.sin(angle) * 46;
    arms.push(`<line x1="50" y1="50" x2="${round(tipX)}" y2="${round(tipY)}" stroke="#ffffff" stroke-width="6"/>`);

    for (const at of [0.5, 0.74]) {
      const baseX = 50 + Math.cos(angle) * 46 * at;
      const baseY = 50 + Math.sin(angle) * 46 * at;
      for (const side of [-1, 1]) {
        const branch = angle + side * 0.9;
        arms.push(
          `<line x1="${round(baseX)}" y1="${round(baseY)}"` +
            ` x2="${round(baseX + Math.cos(branch) * 14)}" y2="${round(baseY + Math.sin(branch) * 14)}"` +
            ` stroke="${colors.core}" stroke-width="4" stroke-linecap="round"/>`
        );
      }
    }
  }
  return svg(
    `<g stroke-linecap="round">${arms.join('')}</g><circle cx="50" cy="50" r="7" fill="${colors.edge}"/>`,
    true
  );
});

/** The whirl of a tornado, two spirals of different weights laid over each other for depth. */
export const spiralSvg = remembered<[colors: ShapeColors, turns?: number]>('spiralSvg', (colors, turns = 3): string => {
  const build = (offset: number): string => {
    const points: string[] = [];
    const steps = 64;
    for (let step = 0; step <= steps; step++) {
      const along = step / steps;
      const angle = along * Math.PI * 2 * turns + offset;
      const radius = 6 + along * 42;
      points.push(`${round(50 + Math.cos(angle) * radius)} ${round(50 + Math.sin(angle) * radius * 0.55)}`);
    }
    return `M${points.join(' L')}`;
  };
  return svg(
    `<path d="${build(0)}" fill="none" stroke="${colors.edge}" stroke-width="7" stroke-opacity="0.4" stroke-linecap="round"/>` +
      `<path d="${build(0)}" fill="none" stroke="${colors.core}" stroke-width="3" stroke-linecap="round"/>` +
      `<path d="${build(Math.PI)}" fill="none" stroke="#ffffff" stroke-width="1.6" stroke-opacity="0.75" stroke-linecap="round"/>`,
    true
  );
});

/** The cracks running out from where it landed, broken rather than straight so the ground reads as split. */
export const crackSvg = remembered<[colors: ShapeColors, spokes?: number, jitter?: readonly number[]]>(
  'crackSvg',
  (colors, spokes = 8, jitter = []): string => {
    const paths: string[] = [];
    for (let spoke = 0; spoke < spokes; spoke++) {
      const angle = (spoke / spokes) * Math.PI * 2;
      const wobble = ((jitter[spoke] ?? 0.5) - 0.5) * 0.5;
      const points = [
        `M50 50`,
        `L${round(50 + Math.cos(angle) * 18)} ${round(50 + Math.sin(angle) * 18)}`,
        `L${round(50 + Math.cos(angle + wobble) * 32)} ${round(50 + Math.sin(angle + wobble) * 32)}`,
        `L${round(50 + Math.cos(angle - wobble * 0.6) * 48)} ${round(50 + Math.sin(angle - wobble * 0.6) * 48)}`,
      ];
      paths.push(
        `<path d="${points.join(' ')}" fill="none" stroke="${colors.edge}" stroke-width="4" stroke-opacity="0.5" stroke-linecap="round"/>` +
          `<path d="${points.join(' ')}" fill="none" stroke="${colors.core}" stroke-width="1.8" stroke-linecap="round"/>`
      );
    }
    return svg(paths.join(''), true);
  }
);

/** A billow of mist, whose outline reads as cloud where a single circle does not. */
export const cloudSvg = remembered('cloudSvg', (colors: ShapeColors): string => {
  const id = idOf('f', colors);
  const lobes = [
    [32, 58, 24],
    [52, 46, 28],
    [72, 60, 22],
    [46, 68, 22],
    [62, 34, 18],
  ];
  const body = lobes
    .map(([cx, cy, r]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${colors.core}" fill-opacity="0.5"/>`)
    .join('');
  return svg(
    `<defs><radialGradient id="${id}"><stop offset="0" stop-color="${colors.core}"/>` +
      `<stop offset="1" stop-color="${colors.edge}" stop-opacity="0"/></radialGradient></defs>` +
      `<circle cx="50" cy="52" r="46" fill="url(#${id})" fill-opacity="0.55"/>${body}`,
    true
  );
});

/** The spikes of ice or of force that rise from the ground. */
export const spikeSvg = remembered('spikeSvg', (colors: ShapeColors): string => {
  const id = idOf('s', colors);
  return svg(
    `<defs><linearGradient id="${id}" x1="0" y1="1" x2="0" y2="0">` +
      `<stop offset="0" stop-color="${colors.edge}"/><stop offset="0.55" stop-color="${colors.core}"/>` +
      `<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
      `<polygon points="50,0 78,46 62,100 38,100 22,46" fill="url(#${id})"/>` +
      `<polygon points="50,6 62,46 54,96 46,96" fill="#ffffff" fill-opacity="0.55"/>`
  );
});

/** An arrow, drawn pointing right and turned to where it flies on the board. */
export const arrowSvg = remembered('arrowSvg', (colors: ShapeColors): string => {
  return svg(
    // The fletching, the shaft and the head, outlined darkly so it reads as a thing.
    `<polygon points="2,26 22,44 22,56 2,74" fill="${colors.edge}"/>` +
      `<polygon points="10,32 26,46 26,54 10,68" fill="${colors.core}" fill-opacity="0.75"/>` +
      `<rect x="20" y="45" width="56" height="10" fill="${colors.edge}"/>` +
      `<rect x="20" y="45" width="56" height="4" fill="${colors.core}" fill-opacity="0.65"/>` +
      `<polygon points="70,34 99,50 70,66 76,50" fill="${colors.core}"/>` +
      `<polygon points="70,34 99,50 70,50" fill="#ffffff" fill-opacity="0.55"/>`
  );
});

/** A bullet and its tracer, pointed at the front and drawn out thinly behind. */
export const bulletSvg = remembered('bulletSvg', (colors: ShapeColors): string => {
  return svg(
    `<defs><linearGradient id="${idOf('b', colors)}" x1="0" x2="1">` +
      `<stop offset="0" stop-color="${colors.edge}" stop-opacity="0"/>` +
      `<stop offset="0.62" stop-color="${colors.edge}" stop-opacity="0.75"/>` +
      `<stop offset="1" stop-color="${colors.core}"/></linearGradient></defs>` +
      `<rect x="0" y="44" width="72" height="12" fill="url(#${idOf('b', colors)})"/>` +
      `<path d="M66 40 L88 44 Q99 50 88 56 L66 60 Z" fill="${colors.core}"/>` +
      `<path d="M70 43 L88 46 Q95 50 88 50 L70 50 Z" fill="#ffffff" fill-opacity="0.6"/>`
  );
});

/**
 * The blade of a flying cut: a crescent pointed at both ends, its belly forward.
 * The crescent used for a cut is a flat lens, which looks crushed in a square box.
 */
export const flyingCrescentSvg = remembered('flyingCrescentSvg', (colors: ShapeColors): string => {
  const id = idOf('f', colors);
  return svg(
    `<defs><linearGradient id="${id}" x1="0" x2="1">` +
      `<stop offset="0" stop-color="${colors.edge}" stop-opacity="0.35"/>` +
      `<stop offset="0.55" stop-color="${colors.core}"/>` +
      `<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
      `<path d="M22 6 Q94 50 22 94 Q58 50 22 6 Z" fill="url(#${id})"/>` +
      `<path d="M30 20 Q78 50 30 80 Q52 50 30 20 Z" fill="#ffffff" fill-opacity="0.5"/>`
  );
});

/** A blaster bolt: a short streak, white at the core and sheathed in colour. */
export const blasterSvg = remembered('blasterSvg', (colors: ShapeColors): string => {
  return svg(
    `<defs><linearGradient id="${idOf('l', colors)}" x1="0" x2="1">` +
      `<stop offset="0" stop-color="${colors.edge}" stop-opacity="0"/>` +
      `<stop offset="0.35" stop-color="${colors.edge}" stop-opacity="0.85"/>` +
      `<stop offset="1" stop-color="${colors.core}"/></linearGradient></defs>` +
      `<rect x="6" y="38" width="88" height="24" rx="12" fill="url(#${idOf('l', colors)})"/>` +
      `<rect x="18" y="44" width="76" height="12" rx="6" fill="${colors.core}"/>` +
      `<rect x="30" y="47" width="62" height="6" rx="3" fill="#ffffff"/>`
  );
});

/** A sniper's tracer: one long thin streak, burning white at the tip alone. */
export const tracerSvg = remembered('tracerSvg', (colors: ShapeColors): string => {
  return svg(
    `<defs><linearGradient id="${idOf('t', colors)}" x1="0" x2="1">` +
      `<stop offset="0" stop-color="${colors.edge}" stop-opacity="0"/>` +
      `<stop offset="0.8" stop-color="${colors.core}" stop-opacity="0.9"/>` +
      `<stop offset="1" stop-color="#ffffff"/></linearGradient></defs>` +
      `<rect x="0" y="48.5" width="100" height="3" rx="1.5" fill="url(#${idOf('t', colors)})"/>` +
      `<circle cx="96" cy="50" r="3.5" fill="#ffffff" fill-opacity="0.95"/>`
  );
});

/**
 * A small missile, drawn pointing right.
 *
 * A straight pointed head, a squared body and swept fins. They are fired in numbers, so
 * each is drawn with wider fins and a heavier outline than a guided one.
 */
export const missileSvg = remembered('missileSvg', (colors: ShapeColors): string => {
  return svg(
    `<polygon points="36,40 22,12 14,12 26,40" fill="${colors.edge}" fill-opacity="0.85"/>` +
      `<polygon points="36,60 22,88 14,88 26,60" fill="${colors.edge}" fill-opacity="0.85"/>` +
      `<polygon points="70,38 98,50 70,62" fill="${colors.core}"/>` +
      `<rect x="16" y="40" width="56" height="20" rx="4" fill="${colors.edge}"/>` +
      `<rect x="20" y="43" width="48" height="6" rx="3" fill="#ffffff" fill-opacity="0.4"/>` +
      `<polygon points="70,43 90,50 70,57" fill="#ffffff" fill-opacity="0.55"/>` +
      `<rect x="8" y="42" width="10" height="16" rx="2" fill="${colors.core}" fill-opacity="0.9"/>`
  );
});

/**
 * A guided missile, drawn pointing right.
 *
 * A real one is a twelfth as thick as it is long, with very small wings seen from the side.
 * It is thickened enough to read, and its wings kept small so it is not an aircraft.
 */
export const cruiseSvg = remembered('cruiseSvg', (colors: ShapeColors): string => {
  return svg(
    // The wings and the fins, small and swept.
    `<polygon points="58,39 47,23 41,23 50,39" fill="${colors.edge}" fill-opacity="0.85"/>` +
      `<polygon points="58,61 47,77 41,77 50,61" fill="${colors.edge}" fill-opacity="0.85"/>` +
      `<polygon points="26,39 18,21 13,21 20,39" fill="${colors.edge}"/>` +
      `<polygon points="26,61 18,79 13,79 20,61" fill="${colors.edge}"/>` +
      // The head, the body and the tail.
      `<polygon points="76,39 100,50 76,61" fill="${colors.core}"/>` +
      `<polygon points="14,39 76,39 76,61 14,61 10,50" fill="${colors.edge}"/>` +
      `<rect x="18" y="42" width="54" height="5" rx="2.5" fill="#ffffff" fill-opacity="0.4"/>` +
      `<rect x="34" y="53" width="30" height="2.5" rx="1.25" fill="#ffffff" fill-opacity="0.28"/>` +
      `<polygon points="76,43 92,50 76,57" fill="#ffffff" fill-opacity="0.55"/>` +
      // The nozzle.
      `<rect x="4" y="43" width="10" height="14" rx="2" fill="${colors.core}" fill-opacity="0.9"/>`
  );
});

/** The exhaust: the flame drawn out thinly behind a missile. */
export const thrustSvg = remembered('thrustSvg', (colors: ShapeColors): string => {
  const id = idOf('h', colors);
  return svg(
    `<defs><linearGradient id="${id}" x1="1" x2="0">` +
      `<stop offset="0" stop-color="#ffffff"/>` +
      `<stop offset="0.35" stop-color="${colors.core}"/>` +
      `<stop offset="1" stop-color="${colors.edge}" stop-opacity="0"/></linearGradient></defs>` +
      `<path d="M100 50 L30 34 Q0 50 30 66 Z" fill="url(#${id})"/>`
  );
});

/** A shield of hexagonal cells, through which the pieces behind can be seen. */
export const barrierSvg = remembered('barrierSvg', (colors: ShapeColors): string => {
  const cells: string[] = [];
  for (let row = 0; row < 5; row++) {
    for (let column = 0; column < 5; column++) {
      const x = 12 + column * 19 + (row % 2 === 0 ? 0 : 9.5);
      const y = 12 + row * 19;
      if (Math.hypot(x - 50, y - 50) > 42) continue;
      cells.push(
        `<polygon points="${round(x)},${round(y - 9)} ${round(x + 8)},${round(y - 4.5)} ${round(x + 8)},${round(y + 4.5)}` +
          ` ${round(x)},${round(y + 9)} ${round(x - 8)},${round(y + 4.5)} ${round(x - 8)},${round(y - 4.5)}"` +
          ` fill="${colors.core}" fill-opacity="0.12" stroke="${colors.core}" stroke-width="0.8" stroke-opacity="0.5"/>`
      );
    }
  }
  return svg(
    `<circle cx="50" cy="50" r="47" fill="none" stroke="${colors.edge}" stroke-width="2.5"/>` +
      `<circle cx="50" cy="50" r="47" fill="${colors.core}" fill-opacity="0.08"/>` +
      cells.join(''),
    true
  );
});

/** The arrows falling inwards under gravity, which show the pull towards the centre. */
export const gravitySvg = remembered('gravitySvg', (colors: ShapeColors): string => {
  const arrows: string[] = [];
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    const tipX = 50 + Math.cos(angle) * 22;
    const tipY = 50 + Math.sin(angle) * 22;
    const baseX = 50 + Math.cos(angle) * 46;
    const baseY = 50 + Math.sin(angle) * 46;
    const wing = angle + Math.PI / 2;
    arrows.push(
      `<polygon points="${round(tipX)},${round(tipY)}` +
        ` ${round(baseX + Math.cos(wing) * 5)},${round(baseY + Math.sin(wing) * 5)}` +
        ` ${round(baseX - Math.cos(wing) * 5)},${round(baseY - Math.sin(wing) * 5)}"` +
        ` fill="${colors.core}" fill-opacity="0.8"/>`
    );
  }
  return svg(`<circle cx="50" cy="50" r="14" fill="${colors.edge}" fill-opacity="0.7"/>${arrows.join('')}`, true);
});

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
  return svg(body, true);
}

/** The star of a landed blow, whose jagged outline is what reads as a crushing. */
export const impactStarSvg = remembered<[colors: ShapeColors, points?: number]>(
  'impactStarSvg',
  (colors, points = 12): string => {
    const outer: string[] = [];
    const inner: string[] = [];
    for (let index = 0; index < points * 2; index++) {
      const angle = (index / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      // Alternating the outer and inner radius makes it jagged, and mixing the lengths keeps it from looking machined.
      const long = index % 2 === 0;
      const radius = long ? (index % 4 === 0 ? 49 : 41) : 20;
      outer.push(`${round(50 + Math.cos(angle) * radius)},${round(50 + Math.sin(angle) * radius)}`);
      inner.push(`${round(50 + Math.cos(angle) * radius * 0.55)},${round(50 + Math.sin(angle) * radius * 0.55)}`);
    }
    const id = idOf('i', colors);
    return svg(
      `<defs><radialGradient id="${id}"><stop offset="0" stop-color="#ffffff"/>` +
        `<stop offset="0.45" stop-color="${colors.core}"/><stop offset="1" stop-color="${colors.edge}"/></radialGradient></defs>` +
        `<polygon points="${outer.join(' ')}" fill="url(#${id})"/>` +
        `<polygon points="${inner.join(' ')}" fill="#ffffff" fill-opacity="0.85"/>`,
      true
    );
  }
);

/**
 * The cone of a breath, one shape widening from the mouth to the tip.
 *
 * Split into sections, the differences in width and density between them show as seams.
 * Drawn as one there can be no seam. The edges are softened by a mask across it and the
 * density thinned from the mouth outwards by a gradient along it.
 */
export const breathConeSvg = remembered<[colors: ShapeColors, ripple?: number]>(
  'breathConeSvg',
  (colors, ripple = 0): string => {
    const id = idOf('bc', colors) + (ripple > 0 ? String(ripple) : '');
    // The top and the bottom waver differently, so it is not a neat symmetrical triangle.
    const top = [46, 37.5, 28, 20.5, 11, 4].map((y, index) => y + Math.sin(index * 1.7 + ripple) * 2.4);
    const bottom = [54, 63.5, 71, 80.5, 89, 96].map((y, index) => y - Math.sin(index * 2.3 + ripple) * 2.4);
    const step = 100 / (top.length - 1);

    const edge = (points: number[], forward: boolean): string =>
      points
        .slice(1)
        .map((y, index) => {
          const from = points[index];
          const x0 = step * (forward ? index : points.length - 1 - index);
          const x1 = step * (forward ? index + 1 : points.length - 2 - index);
          const bulge = (from + y) / 2 + (forward ? -1.8 : 1.8);
          return `Q${round((x0 + x1) / 2)},${round(bulge)} ${round(x1)},${round(y)}`;
        })
        .join('');

    const path =
      `M0,${round(top[0])}` +
      edge(top, true) +
      // The tip is not cut off but swells outwards and unravels.
      `Q106,50 ${round(100)},${round(bottom[bottom.length - 1])}` +
      edge([...bottom].reverse(), false) +
      'Z';

    return svg(
      `<defs>` +
        `<linearGradient id="${id}f" x1="0" y1="0" x2="1" y2="0">` +
        `<stop offset="0" stop-color="#ffffff" stop-opacity="0.95"/>` +
        `<stop offset="0.22" stop-color="${colors.core}" stop-opacity="0.9"/>` +
        `<stop offset="0.68" stop-color="${colors.edge}" stop-opacity="0.66"/>` +
        `<stop offset="1" stop-color="${colors.edge}" stop-opacity="0"/>` +
        `</linearGradient>` +
        `<linearGradient id="${id}m" x1="0" y1="0" x2="0" y2="1">` +
        `<stop offset="0" stop-color="#000000"/>` +
        `<stop offset="0.26" stop-color="#ffffff"/>` +
        `<stop offset="0.74" stop-color="#ffffff"/>` +
        `<stop offset="1" stop-color="#000000"/>` +
        `</linearGradient>` +
        `<mask id="${id}k"><rect width="100" height="100" fill="url(#${id}m)"/></mask>` +
        `</defs>` +
        `<path d="${path}" fill="url(#${id}f)" mask="url(#${id}k)"/>`
    );
  }
);

/** The speed lines drawn out from the point of the blow, which carry the force. */
export const speedLinesSvg = remembered<[colors: ShapeColors, count?: number]>(
  'speedLinesSvg',
  (colors, count = 14): string => {
    const lines: string[] = [];
    for (let index = 0; index < count; index++) {
      const angle = (index / count) * Math.PI * 2;
      const inner = 26 + (index % 3) * 5;
      const outer = 50;
      const width = index % 2 === 0 ? 3.4 : 1.8;
      lines.push(
        `<line x1="${round(50 + Math.cos(angle) * inner)}" y1="${round(50 + Math.sin(angle) * inner)}"` +
          ` x2="${round(50 + Math.cos(angle) * outer)}" y2="${round(50 + Math.sin(angle) * outer)}"` +
          ` stroke="${index % 2 === 0 ? colors.core : colors.edge}" stroke-width="${width}" stroke-linecap="round"/>`
      );
    }
    return svg(lines.join(''), true);
  }
);

/** Lightning: one unbroken line from the sky to the ground, with its branches, gathered into a single shape. */
export const boltSvg = remembered(
  'boltSvg',
  (
    boxWidth: number,
    boxHeight: number,
    spread: number,
    strokeWidth: number,
    channelJitter: readonly number[],
    branchSeeds: readonly number[],
    colors: ShapeColors
  ): string => {
    const segments = channelJitter.length - 1;
    const channel: { x: number; y: number }[] = [];
    for (let point = 0; point <= segments; point++) {
      const along = point / segments;
      const taper = Math.sin(along * Math.PI);
      channel.push({ x: boxWidth / 2 + (channelJitter[point] - 0.5) * spread * 2 * taper, y: boxHeight * along });
    }

    let path = polyline(channel);
    const branches = Math.floor(branchSeeds.length / 2);
    for (let branch = 0; branch < branches; branch++) {
      const origin = channel[2 + branch * 2];
      if (!origin) continue;
      const side = branch % 2 === 0 ? 1 : -1;
      const reach = strokeWidth * (6 + branchSeeds[branch * 2] * 7);
      const drop = strokeWidth * (5 + branchSeeds[branch * 2 + 1] * 6);
      path += polyline([
        origin,
        { x: origin.x + side * reach * 0.6, y: origin.y + drop * 0.5 },
        { x: origin.x + side * reach * 1.1, y: origin.y + drop * 1.5 },
      ]);
    }

    const strokes = [
      { color: colors.edge, width: strokeWidth * 3.4, opacity: 0.35 },
      { color: colors.core, width: strokeWidth * 1.6, opacity: 0.75 },
      { color: '#ffffff', width: strokeWidth * 0.6, opacity: 1 },
    ];
    const layers = strokes
      .map(
        (stroke) =>
          `<path d="${path}" fill="none" stroke="${stroke.color}" stroke-width="${round(stroke.width)}"` +
          ` stroke-opacity="${stroke.opacity}" stroke-linecap="round" stroke-linejoin="round"/>`
      )
      .join('');

    return (
      `<svg viewBox="0 0 ${round(boxWidth)} ${round(boxHeight)}" width="100%" height="100%"` +
      ` xmlns="http://www.w3.org/2000/svg">${layers}</svg>`
    );
  }
);

function polyline(points: readonly { x: number; y: number }[]): string {
  return points.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(' ') + ' ';
}
