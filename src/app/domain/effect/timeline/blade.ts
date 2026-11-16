import { type SlashStyle } from '@axe/domain/effect/effect-kind';
import {
  blank,
  clamp01,
  easeOutCubic,
  type EffectSprite,
  normalize,
  type Point3,
} from '@axe/domain/effect/timeline/shared';

/*
 * A blade: the line each form of a cut falls along, which the scene's cuts and the blows of a cut
 * keep to, and the cleaving of a piece's own picture in two, which is laid over the table where the
 * piece is drawn.
 */

const BISECT_PIECE_SCALE = 0.7;
/** How tall the picture that is cleaved is drawn, against the size the effect is drawn at: as tall as a piece of one cell stands. */
export const BISECT_PICTURE_HEIGHT = BISECT_PIECE_SCALE * 2;
/** The two halves the cut makes, each keeping one side of the picture. */
const BISECT_HALVES = [
  { key: 'upper', side: 1, drop: 0.3, clip: 'polygon(-40% -40%, 140% -110%, 140% 40%, -40% 110%)' },
  { key: 'lower', side: -1, drop: 1.5, clip: 'polygon(-40% 110%, 140% 40%, 140% 140%, -40% 140%)' },
];
/**
 * How far through the playback the stroke has passed through and the halves part: just as the piece
 * itself has faded from the table, once the stop the blow lands in has been held.
 */
export const BISECT_CUT_END = 0.11;
/** How the cut is turned on the screen, in degrees. */
export const BISECT_ANGLE = -28;
/** The blade of a cut, whose strokes, angle and reach follow its form. */
export interface SlashHit {
  /** How far through the playback the cut falls. */
  at: number;
  /** How much of it one stroke takes. */
  span: number;
  /** How far the way the blade travels is tipped from level, in degrees: below nothing it rises, and past 64 either way it comes straight down or up. */
  angle: number;
  thickness: number;
  offsetX: number;
  offsetY: number;
  reach: number;
  /** How far the stroke is turned about the upright from straight across its caster's sight, in degrees; unturned without it. */
  yaw?: number;
  /** How far the ends of its arc are lifted off the level as they bow back, in degrees; level without it. */
  lift?: number;
}

/** Where through a stroke its blade crosses the target, as a share of the stroke. */
const CROSSES_AT = 0.3;
/** How much of the playback one stroke is counted to take. */
const STROKE_SPAN = 0.1;

/**
 * Where through the playback each form crosses its target, set to the sounds they are bundled with:
 * a single stroke as its swish peaks; a sweep as its long rush breaks; a cleave at the crash its
 * gathering climbs to; and a drawing cut as the blade clicks home in its sheath, long after the draw.
 */
const SINGLE_CROSSES = 0.115;
const SWEEP_CROSSES = 0.2055;
const CLEAVE_CROSSES = 0.3945;
const IAI_OPENS = 0.394;
/** Where through the playback a drawing cut is drawn: at once, the line it leaves waiting for the wound to open. */
export const SLASH_IAI_DRAWN_AT = 0.042;
/** Where each stroke of a flurry crosses: four quick ones, uneven as a hand is, and a last one after a breath. */
const COMBO_CROSSES = [0.0553, 0.118, 0.2065, 0.2692, 0.3761];
/** Where through the playback every cut a flurry left opens at once. */
export const SLASH_COMBO_OPENS_AT = 0.424;
/** How each stroke of a flurry is tipped and turned, where across and up the target it crosses, and how far its arc is lifted: no two alike. */
const COMBO_STROKES: readonly (readonly [
  angle: number,
  yaw: number,
  offsetX: number,
  offsetY: number,
  lift: number,
])[] = [
  [30, 0, -0.14, 0.1, 30],
  [-42, 216, 0.16, -0.08, 12],
  [8, -72, 0.04, 0.16, 52],
  [-58, 144, -0.1, -0.12, 20],
  [62, 72, 0, 0, 36],
];

/** A stroke that crosses its target a share of the way through the playback. */
function strokeAt(crosses: number, fields: Omit<SlashHit, 'at' | 'span'>): SlashHit {
  return { at: crosses - STROKE_SPAN * CROSSES_AT, span: STROKE_SPAN, ...fields };
}

/**
 * The line of each form.
 * A drawing cut is an instant, a stillness and a wound; a cleave comes from straight above; a sweep
 * goes wide across; a flurry is five strokes, each from its own side, the last the heaviest.
 */
export function slashHits(style: SlashStyle): SlashHit[] {
  switch (style) {
    case 'combo':
      return COMBO_CROSSES.map((crosses, index) => {
        const [angle, yaw, offsetX, offsetY, lift] = COMBO_STROKES[index];
        const last = index === COMBO_CROSSES.length - 1;
        return strokeAt(crosses, {
          angle,
          yaw,
          lift,
          thickness: last ? 34 : 20,
          offsetX,
          offsetY,
          reach: last ? 3.2 : 2.4,
        });
      });
    case 'iai':
      // The wound opening: the line itself was drawn long before, thin and nearly level.
      return [strokeAt(IAI_OPENS, { angle: 5, thickness: 8, offsetX: 0, offsetY: 0, reach: 6.4 })];
    case 'wide':
      // The sweep: wide across, and thick.
      return [strokeAt(SWEEP_CROSSES, { angle: 8, thickness: 46, offsetX: 0, offsetY: 0, reach: 4 })];
    case 'heavy':
      // The cleave, brought down from straight above.
      return [strokeAt(CLEAVE_CROSSES, { angle: 88, thickness: 42, offsetX: 0, offsetY: 0, reach: 3.4 })];
    default:
      return [strokeAt(SINGLE_CROSSES, { angle: 26, thickness: 33, offsetX: 0, offsetY: 0, reach: 4 })];
  }
}

/**
 * The cleaving of a piece's own picture: once the stroke has passed, the picture parts along the
 * cut, the two halves sliding opposite ways and fading. Nothing for a piece with no picture.
 */
export function appendBisect(
  sprites: EffectSprite[],
  prefix: string,
  center: Point3,
  base: number,
  progress: number,
  image: string
): void {
  const after = clamp01(normalize((progress - BISECT_CUT_END) / (1 - BISECT_CUT_END)));
  if (after <= 0 || image.length < 1) return;
  const body = { x: center.x, y: center.y, z: center.z + base * BISECT_PIECE_SCALE };
  const piece = base * BISECT_PIECE_SCALE;
  const radians = (BISECT_ANGLE * Math.PI) / 180;
  // The direction across the cut, along which the two halves open.
  const acrossX = -Math.sin(radians);
  const acrossY = Math.cos(radians);
  const slide = easeOutCubic(after);
  const fade = 1 - clamp01((after - 0.55) / 0.45);

  // The upper and the lower half, parted at the cut and slid opposite ways.
  for (const half of BISECT_HALVES) {
    sprites.push({
      ...blank(),
      key: `${prefix}-bisect-${half.key}`,
      x: body.x,
      y: body.y,
      z: body.z,
      offsetX: acrossX * half.side * piece * slide * 0.9 + half.side * piece * slide * 0.25,
      offsetY: acrossY * half.side * piece * slide * 0.9 + piece * slide * slide * half.drop,
      width: piece * 2,
      height: piece * 2,
      rotate: half.side * slide * 7,
      opacity: fade,
      background: `url(${image}) center bottom/contain no-repeat`,
      clipPath: half.clip,
    });
  }
}
