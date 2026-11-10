import type { EffectMote, EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { acrossOf, glow, haze, hueOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The things that fly, drawn as what they are, whatever look flies them: an arrow, with its wooden
 * shaft, its iron head and its feathers; and a missile, with its pale body, its coloured nose, its
 * fins and the flame of its motor. Each is laid along the way it flies, nose first, as long as the
 * cell it is drawn at says.
 */

const SHAFT = '#7a5532';
const HEAD = '#c9ced6';
const HEAD_RIM = '#4a4f57';
const FEATHER = '#f2ece0';
const BODY = '#e8ebef';
const BODY_SHADE = '#8d939b';

/** A point a way back from a tip along the way it flies, and aside or up from that line. */
function along(tip: Point, way: Point, back: number, aside = 0, side: Point = { x: 0, y: 0, z: 0 }): Point {
  return {
    x: tip.x - way.x * back + side.x * aside,
    y: tip.y - way.y * back + side.y * aside,
    z: tip.z - way.z * back + side.z * aside,
  };
}

/**
 * An arrow flying, its head at `tip` and pointing the way it flies: a streak of light behind it, the
 * shaft, a head wider than the shaft and drawn to a point, and feathers flaring at the tail.
 */
export function arrowBody(
  tip: Point,
  way: Point,
  cell: number,
  ramp: readonly string[],
  streak = true
): EffectRibbon[] {
  const long = cell * 1.1;
  const ribbons: EffectRibbon[] = [];
  if (streak) {
    ribbons.push({
      points: [along(tip, way, long * 2.6), along(tip, way, long * 0.9)],
      widths: [0, cell * 0.14],
      color: hueOf(ramp),
      core: ramp[4],
      alpha: 0.75,
      blend: 'light',
    });
  }
  // The feathers: two vanes flaring out of the shaft at its tail.
  ribbons.push({
    points: [along(tip, way, long), along(tip, way, long * 0.92), along(tip, way, long * 0.72)],
    widths: [cell * 0.2, cell * 0.24, 0],
    color: FEATHER,
    alpha: 1,
    blend: 'color',
  });
  ribbons.push({
    points: [along(tip, way, long * 0.97), along(tip, way, long * 0.78)],
    widths: [cell * 0.05, cell * 0.03],
    color: hueOf(ramp),
    alpha: 1,
    blend: 'color',
  });
  // The shaft, dark-rimmed.
  ribbons.push({
    points: [along(tip, way, long * 0.96), along(tip, way, cell * 0.14)],
    widths: cell * 0.075,
    color: '#3a2716',
    alpha: 1,
    blend: 'color',
  });
  ribbons.push({
    points: [along(tip, way, long * 0.96), along(tip, way, cell * 0.14)],
    widths: cell * 0.045,
    color: SHAFT,
    alpha: 1,
    blend: 'color',
  });
  // The head: wider than the shaft, drawn to its point.
  ribbons.push({
    points: [along(tip, way, cell * 0.24), tip],
    widths: [cell * 0.19, 0],
    color: HEAD_RIM,
    alpha: 1,
    blend: 'color',
  });
  ribbons.push({
    points: [along(tip, way, cell * 0.21), along(tip, way, cell * 0.02)],
    widths: [cell * 0.12, 0],
    color: HEAD,
    alpha: 1,
    blend: 'color',
  });
  return ribbons;
}

/**
 * An arrow stuck where it struck, leaning the way it came: its head buried, the shaft and feathers
 * standing out of the ground.
 */
export function stuckArrow(
  tip: Point,
  way: Point,
  cell: number,
  ramp: readonly string[],
  alpha: number
): EffectRibbon[] {
  return arrowBody(tip, way, cell, ramp, false)
    .slice(0, 4)
    .map((ribbon) => ({ ...ribbon, alpha: ribbon.alpha * alpha }));
}

/**
 * A missile flying, its nose at `tip` and pointing the way it flies: a pale body shaded beneath, a
 * coloured nose cone, four fins at its tail seen as two, and the flame of its motor streaming from the
 * tail with a light about it.
 */
export function missileBody(
  tip: Point,
  way: Point,
  cell: number,
  ramp: readonly string[],
  velocity: Point,
  speed: number,
  forward: number,
  flicker: number
): { ribbons: EffectRibbon[]; motes: EffectMote[] } {
  const long = cell * 0.95;
  const { side } = acrossOf(way);
  const tail = along(tip, way, long);
  const ribbons: EffectRibbon[] = [
    // The fins, flaring out from the body at the tail.
    {
      points: [along(tip, way, long * 0.62), along(tip, way, long * 0.98)],
      widths: [0, cell * 0.5],
      color: BODY_SHADE,
      alpha: 1,
      blend: 'color',
    },
    // The body, its shade beneath and its light along it.
    {
      points: [along(tip, way, long), along(tip, way, cell * 0.24)],
      widths: cell * 0.22,
      color: BODY_SHADE,
      alpha: 1,
      blend: 'color',
    },
    {
      points: [along(tip, way, long * 0.98, cell * 0.02, side), along(tip, way, cell * 0.26, cell * 0.02, side)],
      widths: cell * 0.13,
      color: BODY,
      alpha: 1,
      blend: 'color',
    },
    // A band of its colour round the body, and its nose cone.
    {
      points: [along(tip, way, long * 0.55), along(tip, way, long * 0.47)],
      widths: cell * 0.225,
      color: hueOf(ramp),
      alpha: 1,
      blend: 'color',
    },
    {
      points: [along(tip, way, cell * 0.27), tip],
      widths: [cell * 0.22, 0],
      color: hueOf(ramp),
      alpha: 1,
      blend: 'color',
    },
  ];
  const flame = 0.8 + 0.2 * Math.sin(flicker);
  const motes: EffectMote[] = [
    haze(tail, cell * 0.8, hueOf(ramp), 0.45, forward),
    {
      ...glow(along(tip, way, long + cell * 0.12), cell * 0.26 * flame, ramp[4], 1, forward),
      blend: 'light',
      shape: 'comet',
      velocity,
      trail: (cell * 0.7 * flame) / Math.max(speed, 1),
    },
    { ...glow(along(tip, way, long + cell * 0.06), cell * 0.12, '#ffffff', 1, forward + 1), shape: 'puff' },
    glow(tail, cell * 0.7, ramp[5], 0.8, forward),
  ];
  return { ribbons, motes };
}
