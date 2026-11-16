import { substanceBands, type SwordPaint } from '@axe/domain/effect/scene/blade/sword-paint';
import { type SwordPose, upBlade } from '@axe/domain/effect/scene/blade/sword-pose';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import type { Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { glow, lightningPaths, type Point, smokePuff } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';
import { dressWindBlade } from '@axe/domain/effect/scene/wind/wind-sword';

/*
 * The blade of light that stands on a great sword: a towering blade grown up from the sword's guard,
 * broad over the guard and drawn to a point far overhead, white-hot at its heart and of its element
 * at its edge, shimmering as its substance runs up it, in a column of radiance that streaks of light
 * race up; and what its element hangs about it: flames
 * licking up off a blade of fire, flakes and mist sinking off one of ice, lightning crawling over
 * one of thunder, grit crumbling off the stone edge of one of earth, black flames and
 * smoke about one of shadow, stars twinkling about one of light, and wind wound up one of wind.
 */

/** How wide the blade is along it, from the guard to its point, against its width. */
const SHAPE: readonly (readonly [along: number, wide: number])[] = [
  [0, 0.46],
  [0.04, 0.8],
  [0.12, 1],
  [0.28, 0.98],
  [0.48, 0.9],
  [0.66, 0.76],
  [0.8, 0.57],
  [0.91, 0.34],
  [1, 0],
];

/** How many streaks of light race up the radiance about the blade. */
const RISING_STREAKS = 14;

/** How the blade of light is at a moment. */
export interface LightBladeLook {
  /** How far it has grown, from nothing at 0 to its whole height at 1. */
  readonly grown: number;
  readonly alpha: number;
  readonly seconds: number;
  readonly seed: number;
  /** Where along it a glint runs, from the guard at 0 to its point at 1; none outside that. */
  readonly glint: number;
}

/** How wide the blade of light is a share of the way up it, in table pixels. */
export function bladeWidthAt(pose: SwordPose, grown: number, share: number): number {
  const wide = pose.broad * (0.3 + 0.7 * grown);
  for (let index = 1; index < SHAPE.length; index++) {
    const [to, wideTo] = SHAPE[index];
    if (share > to) continue;
    const [from, wideFrom] = SHAPE[index - 1];
    return wide * (wideFrom + ((wideTo - wideFrom) * (share - from)) / (to - from));
  }
  return 0;
}

/** Draws the blade of light standing on the sword along a way of length one; see the head of this file. */
export function drawLightBlade(
  drawn: Staged,
  pose: SwordPose,
  paint: SwordPaint,
  heading: Point,
  look: LightBladeLook
): void {
  const { grown, alpha, seconds } = look;
  if (grown <= 0.01 || alpha <= 0.01) return;
  const U = pose.cell;
  const shimmer = 1 + 0.05 * Math.sin(seconds * 31) + 0.03 * Math.sin(seconds * 53);
  const points = SHAPE.map(([share]) => upBlade(pose, heading, share * grown));
  const widths = SHAPE.map(([share]) => bladeWidthAt(pose, grown, share) * shimmer);
  const dark = paint.element === 'dark';
  drawn.ribbons.push({
    points: [0, 0.5, 1, 1.45].map((share) => upBlade(pose, heading, share * grown)),
    widths: [pose.broad * 2.2, pose.broad * 3, pose.broad * 2.6, pose.broad * 1.6].map((wide) => wide * grown),
    color: paint.halo,
    alpha: (dark ? 0.4 : 0.36) * alpha,
    alphas: [0.7, 1, 0.7, 0],
    blend: dark ? 'color' : 'light',
    soft: 1,
  });
  for (let index = 0; index < RISING_STREAKS; index++) {
    const cycle = (seconds * (0.9 + 0.6 * scatter(index, look.seed + 21)) + scatter(index, look.seed + 22)) % 1;
    const out = (scatter(index, look.seed + 23) * 2 - 1) * pose.broad * 1.1;
    const at = upBlade(pose, heading, cycle * 1.3 * grown);
    const pace = pose.tall * 1.2;
    drawn.motes.push({
      ...glow(
        { x: at.x - pose.way.y * out, y: at.y + pose.way.x * out, z: at.z },
        U * 0.07,
        index % 2 === 0 ? paint.spark : paint.sheath,
        Math.min(1, cycle * 5, (1 - cycle) * 3) * alpha * grown,
        U * 0.4
      ),
      shape: 'spark',
      velocity: { x: heading.x * pace, y: heading.y * pace, z: heading.z * pace },
      trail: 0.06,
    });
  }
  drawn.ribbons.push(...substanceBands(points, widths, paint, { alpha, torn: 0.3, flowed: -seconds * 2.4 }));
  if (look.glint > 0 && look.glint < 1) {
    const lit = Math.sin(Math.PI * look.glint);
    const white = paint.element === 'dark' ? paint.rim : '#ffffff';
    drawn.ribbons.push({
      points: [
        upBlade(pose, heading, Math.max(0, look.glint - 0.09) * grown),
        upBlade(pose, heading, look.glint * grown),
        upBlade(pose, heading, Math.min(1, look.glint + 0.09) * grown),
      ],
      widths: [0, bladeWidthAt(pose, grown, look.glint) * 1.5, 0],
      color: white,
      alpha: 0.9 * lit * alpha,
      blend: 'light',
      soft: 0.8,
    });
    drawn.motes.push({
      ...glow(upBlade(pose, heading, look.glint * grown), U * 1.3 * lit, white, alpha * lit, U * 0.5),
      shape: 'star',
      spin: look.glint * 3,
    });
  }
  dressBlade(drawn, pose, paint, heading, look);
}

/** What the blade's element hangs about it; see the head of this file. */
function dressBlade(drawn: Staged, pose: SwordPose, paint: SwordPaint, heading: Point, look: LightBladeLook): void {
  const { grown, seconds: t, seed } = look;
  const U = pose.cell;
  const alpha = look.alpha * Math.min(1, grown * 2);
  const forward = U * 0.4;
  const side = { x: -pose.way.y, y: pose.way.x };
  const beside = (share: number, out: number, along = 0): Point => {
    const at = upBlade(pose, heading, share * grown);
    return { x: at.x + side.x * out + pose.way.x * along, y: at.y + side.y * out + pose.way.y * along, z: at.z };
  };
  const each = (count: number, every: number, draw: (index: number, age: number, share: number) => void) => {
    for (let index = 0; index < count; index++) {
      const age = (t / every + scatter(index, seed + 3)) % 1;
      draw(index, age, 0.04 + scatter(index, seed + 5) * 0.86);
    }
  };
  const seen = (age: number) => Math.min(1, age * 5, (1 - age) * 2.5) * alpha;
  const wide = (share: number) => bladeWidthAt(pose, grown, share);
  switch (paint.element) {
    case 'fire':
      each(18, 0.55, (index, age, share) => {
        const out = (index % 2 === 0 ? 1 : -1) * wide(share) * 0.42;
        const lean = { x: side.x * out * 0.012 + heading.x, y: side.y * out * 0.012 + heading.y, z: heading.z + 0.45 };
        drawn.motes.push(
          flowingMote(
            'lick',
            beside(share + age * 0.08, out),
            lean,
            U * (0.3 + 0.14 * (index % 3)) * (1 - 0.4 * age),
            U * (0.7 + 0.6 * age),
            t * 3 + index,
            {
              color: index % 3 === 0 ? paint.body : paint.sheath,
              core: index % 3 === 0 ? paint.inner : paint.body,
              alpha: seen(age),
              forward,
              variant: index,
            }
          )
        );
      });
      return;
    case 'ice':
      each(16, 1.3, (index, age, share) => {
        const out = (scatter(index, 9) * 2 - 1) * (wide(share) * 0.7 + U * 0.5 * age);
        const at = beside(share, out, (scatter(index, 11) - 0.5) * U * 0.3);
        drawn.motes.push({
          ...glow(
            { ...at, z: at.z - U * 0.9 * age },
            U * (0.12 + 0.07 * (index % 3)),
            index % 2 === 0 ? '#ffffff' : paint.body,
            seen(age),
            forward
          ),
          blend: 'color',
          shape: 'flake',
          spin: t * (2 + (index % 3)) + index,
          variant: index,
        });
      });
      each(6, 1.7, (index, age, share) => {
        const out = (index % 2 === 0 ? 1 : -1) * wide(share) * 0.5;
        drawn.motes.push(
          flowingMote(
            'wisp',
            beside(share, out),
            { x: side.x * out, y: side.y * out, z: -U * 0.8 },
            U * 0.5,
            U * (0.6 + 0.8 * age),
            t * 1.4 + index,
            { color: mixColor(paint.body, '#ffffff', 0.5), alpha: 0.4 * seen(age), forward, variant: index }
          )
        );
      });
      return;
    case 'thunder': {
      const flicker = Math.floor(t * 18);
      for (let crackle = 0; crackle < 4; crackle++) {
        const from = 0.03 + scatter(flicker * 7 + crackle, seed) * 0.6;
        const reach = 0.22 + 0.2 * scatter(flicker + crackle, 3);
        const leaps = crackle === 3 && flicker % 2 === 0;
        const out = (crackle % 2 === 0 ? 1 : -1) * wide(from) * 0.55;
        const to = leaps
          ? beside(from + 0.1, out * 4 + Math.sign(out) * U * 0.7)
          : beside(Math.min(1, from + reach), -out * 0.9);
        const { main } = lightningPaths(beside(from, out), to, seed + crackle, flicker, {
          bends: 7,
          jag: leaps ? 0.22 : 0.16,
          forks: 0,
        });
        drawn.ribbons.push(
          { points: main, widths: U * 0.2, color: paint.sheath, alpha: 0.45 * alpha, blend: 'light', soft: 1 },
          { points: main, widths: U * 0.07, color: paint.body, core: '#ffffff', alpha, blend: 'color' }
        );
      }
      return;
    }
    case 'earth':
      each(14, 0.9, (index, age, share) => {
        const at = beside(share, (scatter(index, 9) * 2 - 1) * wide(share) * 0.55);
        drawn.motes.push({
          x: at.x,
          y: at.y,
          z: at.z - U * 1.5 * age * age,
          size: U * (0.07 + 0.05 * (index % 3)),
          color: index % 2 === 0 ? paint.ramp[1] : '#5b4a3c',
          alpha: Math.min(1, (1 - age) * 3) * alpha,
          blend: 'color',
          shape: 'chunk',
          spin: t * 9 + index,
          variant: index,
          forward,
        });
      });
      return;
    case 'wind':
      dressWindBlade(drawn, pose, paint, heading, look, wide);
      return;
    case 'dark':
      each(14, 0.8, (index, age, share) => {
        const out = (index % 2 === 0 ? 1 : -1) * wide(share) * 0.4;
        drawn.motes.push(
          flowingMote(
            'lick',
            beside(share + age * 0.06, out),
            { x: side.x * out * 0.012 + heading.x, y: side.y * out * 0.012 + heading.y, z: heading.z + 0.4 },
            U * (0.3 + 0.12 * (index % 3)) * (1 - 0.4 * age),
            U * (0.7 + 0.7 * age),
            t * 2.4 + index,
            { color: paint.sheath, core: paint.inner, alpha: seen(age), forward, variant: index }
          )
        );
      });
      each(8, 1.6, (index, age, share) => {
        const at = beside(share, (scatter(index, 9) * 2 - 1) * (wide(share) * 0.6 + U * 0.3 * age));
        drawn.motes.push(
          smokePuff({ ...at, z: at.z - U * 0.7 * age }, U * (0.4 + 0.4 * age), paint.inner, 0.5 * seen(age), forward)
        );
      });
      return;
    default:
      each(14, 1.1, (index, age, share) => {
        const at = beside(share, (scatter(index, 9) * 2 - 1) * (wide(share) * 0.8 + U * 0.35));
        drawn.motes.push({
          ...glow(
            { ...at, z: at.z + U * 0.4 * age },
            U * (0.22 + 0.2 * scatter(index, 13)) * Math.sin(Math.PI * age),
            '#ffffff',
            seen(age),
            forward
          ),
          shape: 'star',
          spin: t * 2 + index,
        });
      });
  }
}
