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

const BISECT_PIECE_SCALE = 0.62;
/** How tall the picture that is cleaved is drawn, against the size the effect is drawn at. */
export const BISECT_PICTURE_HEIGHT = BISECT_PIECE_SCALE * 2;
/** The two halves the cut makes, each keeping one side of the picture. */
const BISECT_HALVES = [
  { key: 'upper', side: 1, drop: 0.3, clip: 'polygon(-40% -40%, 140% -110%, 140% 40%, -40% 110%)' },
  { key: 'lower', side: -1, drop: 1.5, clip: 'polygon(-40% 110%, 140% 40%, 140% 140%, -40% 140%)' },
];
/** How long the stroke takes to pass through. */
const BISECT_CUT_END = 0.22;
const BISECT_ANGLE = -28;
/** The blade of a cut, whose strokes, angle and reach follow its form. */
export interface SlashHit {
  /** How far through the playback the cut falls. */
  at: number;
  /** How much of it one stroke takes. */
  span: number;
  angle: number;
  thickness: number;
  offsetX: number;
  offsetY: number;
  reach: number;
}

const SLASH_ANGLES = [-46, 34, -18, 52, -8, 26];
const SLASH_SHIFTS = [-0.34, 0.3, 0.12, -0.26, 0.36, -0.12];
/** Where the gathering ends and the cut falls. */
const SLASH_CHARGE_END = 0.42;
/** Where a drawing cut flashes. Nothing happens before it. */
const SLASH_IAI_AT = 0.55;

/**
 * The line of each form.
 * A drawing cut is stillness, an instant and a wound; a cleave comes from straight above; a sweep goes wide across.
 */
export function slashHits(style: SlashStyle): SlashHit[] {
  switch (style) {
    case 'combo': {
      const span = 0.3;
      const step = (1 - span) / 4;
      return Array.from({ length: 5 }, (_unused, index) => ({
        at: step * index,
        span,
        angle: SLASH_ANGLES[index % SLASH_ANGLES.length],
        thickness: 18,
        offsetX: SLASH_SHIFTS[index % SLASH_SHIFTS.length],
        offsetY: SLASH_SHIFTS[(index + 2) % SLASH_SHIFTS.length] * 0.6,
        reach: 2.2,
      }));
    }
    case 'iai':
      // The instant of the draw: one long thin line, nearly level.
      return [{ at: SLASH_IAI_AT, span: 0.1, angle: -6, thickness: 8, offsetX: 0, offsetY: 0, reach: 5.4 }];
    case 'wide':
      // The sweep: wide across, and thick.
      return [{ at: SLASH_CHARGE_END, span: 0.34, angle: -14, thickness: 46, offsetX: 0, offsetY: 0, reach: 5 }];
    case 'heavy':
      // The cleave, brought down from straight above.
      return [{ at: SLASH_CHARGE_END, span: 0.26, angle: -88, thickness: 42, offsetX: 0, offsetY: -0.35, reach: 4.2 }];
    default:
      return [{ at: 0, span: 0.85, angle: -46, thickness: 28, offsetX: 0, offsetY: 0, reach: 3 }];
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
  const body = { x: center.x, y: center.y, z: center.z + base * 0.9 };
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
      background: `url(${image}) center/contain no-repeat`,
      clipPath: half.clip,
    });
  }
}
