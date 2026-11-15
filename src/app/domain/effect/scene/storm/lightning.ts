import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { acrossOf, hueOf, lerpPoint, lightningPaths, type Point, wayBetween } from '@axe/domain/effect/scene/parts';

/**
 * A bolt of lightning between two points as bands: a pale light about it, the bolt white-hot, and its
 * forks thinner, none of it below the floor it strikes.
 */
export function lightningRibbons(
  from: Point,
  to: Point,
  seed: number,
  flicker: number,
  cell: number,
  ramp: readonly string[],
  alpha: number,
  floorZ: number,
  thick = 1
): EffectRibbon[] {
  const { main, forks } = lightningPaths(from, to, seed, flicker, { floorZ: floorZ + cell * 0.05 });
  const ribbons: EffectRibbon[] = [
    { points: main, widths: cell * 0.7 * thick, color: hueOf(ramp), alpha: 0.3 * alpha, blend: 'color' },
    { points: main, widths: cell * 0.5 * thick, color: hueOf(ramp), alpha: 0.45 * alpha, blend: 'light' },
    { points: main, widths: cell * 0.16 * thick, color: ramp[3], core: '#ffffff', alpha, blend: 'light' },
    { points: main, widths: cell * 0.05 * thick, color: '#ffffff', alpha, blend: 'color' },
  ];
  for (const fork of forks) {
    ribbons.push({
      points: fork,
      widths: [cell * 0.07 * thick, cell * 0.05 * thick, 0],
      color: ramp[4],
      core: '#ffffff',
      alpha: 0.8 * alpha,
      blend: 'light',
    });
  }
  return ribbons;
}

/** A bolt of lightning laid out: its trunk from where it leaves to where it strikes, and the forks off it, each from the trunk outward. */
export interface BoltShape {
  readonly main: Point[];
  readonly forks: Point[][];
}

/** How a bolt is laid out; see {@link boltShape}. */
export interface BoltLayout {
  /** How far its first bend is thrown aside, as a share of its length; each bend between is thrown half as far again. */
  readonly jag?: number;
  /** How many times its line is broken in two: 5 makes a trunk of 32 strokes. */
  readonly breaks?: number;
  /** How many forks it throws of its own, each a share of the way down it and reaching on the way it runs. */
  readonly forks?: number;
  /** How long its own forks are, as a share of its length, at the most, and how many times each is broken in two. */
  readonly forkReach?: number;
  readonly forkBreaks?: number;
  /** Points it throws a fork to each, as the pieces standing near where it strikes. */
  readonly reaches?: readonly Point[];
  /** How high the floor is: nothing of it is thrown below. */
  readonly floorZ?: number;
}

/**
 * Lays a bolt of lightning out between two points: a trunk broken in two again and again, each break
 * thrown aside half as far as the one before, so it is jagged at every size as lightning is; forks
 * leaving it at a slant the way it runs, each jagged as it is and sinking towards the floor; and a
 * fork thrown to each point it is given to reach for, leaving the trunk far enough up it to come down
 * on the point at a slant. `flicker` picks among the shapes the same bolt takes, so it can be made to
 * strike again along another path.
 */
export function boltShape(from: Point, to: Point, seed: number, flicker: number, layout: BoltLayout = {}): BoltShape {
  const next = seededRun(seed * 977 + flicker * 131 + 7);
  const floorZ = layout.floorZ ?? Number.NEGATIVE_INFINITY;
  const { way, length } = wayBetween(from, to);
  const { side, lift } = acrossOf(way);
  const aside = (point: Point, reach: number): Point => {
    const a = (next() - 0.5) * 2 * reach;
    const b = (next() - 0.5) * 2 * reach;
    return {
      x: point.x + side.x * a + lift.x * b,
      y: point.y + side.y * a + lift.y * b,
      z: Math.max(floorZ, point.z + side.z * a + lift.z * b),
    };
  };
  const jagged = (start: Point, end: Point, breaks: number, reach: number): Point[] => {
    let points = [start, end];
    let thrown = reach;
    for (let level = 0; level < breaks; level++) {
      const broken = [points[0]];
      for (let index = 1; index < points.length; index++) {
        broken.push(aside(lerpPoint(points[index - 1], points[index], 0.5), thrown), points[index]);
      }
      points = broken;
      thrown *= 0.5;
    }
    return points;
  };
  const main = jagged(from, to, layout.breaks ?? 5, length * (layout.jag ?? 0.1));
  const last = main.length - 1;
  const forks: Point[][] = [];
  for (let fork = 0; fork < (layout.forks ?? 0); fork++) {
    const at = Math.min(last - 1, 2 + Math.floor(next() * (last - 3)));
    const start = main[at];
    const turn = next() * Math.PI * 2;
    const out = {
      x: side.x * Math.cos(turn) + lift.x * Math.sin(turn),
      y: side.y * Math.cos(turn) + lift.y * Math.sin(turn),
    };
    const reach = length * (layout.forkReach ?? 0.3) * (0.45 + 0.55 * next()) * (1 - (0.5 * at) / last);
    const end = {
      x: start.x + (way.x * 0.7 + out.x * 0.7) * reach,
      y: start.y + (way.y * 0.7 + out.y * 0.7) * reach,
      z: Math.max(
        floorZ,
        start.z + way.z * 0.7 * reach - Math.abs(lift.z * Math.sin(turn)) * reach * 0.3 - reach * 0.2
      ),
    };
    forks.push(jagged(start, end, layout.forkBreaks ?? 3, reach * 0.16));
  }
  for (const reach of layout.reaches ?? []) {
    const far = Math.hypot(reach.x - to.x, reach.y - to.y, reach.z - to.z);
    const at = Math.max(1, Math.min(last - 1, Math.round(last * (1 - Math.min(0.8, (far * 1.1) / length)))));
    forks.push(jagged(main[at], reach, 4, far * 0.12));
  }
  return { main, forks };
}

/** The first share of a line of points, for a bolt still on its way: at least its first stroke. */
export function partOf(points: readonly Point[], share: number): Point[] {
  const until = Math.max(1, Math.min(points.length - 1, Math.round((points.length - 1) * share)));
  return points.slice(0, until + 1);
}

/** The dark of the sky about a bolt, laid under its light so that it reads on a bright floor. */
const BOLT_SHADOW = '#150a33';

/**
 * A bolt laid out by {@link boltShape} as bands: a soft dark sheath under it, which keeps it on a
 * bright table where light alone would wash out; a sheath of its colour; the bolt itself as light,
 * white at its heart; and a hard white core. Its trunk thins from where it leaves to where it
 * strikes, and its forks thin to nothing, growing less than the trunk does as the bolt grows heavy. `thick` is how heavy a bolt it is, where 1 is a bolt out of
 * the sky a cell wide with its sheath, and `tip` how much of its width the trunk keeps where it ends:
 * a bolt that strikes keeps half of it, and one that crawls out and dies away thins to a point.
 */
export function boltRibbons(
  shape: BoltShape,
  cell: number,
  ramp: readonly string[],
  alpha: number,
  thick = 1,
  tip = 0.55
): EffectRibbon[] {
  const shown = Math.max(0, alpha);
  if (shown <= 0) return [];
  const dark = mixColor(ramp[0], BOLT_SHADOW, 0.6);
  const hue = hueOf(ramp);
  const U = cell * thick;
  const taper = shape.main.map((_point, index) => 1 - ((1 - tip) * index) / Math.max(1, shape.main.length - 1));
  const widthsOf = (wide: number) => taper.map((share) => U * wide * share);
  const ribbons: EffectRibbon[] = [
    { points: shape.main, widths: widthsOf(1.05), color: dark, alpha: 0.85 * shown * shown, blend: 'color', soft: 0.6 },
    { points: shape.main, widths: widthsOf(0.58), color: hue, alpha: 0.95 * shown, blend: 'color', soft: 0.35 },
    { points: shape.main, widths: widthsOf(0.34), color: ramp[4], core: '#ffffff', alpha: shown, blend: 'light' },
    { points: shape.main, widths: widthsOf(0.13), color: '#ffffff', alpha: shown, blend: 'color' },
  ];
  const F = cell * Math.min(thick, Math.sqrt(thick));
  for (const fork of shape.forks) {
    const thins = fork.map((_point, index) => 1 - index / Math.max(1, fork.length - 1));
    ribbons.push(
      {
        points: fork,
        widths: thins.map((share) => F * (0.14 + 0.5 * share)),
        color: dark,
        alpha: 0.75 * shown * shown,
        blend: 'color',
        soft: 0.6,
      },
      {
        points: fork,
        widths: thins.map((share) => F * (0.045 + 0.17 * share)),
        color: ramp[4],
        core: '#ffffff',
        alpha: 0.9 * shown,
        blend: 'light',
      },
      {
        points: fork,
        widths: thins.map((share) => F * (0.018 + 0.07 * share)),
        color: '#ffffff',
        alpha: 0.9 * shown,
        blend: 'color',
      }
    );
  }
  return ribbons;
}

/**
 * The path a bolt burnt through the air, left glowing after it for a moment: a thin line of its
 * colour, laid over what is behind it so that it shows on a bright table, fading as `left` falls
 * from 1 to nothing.
 */
export function boltAfterimage(
  shape: BoltShape,
  cell: number,
  ramp: readonly string[],
  left: number,
  thick = 1
): EffectRibbon[] {
  if (left <= 0) return [];
  const hue = hueOf(ramp);
  const ribbons: EffectRibbon[] = [
    { points: shape.main, widths: cell * 0.24 * thick, color: hue, alpha: 0.8 * left, blend: 'color', soft: 0.6 },
    { points: shape.main, widths: cell * 0.08 * thick, color: ramp[4], alpha: 0.9 * left, blend: 'color' },
  ];
  for (const fork of shape.forks) {
    ribbons.push({ points: fork, widths: cell * 0.07 * thick, color: hue, alpha: 0.6 * left, blend: 'color' });
  }
  return ribbons;
}
