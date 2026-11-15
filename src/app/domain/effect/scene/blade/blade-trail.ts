import { clamp } from '@axe/core/util/clamp';
import { type Staged, within } from '@axe/domain/effect/scene/choreography';
import type { EffectRibbon } from '@axe/domain/effect/scene/effect-scene';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { glow, type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * What every blade leaves in the air and on what it cuts. The trail of a swing is a crescent with two
 * unlike sides: on the outside, where the tip went, a hard thin edge, white at its core and outlined
 * dark so it holds over a bright table; inside it the wake, a torn band of the blade's colour that
 * thins and frays back along the way the blade came, and goes on thinning towards the edge once the
 * blade has passed. Where a blade crosses what it cuts it leaves a mark: a long line of light for an
 * instant, then a slit that closes; and it throws sparks and chips the way it was going.
 *
 * A ramp runs from the deepest shadow at 0 to white at 6.
 */

/** The arc a blade's tip is swung along, through what it cuts and bowed back towards the one who swings it. */
export interface Swing {
  /** Where it crosses what it cuts, in table pixels. */
  readonly centre: Point;
  /** The way the tip goes as it crosses, of length one. */
  readonly travel: Point;
  /** The way back to the one who swings, of length one and square to the way the tip goes. */
  readonly toward: Point;
  /** How far the arc reaches either side of where it crosses, in table pixels. */
  readonly radius: number;
  /** How deep the arc bows back, as a share of its reach. */
  readonly depth: number;
  /** The turns the swing starts and ends at, in radians either side of where it crosses. */
  readonly from: number;
  readonly to: number;
  /** The lowest the tip goes, in table pixels up. */
  readonly lowestZ: number;
}

/** How a trail is drawn: its colours, how thick it is at its thickest, in table pixels, and how far gone it is. */
export interface TrailLook {
  readonly ramp: readonly string[];
  readonly thick: number;
  readonly alpha: number;
  /** How far the trail has faded since the blade passed, from 0 as it stops to 1 gone. */
  readonly spent: number;
  /** How far the tears of its wake have run down it, in widths. */
  readonly flowed: number;
}

const TRAIL_STEPS = 20;

/** A point of a swing a turn round from where it crosses, set in from the arc towards the inside of its bow. */
export function swingPoint(swing: Swing, turn: number, inward = 0): Point {
  const { centre, travel, toward, radius, depth } = swing;
  const along = Math.sin(turn) * radius;
  const back = (1 - Math.cos(turn)) * radius * depth;
  const inAlong = -depth * Math.sin(turn);
  const inBack = Math.cos(turn);
  const size = Math.hypot(inAlong, inBack) || 1;
  const a = along + (inAlong / size) * inward;
  const b = back + (inBack / size) * inward;
  return {
    x: centre.x + travel.x * a + toward.x * b,
    y: centre.y + travel.y * a + toward.y * b,
    z: Math.max(swing.lowestZ, centre.z + travel.z * a + toward.z * b),
  };
}

/** How wide a wake is along it, from nothing at its tail to nothing at its head, widest behind the head. */
function wakeWidth(share: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(share, 1.8)), 0.8);
}

/** How wide an edge is along it: a long taper from its tail, a short one to its point. */
function edgeWidth(share: number): number {
  return Math.pow(Math.sin(Math.PI * Math.pow(share, 2.4)), 0.6);
}

/**
 * The trail of a swing between two turns, the blade at the later: on the arc itself a hard white
 * edge within a dark outline, and inside the arc the torn wake, white against the edge and paling
 * to the blade's colour, in a glow. As it is spent the wake
 * draws in to the edge, the tail runs up towards the head and all of it fades.
 */
export function trailRibbons(swing: Swing, tail: number, head: number, look: TrailLook): EffectRibbon[] {
  const spent = clamp(look.spent, 0, 1);
  const from = tail + (head - tail) * 0.3 * spent;
  if (Math.abs(head - from) < 0.02 || spent >= 1) return [];
  const { ramp } = look;
  const alpha = look.alpha * Math.pow(1 - spent, 1.4);
  const thick = look.thick * (1 - 0.7 * spent);
  const fine = look.thick * 0.17 * (1 - 0.5 * spent);
  const shares = Array.from({ length: TRAIL_STEPS + 1 }, (_unused, index) => index / TRAIL_STEPS);
  const turns = shares.map((share) => from + (head - from) * share);
  const wake = shares.map((share) => thick * wakeWidth(share));
  const edge = shares.map((share) => fine * edgeWidth(share));
  const onArc = turns.map((turn, index) => swingPoint(swing, turn, edge[index] * 0.5));
  const inside = (reach: number) =>
    turns.map((turn, index) => swingPoint(swing, turn, edge[index] + wake[index] * reach));
  const rising = shares.map((share) => Math.min(1, share * 1.5));
  return [
    {
      points: onArc,
      widths: edge.map((width) => width * 2),
      color: ramp[0],
      alpha: 0.75 * alpha,
      alphas: rising,
      blend: 'color',
    },
    {
      points: inside(0.5),
      widths: wake.map((width) => width * 1.6),
      color: ramp[2],
      alpha: 0.25 * alpha,
      alphas: shares.map((share) => share * share),
      blend: 'light',
      soft: 1,
      flowed: look.flowed,
    },
    {
      points: inside(0.45),
      widths: wake,
      color: ramp[2],
      alpha: 0.85 * alpha,
      alphas: shares.map((share) => Math.pow(share, 0.8)),
      blend: 'color',
      torn: 0.55,
      soft: 0.3,
      flowed: look.flowed,
    },
    {
      points: inside(0.16),
      widths: wake.map((width) => width * 0.5),
      color: ramp[4],
      alpha,
      alphas: shares.map((share) => Math.pow(share, 1.1)),
      blend: 'color',
      torn: 0.3,
      soft: 0.45,
      flowed: look.flowed * 1.3,
    },
    {
      points: onArc,
      widths: edge,
      color: '#ffffff',
      alpha,
      alphas: rising,
      blend: 'color',
    },
  ];
}

/** A straight line through a point along a way, as far as `half` either side of it and no lower than `lowestZ`, as points to draw a band through. */
function lineThrough(at: Point, way: Point, half: number, lowestZ: number, steps = 8): Point[] {
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const along = ((index / steps) * 2 - 1) * half;
    return { x: at.x + way.x * along, y: at.y + way.y * along, z: Math.max(lowestZ, at.z + way.z * along) };
  });
}

/** How wide a slit is along it: pointed at both ends. */
function slitWidths(steps: number, widest: number): number[] {
  return Array.from(
    { length: steps + 1 },
    (_unused, index) => widest * Math.pow(Math.sin((Math.PI * index) / steps), 0.7)
  );
}

/**
 * The mark a blade leaves across what it cuts, `since` seconds after it crossed: for an instant a
 * long thin line of light along the way it went, held through the blow's stop; then a slit as long
 * as `half` either side, white within a dark outline, closing over `lasts` seconds. `open` widens
 * it, as a cut that waits and then opens does, and none of it is drawn lower than `lowestZ`.
 */
export function drawCutMark(
  drawn: Staged,
  at: Point,
  way: Point,
  half: number,
  ramp: readonly string[],
  since: number,
  lasts: number,
  open = 1,
  lowestZ = Number.NEGATIVE_INFINITY
): void {
  if (since < 0 || since >= lasts) return;
  const flash = 1 - within(since, 0, 0.1);
  if (flash > 0) {
    const long = lineThrough(at, way, half * (1.9 + 0.5 * (1 - flash)), lowestZ);
    drawn.ribbons.push({
      points: long,
      widths: slitWidths(8, half * 0.5 * flash),
      color: ramp[3],
      alpha: 0.5 * flash,
      blend: 'light',
      soft: 1,
    });
    drawn.ribbons.push({
      points: long,
      widths: slitWidths(8, half * 0.09 * (0.4 + 0.6 * flash)),
      color: '#ffffff',
      alpha: flash,
      blend: 'color',
    });
  }
  const left = 1 - since / lasts;
  const wide = half * 0.2 * open * Math.pow(left, 0.6);
  const slit = lineThrough(at, way, half, lowestZ);
  drawn.ribbons.push({
    points: slit,
    widths: slitWidths(8, wide * 2),
    color: ramp[0],
    alpha: 0.7 * Math.min(1, left * 2.5),
    blend: 'color',
  });
  drawn.ribbons.push({
    points: slit,
    widths: slitWidths(8, wide),
    color: ramp[2],
    core: '#ffffff',
    alpha: Math.min(1, left * 2.5),
    blend: 'color',
  });
}

/** A chip struck off by a blade: a flake that tumbles and glints. */
export interface Chip {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly turnRate: number;
}

/**
 * Sparks thrown from where a blade crosses, in a fan about the way it was going: each as fast as a
 * pace between two, in cells a second, born within the given moments.
 */
export function cutSparks(
  th: Thrower,
  at: Point,
  way: Point,
  count: number,
  pace: readonly [number, number],
  bornAt: readonly [number, number]
): ThrownMote[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const fast = th.range(pace[0], pace[1]) * U;
    const aside = th.outward();
    const spread = th.range(0, 0.42) * fast;
    const born = th.range(bornAt[0], bornAt[1]);
    return th.mote({
      x: at.x,
      y: at.y,
      z: at.z,
      vx: way.x * fast + aside.cos * spread,
      vy: way.y * fast + aside.sin * spread,
      vz: way.z * fast + th.range(-0.15, 0.5) * fast * 0.5 + 1.6 * U,
      bornAt: born,
      life: th.lifeOf(born, 0.2, 0.55),
      gravity: th.fall,
      drag: 2.6,
      bounce: 0.35,
    });
  });
}

/** Chips struck off where a blade crosses, thrown the way it was going, slower than its sparks, and falling. */
export function cutChips(th: Thrower, at: Point, way: Point, count: number, bornAt: number): Chip[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const fast = th.range(1.6, 4.2) * U;
    const aside = th.outward();
    const spread = th.range(0.1, 0.6) * fast;
    return {
      mote: th.mote({
        x: at.x,
        y: at.y,
        z: at.z,
        vx: way.x * fast + aside.cos * spread,
        vy: way.y * fast + aside.sin * spread,
        vz: way.z * fast * 0.5 + th.range(1.5, 4) * U,
        bornAt,
        life: th.lifeOf(bornAt, 0.5, 0.9),
        gravity: th.fall,
        drag: 1.2,
        bounce: 0.3,
      }),
      size: th.range(0.07, 0.12),
      turnRate: th.range(-18, 18),
    };
  });
}

/** A chip at a moment: a glinting flake, tumbling until it lies still, and fading at the last. */
export function drawChip(drawn: Staged, chip: Chip, t: number, cell: number, color: string, forward: number): void {
  const at = moteAt(chip.mote, t);
  if (!at) return;
  drawn.motes.push({
    x: at.x,
    y: at.y,
    z: at.z + cell * 0.03,
    size: cell * chip.size,
    color,
    alpha: Math.min(1, (1 - at.age) * 3),
    blend: 'color',
    shape: 'flake',
    spin: at.landed ? chip.turnRate : (t - chip.mote.bornAt) * chip.turnRate,
    variant: chip.turnRate,
    forward,
  });
}

/** A glint of light off steel: a star that turns, in a small glow. */
export function drawGlint(
  drawn: Staged,
  at: Point,
  size: number,
  color: string,
  alpha: number,
  forward: number,
  turn: number
): void {
  if (alpha <= 0.01) return;
  drawn.motes.push(glow(at, size * 1.3, color, alpha * 0.45, forward));
  drawn.motes.push({ ...glow(at, size, '#ffffff', alpha, forward + 1), shape: 'star', spin: turn });
}

/** The instant a blade crosses what it cuts: a glint of white where it does, and its light over the table. */
export function drawCrossing(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  weight: number,
  forward: number
): void {
  if (since < 0 || since >= 0.14) return;
  const left = 1 - since / 0.14;
  drawGlint(drawn, at, cell * 0.75 * weight * (0.6 + 0.4 * left), ramp[3], left, forward * 1.5, 0.4);
  drawn.lights.push({ ...at, color: ramp[4], strength: 0.55 * weight * left, reachPx: cell * 2.2 });
}
