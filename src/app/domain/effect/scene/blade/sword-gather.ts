import type { SwordPaint } from '@axe/domain/effect/scene/blade/sword-paint';
import { type SwordPose, upBlade } from '@axe/domain/effect/scene/blade/sword-pose';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import type { EffectMoteShape } from '@axe/domain/effect/scene/effect-scene';
import { floorMark, glow, type Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * Light gathering on a raised sword. The scene dims a little about its wielder; the floor under them
 * lights, rings of light closing in over it; a low wind of light winds in about their feet; and
 * motes of the sword's element are drawn in from all about and up off the ground, each curving in to
 * the blade and gone into it, faster and thicker as the blade fills.
 */

/** How far the scene is dimmed about the wielder, in cells, and how dark. */
const DIMMED_CELLS = 7;
const DIMMED = 0.34;
/** How many motes are drawn in to the blade at once, and how many more rise off the ground. */
const DRAWN_IN = 46;
const RISING = 18;
/** How many bands of wind wind in about the wielder's feet, and how many points each is drawn through. */
const WINDS = 3;
const WIND_POINTS = 12;
/** How many rings close in over the floor at once. */
const RINGS = 3;

const DARK = '#04050a';

/** The shape one mote in three of what is drawn in takes, by the sword's element; the rest are sparks. */
const OWN_SHAPE: Record<SwordPaint['element'], EffectMoteShape> = {
  light: 'star',
  fire: 'tongue',
  ice: 'flake',
  thunder: 'spark',
  earth: 'chunk',
  dark: 'smoke',
  wind: 'chunk',
};

/** How the gathering is at a moment. */
export interface GatherLook {
  /** How far the light has gathered, from 0 to 1, and how much of it is still drawn, as it fades once the blade is let go. */
  readonly gathered: number;
  readonly alpha: number;
  /** How far up the blade of light has grown, from 0 to 1: what is drawn in is drawn to the blade as it stands. */
  readonly grown: number;
  /** Whether everything hangs still, as it does in the beat before the swing. */
  readonly hangs: boolean;
  readonly seconds: number;
  readonly seed: number;
}

/** The floor about the wielder as light gathers: dimmed, lit under them, and rings of light closing in. */
export function layGatherGround(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: GatherLook): void {
  const { gathered, alpha, seconds: t } = look;
  if (alpha <= 0.01) return;
  const U = pose.cell;
  const floor = { x: pose.foot.x, y: pose.foot.y, z: pose.floorZ };
  const dark = paint.element === 'dark';
  drawn.floor.push(
    floorMark('disc', floor, U * DIMMED_CELLS, 1, DARK, DIMMED * alpha * Math.min(1, gathered * 3), 'color', 0)
  );
  const lit = alpha * gathered;
  drawn.floor.push(
    floorMark(
      'disc',
      floor,
      U * (1.3 + 1.5 * gathered),
      1,
      paint.halo,
      (dark ? 0.5 : 0.3) * lit,
      dark ? 'color' : 'light',
      0
    )
  );
  drawn.floor.push(
    floorMark('disc', floor, U * (0.5 + 0.6 * gathered), 1, dark ? paint.rim : paint.inner, 0.45 * lit, 'light', 0)
  );
  if (look.hangs) return;
  for (let ring = 0; ring < RINGS; ring++) {
    const closing = (t * (0.7 + 0.5 * gathered) + ring / RINGS) % 1;
    const radius = U * (3.1 - 2.7 * closing);
    const seen = Math.min(1, closing * 4) * (1 - closing) * lit;
    drawn.floor.push(floorMark('ring', floor, radius, 0.09, paint.sheath, 0.55 * seen, 'color', 0));
    drawn.floor.push(floorMark('ring', floor, radius, 0.04, dark ? paint.rim : paint.inner, 0.9 * seen, 'light', 0));
  }
}

/** The wind of light that winds in about the wielder's feet, low over the floor. */
export function drawGatherWind(drawn: Staged, pose: SwordPose, paint: SwordPaint, look: GatherLook): void {
  const { gathered, seconds: t } = look;
  const alpha = look.alpha * Math.min(1, gathered * 2.5);
  if (alpha <= 0.01) return;
  const U = pose.cell;
  for (let wind = 0; wind < WINDS; wind++) {
    const from = (Math.PI * 2 * wind) / WINDS + t * (3 + 2 * gathered) + (look.seed % 7);
    const points: Point[] = [];
    const widths: number[] = [];
    const alphas: number[] = [];
    for (let index = 0; index <= WIND_POINTS; index++) {
      const share = index / WIND_POINTS;
      const turn = from + share * 2.6;
      const out = U * (2.7 - 2.3 * share) * (0.75 + 0.25 * gathered);
      points.push({
        x: pose.foot.x + Math.cos(turn) * out,
        y: pose.foot.y + Math.sin(turn) * out,
        z: pose.floorZ + U * (0.08 + 0.5 * share * share),
      });
      widths.push(U * 0.26 * Math.sin(Math.PI * Math.pow(share, 0.7)));
      alphas.push(Math.sin(Math.PI * share));
    }
    drawn.ribbons.push(
      {
        points,
        widths: widths.map((width) => width * 2.2),
        color: paint.halo,
        alpha: 0.28 * alpha,
        alphas,
        blend: paint.element === 'dark' ? 'color' : 'light',
        soft: 1,
      },
      {
        points,
        widths,
        color: paint.sheath,
        core: paint.inner,
        alpha: 0.75 * alpha,
        alphas,
        blend: 'color',
        torn: 0.45,
        soft: 0.5,
        flowed: t * 4 + wind * 3,
      }
    );
  }
}

/** The motes drawn in to the blade from all about, and those that rise off the ground under it. */
export function drawGatherMotes(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  heading: Point,
  look: GatherLook
): void {
  const { gathered, seconds: t, seed } = look;
  const alpha = look.alpha * Math.min(1, gathered * 4);
  if (alpha <= 0.01) return;
  const U = pose.cell;
  const forward = U * 0.4;
  const pace = 0.55 + 0.75 * gathered;
  for (let index = 0; index < DRAWN_IN; index++) {
    const cycle = (t * pace * (0.7 + 0.6 * scatter(index, seed + 1)) + scatter(index, seed + 2)) % 1;
    const drawnIn = Math.pow(cycle, 1.7);
    const turn = scatter(index, seed + 3) * Math.PI * 2 + drawnIn * 1.5;
    const out = U * (1.7 + 2.6 * scatter(index, seed + 4)) * (1 - drawnIn);
    const to = upBlade(pose, heading, (0.05 + 0.8 * scatter(index, seed + 5)) * Math.max(0.15, look.grown));
    const low = pose.floorZ + U * (0.1 + 1.6 * scatter(index, seed + 6));
    const at = {
      x: to.x + Math.cos(turn) * out,
      y: to.y + Math.sin(turn) * out,
      z: low + (to.z - low) * Math.pow(drawnIn, 0.8),
    };
    const speed = U * (2 + 7 * cycle) * pace;
    const lift = (to.z - low) / Math.max(out, U * 0.4);
    const seen = Math.min(1, cycle * 5) * (1 - Math.pow(cycle, 8)) * alpha;
    const own = index % 3 === 0 && paint.element !== 'thunder';
    const base = glow(at, U * (own ? 0.16 : 0.065), index % 2 === 0 ? paint.spark : paint.body, seen, forward);
    drawn.motes.push(
      own
        ? {
            ...base,
            blend: paint.element === 'light' ? 'light' : 'color',
            shape: OWN_SHAPE[paint.element],
            spin: t * 5 + index,
            variant: index,
            color: ownColor(paint, index),
            velocity: { x: 0, y: 0, z: U * 0.6 },
            trail: 0.2,
          }
        : {
            ...base,
            shape: 'spark',
            velocity: { x: -Math.cos(turn) * speed, y: -Math.sin(turn) * speed, z: lift * speed },
            trail: look.hangs ? 0.012 : 0.05,
          }
    );
  }
  for (let index = 0; index < RISING; index++) {
    const cycle = (t * 0.8 + scatter(index, seed + 8)) % 1;
    const turn = scatter(index, seed + 9) * Math.PI * 2;
    const out = U * (0.5 + 1.5 * scatter(index, seed + 10)) * (1 - 0.5 * cycle);
    const at = {
      x: pose.foot.x + Math.cos(turn) * out,
      y: pose.foot.y + Math.sin(turn) * out,
      z: pose.floorZ + U * (0.05 + 1.9 * cycle),
    };
    const seen = Math.min(1, cycle * 5, (1 - cycle) * 2) * alpha;
    drawn.motes.push(
      glow(at, U * (0.07 + 0.05 * (index % 3)), index % 2 === 0 ? paint.spark : paint.sheath, seen, forward)
    );
  }
}

/** The colour of a mote of the sword's own substance. */
function ownColor(paint: SwordPaint, index: number): string {
  switch (paint.element) {
    case 'fire':
      return index % 2 === 0 ? paint.body : paint.sheath;
    case 'ice':
      return index % 2 === 0 ? '#ffffff' : paint.body;
    case 'earth':
      return index % 2 === 0 ? paint.ramp[1] : '#5b4a3c';
    case 'dark':
      return paint.inner;
    case 'wind':
      return index % 2 === 0 ? '#9fc45a' : '#c98a4c';
    default:
      return '#ffffff';
  }
}
