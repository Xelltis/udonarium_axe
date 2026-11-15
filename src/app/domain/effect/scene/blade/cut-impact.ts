import type { BladeTones } from '@axe/domain/effect/scene/blade/blade-tones';
import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthTonesOf, layFissure } from '@axe/domain/effect/scene/earth/earth-parts';
import { floorMark, glow, type Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * What a blade does to what it cuts. The instant it crosses is one frame: the cut is a bright line
 * right through the target and far past it on both sides, sparks and shards burst out from where it
 * crossed, and the floor is lit; then a glint in the shape of a cross is left at the point of contact.
 * After it the cut opens: a seam of light that splits wider, sprays light from its lips, and closes.
 * The floor is scored where a stroke passed over it, the score glowing and cooling, and motes of the
 * blade's light drift up from where it struck for as long as its sound lasts.
 *
 * A ramp runs from the deepest shadow at 0 to white at 6.
 */

/** How long the line of an impact is drawn, how long its burst flies, and how long its glint stays, in seconds. */
const LINE_S = 0.11;
const BURST_S = 0.34;
const GLINT_S = 0.42;
/** How far past the cut either way the line of an impact reaches, against how long the cut is. */
const LINE_REACH = 4.2;

/** Where and how hard a blade crosses what it cuts. */
export interface Impact {
  /** Where it crosses, and the way the blade was going there, of length one. */
  readonly at: Point;
  readonly way: Point;
  /** Half how long the cut it leaves is, and how wide a cell is drawn, in table pixels. */
  readonly half: number;
  readonly cell: number;
  readonly ramp: readonly string[];
  readonly tones: BladeTones;
  /** How heavy the blow is: 1 for a plain stroke. */
  readonly weight: number;
  readonly forward: number;
  /** The lowest anything of it is drawn, in table pixels up, and the floor under what it cuts, where that is lit. */
  readonly lowestZ: number;
  readonly floor?: Point;
  readonly seed: number;
}

/** Points along a line through a point, as far as `half` either side and no lower than `lowestZ`. */
function lineThrough(at: Point, way: Point, half: number, lowestZ: number, steps = 8): Point[] {
  return Array.from({ length: steps + 1 }, (_unused, index) => {
    const along = ((index / steps) * 2 - 1) * half;
    return { x: at.x + way.x * along, y: at.y + way.y * along, z: Math.max(lowestZ, at.z + way.z * along) };
  });
}

/** How wide a slit is along it: pointed at both ends. */
function slit(widest: number, steps = 8): number[] {
  return Array.from(
    { length: steps + 1 },
    (_unused, index) => widest * Math.pow(Math.sin((Math.PI * index) / steps), 0.7)
  );
}

/** Two ways square to a way: one level, and one as near upright as may be. */
function squareTo(way: Point): { readonly side: Point; readonly lift: Point } {
  const flat = Math.hypot(way.x, way.y);
  const side = flat > 0.001 ? { x: -way.y / flat, y: way.x / flat, z: 0 } : { x: 1, y: 0, z: 0 };
  const lift = { x: -way.z * (way.x / (flat || 1)), y: -way.z * (way.y / (flat || 1)), z: flat };
  return { side, lift: flat > 0.001 ? lift : { x: 0, y: 1, z: 0 } };
}

/** The instant a blade crosses, `since` seconds after it: see the head of this file. */
export function drawImpact(drawn: Staged, impact: Impact, since: number): void {
  if (since < 0 || since >= GLINT_S) return;
  const { at, way, half, cell, tones, weight, forward, seed } = impact;
  const flash = 1 - within(since, 0, LINE_S);
  if (flash > 0) {
    const long = lineThrough(at, way, half * LINE_REACH * (0.8 + 0.2 * (1 - flash)), impact.lowestZ);
    const fine = half * (0.3 + 0.7 * flash);
    drawn.ribbons.push(
      {
        points: long,
        widths: slit(half * 0.9 * flash),
        color: tones.glow,
        alpha: 0.5 * flash,
        blend: 'light',
        soft: 1,
      },
      { points: long, widths: slit(fine * 0.3), color: tones.rim, alpha: 0.85 * flash, blend: 'color' },
      { points: long, widths: slit(fine * 0.22), color: tones.body, core: tones.hot, alpha: flash, blend: 'color' },
      { points: long, widths: slit(fine * 0.09), color: '#ffffff', alpha: 1, blend: 'color' }
    );
    drawn.motes.push(glow(at, cell * 1.5 * weight, tones.glow, 0.55 * flash, forward));
    drawn.motes.push(glow(at, cell * 0.7 * weight, '#ffffff', 0.9 * flash, forward + 1));
    if (impact.floor) {
      drawn.floor.push(floorMark('disc', impact.floor, cell * 1.7 * weight, 1, tones.pale, 0.42 * flash, 'light', 0));
    }
    drawn.lights.push({ ...at, color: tones.pale, strength: Math.min(1.6, 1.1 * weight) * flash, reachPx: cell * 3 });
  }
  const burst = within(since, 0, BURST_S);
  if (burst < 1) {
    const { side, lift } = squareTo(way);
    const count = Math.round(14 + 8 * weight);
    const flown = outCubic(burst);
    for (let index = 0; index < count; index++) {
      const round = (index / count) * Math.PI * 2 + scatter(index, seed + 1) * 0.5;
      const across = scatter(index, seed + 2) * 2 - 1;
      const heading = {
        x: way.x * Math.cos(round) + (lift.x * 0.85 + side.x * across * 0.6) * Math.sin(round),
        y: way.y * Math.cos(round) + (lift.y * 0.85 + side.y * across * 0.6) * Math.sin(round),
        z: way.z * Math.cos(round) + lift.z * 0.85 * Math.sin(round),
      };
      const far = cell * (0.5 + 2 * scatter(index, seed + 3)) * weight;
      const speed = (far / BURST_S) * 3 * (1 - burst) * (1 - burst);
      drawn.motes.push({
        ...glow(
          {
            x: at.x + heading.x * far * flown,
            y: at.y + heading.y * far * flown,
            z: Math.max(impact.lowestZ, at.z + heading.z * far * flown),
          },
          cell * (index % 4 === 0 ? 0.1 : 0.065),
          index % 3 === 0 ? '#ffffff' : tones.pale,
          1 - burst * burst,
          forward
        ),
        shape: 'spark',
        velocity: { x: heading.x * speed, y: heading.y * speed, z: heading.z * speed },
        trail: 0.05,
      });
    }
    for (let index = 0; index < 8; index++) {
      const onward = (index % 2 === 0 ? 1 : -0.6) * cell * (0.8 + 1.6 * scatter(index, seed + 4)) * weight;
      const up = cell * (0.6 + 1.2 * scatter(index, seed + 5));
      drawn.motes.push({
        x: at.x + way.x * onward * flown + side.x * (scatter(index, seed + 6) - 0.5) * cell * flown,
        y: at.y + way.y * onward * flown + side.y * (scatter(index, seed + 6) - 0.5) * cell * flown,
        z: Math.max(impact.lowestZ, at.z + way.z * onward * flown + up * 4 * burst * (0.7 - burst)),
        size: cell * (0.12 + 0.08 * scatter(index, seed + 7)),
        color: index % 2 === 0 ? '#ffffff' : tones.pale,
        alpha: 1 - burst * burst,
        blend: 'color',
        shape: 'flake',
        spin: since * (14 + index) + index,
        variant: index,
        forward,
      });
    }
  }
  const glint = within(since, 0.03, GLINT_S);
  if (glint > 0 && glint < 1) {
    const left = 1 - glint;
    const size = cell * 1.5 * weight * (0.5 + 0.5 * left);
    drawn.motes.push({ ...glow(at, size, '#ffffff', left, forward + 2), shape: 'star', spin: 0.4 + glint * 0.6 });
    for (const turn of [Math.PI / 4, (Math.PI * 3) / 4]) {
      drawn.motes.push({
        ...glow(at, size * 0.22, '#ffffff', left, forward + 3),
        shape: 'flare',
        trail: 7,
        spin: turn,
      });
      drawn.motes.push({
        ...glow(at, size * 0.4, tones.glow, 0.7 * left, forward + 2),
        shape: 'flare',
        trail: 5,
        spin: turn,
      });
    }
  }
}

/**
 * The cut a blade leaves, `since` seconds after it opens: a seam along the way the blade went, as
 * long as `half` either side, that splits wider, as far as `open` says, holds, and closes over
 * `lasts` seconds: white-hot within the blade's colour within a dark lip, light about it, and sparks
 * sprayed from its lips for as long as it gapes.
 */
export function drawSeam(drawn: Staged, impact: Impact, since: number, lasts: number, open = 1): void {
  if (since < 0 || since >= lasts) return;
  const { at, way, half, cell, tones, forward, seed } = impact;
  const gapes = outCubic(within(since, 0, lasts * 0.22)) * (1 - Math.pow(within(since, lasts * 0.4, lasts), 1.6));
  const wide = half * 0.1 * open * gapes;
  if (wide <= cell * 0.004) return;
  const seam = lineThrough(at, way, half * (1.1 + 0.35 * gapes), impact.lowestZ);
  drawn.ribbons.push(
    { points: seam, widths: slit(wide * 3.4), color: tones.glow, alpha: 0.45 * gapes, blend: 'light', soft: 1 },
    { points: seam, widths: slit(wide * 1.5 + cell * 0.03), color: tones.rim, alpha: 0.9, blend: 'color' },
    { points: seam, widths: slit(wide), color: tones.body, core: tones.pale, alpha: 1, blend: 'color' },
    { points: seam, widths: slit(wide * 0.42), color: '#ffffff', alpha: 1, blend: 'color' }
  );
  const { side, lift } = squareTo(way);
  for (let index = 0; index < 12; index++) {
    const cycle = (since * (2.6 + scatter(index, seed + 11)) + scatter(index, seed + 12)) % 1;
    const along = (scatter(index, seed + 13) * 2 - 1) * half * 0.8;
    const out = (index % 2 === 0 ? 1 : -1) * cell * (0.25 + 1.1 * cycle) * open;
    const lean = scatter(index, seed + 14) - 0.5;
    const heading = { x: lift.x + side.x * lean, y: lift.y + side.y * lean, z: lift.z };
    const speed = cell * 4 * (1 - cycle) * Math.sign(out);
    drawn.motes.push({
      ...glow(
        {
          x: at.x + way.x * along + heading.x * out,
          y: at.y + way.y * along + heading.y * out,
          z: Math.max(impact.lowestZ, at.z + way.z * along + heading.z * out),
        },
        cell * 0.06,
        index % 2 === 0 ? '#ffffff' : tones.pale,
        Math.min(1, cycle * 6, (1 - cycle) * 2) * gapes,
        forward
      ),
      shape: 'spark',
      velocity: { x: heading.x * speed, y: heading.y * speed, z: heading.z * speed },
      trail: 0.05,
    });
  }
  drawn.lights.push({ ...at, color: tones.pale, strength: 0.5 * gapes, reachPx: cell * 2.4 });
}

/**
 * The score a stroke leaves on the floor, from one point to another: dark, glowing in the blade's
 * colour along its middle while `heat` cools from 1 to 0, and gone as `clearing` falls to nothing.
 */
export function layCutScore(
  drawn: Staged,
  from: Point,
  to: Point,
  wide: number,
  ramp: readonly string[],
  heat: number,
  clearing: number,
  seed: number
): void {
  layFissure(drawn, from, to, wide, { ...earthTonesOf(ramp), glow: ramp[2], hot: ramp[4] }, heat, clearing, seed);
}

/**
 * Motes of a blade's light drifting up from about a point, born over `lasts` seconds from the blow
 * and each twinkling out: what fills the air after a cut for as long as its sound rings.
 */
export function drawDrift(
  drawn: Staged,
  at: Point,
  cell: number,
  ramp: readonly string[],
  since: number,
  lasts: number,
  count: number,
  seed: number,
  spread = 1
): void {
  if (since <= 0) return;
  for (let index = 0; index < count; index++) {
    const born = scatter(index, seed + 21) * lasts * 0.7;
    const life = 0.7 + scatter(index, seed + 22) * 0.8;
    const age = (since - born) / life;
    if (age <= 0 || age >= 1) continue;
    const turn = scatter(index, seed + 23) * Math.PI * 2;
    const out = cell * spread * (0.2 + 1.1 * Math.sqrt(scatter(index, seed + 24)));
    const point = {
      x: at.x + Math.cos(turn) * out + Math.sin((since - born) * 3 + index) * cell * 0.06,
      y: at.y + Math.sin(turn) * out,
      z: at.z - cell * 0.3 + cell * (0.5 + 0.7 * scatter(index, seed + 25)) * (since - born),
    };
    const seen = Math.min(1, age * 6, (1 - age) * 2) * (0.6 + 0.4 * Math.sin(since * 17 + index * 2.3));
    drawn.motes.push(
      glow(point, cell * (0.09 + 0.06 * (index % 3)), index % 2 === 0 ? ramp[4] : ramp[3], seen, cell * 0.4)
    );
    if (index % 4 === 0) {
      drawn.motes.push({
        ...glow(point, cell * 0.32, '#ffffff', seen * Math.abs(Math.sin(since * 9 + index)), cell * 0.4 + 1),
        shape: 'star',
        spin: index,
      });
    }
  }
}

/** The floor about a point darkened, so that what flashes over it counts: as far out as `reach`, in table pixels. */
export function layHush(drawn: Staged, floor: Point, reach: number, alpha: number): void {
  if (alpha <= 0.01) return;
  drawn.floor.push(floorMark('disc', floor, reach, 1, '#070b18', alpha, 'color', 0));
}
