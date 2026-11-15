import { bladeTonesOf } from '@axe/domain/effect/scene/blade/blade-tones';
import { type CrescentLook, crescentRibbons, type Swing, swingPoint } from '@axe/domain/effect/scene/blade/crescent';
import { drawDrift, drawImpact, drawSeam, type Impact } from '@axe/domain/effect/scene/blade/cut-impact';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { nothingStaged, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { rampOf } from '@axe/domain/effect/scene/effect-ramp';
import { acrossOf, glow, hueOf, type Point } from '@axe/domain/effect/scene/parts';
import { scatter } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * A cut that flies: a great crescent of force thrown off a blade, across the way it goes and bowed
 * back from it, as thick as a piece: its leading edge white-hot, a body of the blade's colour within
 * a dark rim, and a wake boiling off the back of it in shreds; two afterimages of itself hang where
 * it has just been, the air it parts streaks back off its horns, and it tears a glowing line in the
 * floor under its path. Those of a volley are each tipped their own way, upright, slanting, level,
 * and the last is the largest. Where one lands it goes on through its target and is gone; the cut
 * is a line of light through the target the way the crescent was tipped, crossed by a second for one
 * thrown alone and for the last of a volley, with its burst of sparks, the seam it opens and the
 * motes it leaves.
 */

/** How far each crescent of a volley is tipped up from level, in degrees, and one thrown alone. */
const TIPPED = [78, -38, 0, 38, -70, 20, 55, -20];
const TIPPED_ALONE = 16;
/** How far a crescent reaches either side of its way, and how thick it is at its belly, in cells. */
const REACH = 1.5;
const THICK = 0.46;
/** How much larger the last of a volley is. */
const LAST_LARGER = 1.35;
/** How large a crescent is as it leaves the blade, against its full size, and over how much of its flight it grows to that. */
const FORMS_FROM = 0.3;
const FORMS_OVER = 0.2;
/** How far a crescent's horns are swept back, as a share of its reach, and how far round they bend, in radians. */
const SWEPT = 0.9;
const BENT = 1.2;
/** How long the line torn in the floor under its path takes to fade, in seconds. */
const SCORE_FADES_S = 0.6;
/** How far past its target a crescent carries on, in cells, and for how long, in seconds. */
const CARRIES_ON = 1.3;
const CARRIES_S = 0.16;
/** How many shreds boil off the back of a crescent, and how many streaks run back off its horns. */
const SHREDS = 9;
const STREAKS = 10;

/** One crescent in flight. */
export interface SlashFlight {
  readonly at: Point;
  /** The way it flies, of length one. */
  readonly way: Point;
  readonly cell: number;
  /** How far through its flight it is, and where it was at a share of it. */
  readonly share: number;
  readonly pathAt: (along: number) => Point;
  /** How long its flight takes, in seconds. */
  readonly fliesS: number;
  readonly seconds: number;
  /** Which of a volley it is, and how many the volley has. */
  readonly index: number;
  readonly count: number;
  readonly floorZ: number;
}

/** How far a crescent of a volley is tipped up from level, in radians. */
function tippedOf(index: number, count: number): number {
  return ((count > 1 ? TIPPED[index % TIPPED.length] : TIPPED_ALONE) * Math.PI) / 180;
}

/** How much larger than the rest a crescent of a volley is drawn: the last of several is the largest. */
function largerOf(index: number, count: number): number {
  return count > 1 && index === count - 1 ? LAST_LARGER : 1;
}

/** The way across a crescent, from one horn to the other, tipped up from level. */
function spanOf(way: Point, tipped: number): Point {
  const { side, lift } = acrossOf(way);
  return {
    x: side.x * Math.cos(tipped) + lift.x * Math.sin(tipped),
    y: side.y * Math.cos(tipped) + lift.y * Math.sin(tipped),
    z: side.z * Math.cos(tipped) + lift.z * Math.sin(tipped),
  };
}

/** The arc a crescent lies along at a place: across its way and bowed back from it. */
function arcAt(at: Point, way: Point, span: Point, reach: number, floorZ: number, cell: number): Swing {
  return {
    centre: at,
    travel: span,
    toward: { x: -way.x, y: -way.y, z: -way.z },
    radius: reach,
    depth: SWEPT,
    from: -BENT,
    to: BENT,
    lowestZ: floorZ + cell * 0.08,
  };
}

/** The line a crescent tears in the floor under its path up to a share of its flight, each point fading from the moment it was passed. */
function drawScore(
  drawn: Staged,
  pathAt: (along: number) => Point,
  upTo: number,
  sincePassed: (share: number) => number,
  cell: number,
  ramp: readonly string[],
  floorZ: number
): void {
  const steps = 8;
  const shares = Array.from({ length: steps + 1 }, (_unused, index) => (upTo * index) / steps);
  const alphas = shares.map((share) => 1 - within(sincePassed(share), 0, SCORE_FADES_S));
  if (alphas.every((alpha) => alpha <= 0)) return;
  const points = shares.map((share) => ({ ...pathAt(share), z: floorZ + 2 }));
  drawn.ribbons.push(
    { points, widths: cell * 0.5, color: ramp[2], alpha: 0.3, alphas, blend: 'light', soft: 1 },
    { points, widths: cell * 0.2, color: ramp[0], alpha: 0.7, alphas, blend: 'color', torn: 0.5, flowed: 3 },
    {
      points,
      widths: cell * 0.08,
      color: ramp[4],
      alpha: 0.95,
      alphas: alphas.map((alpha) => alpha * alpha),
      blend: 'light',
    }
  );
}

/** A crescent in flight; see the head of this file. */
export function drawFlyingSlash(drawn: Staged, flight: SlashFlight, ramp: readonly string[]): void {
  const { at, way, cell, share, pathAt, fliesS, seconds } = flight;
  const larger = largerOf(flight.index, flight.count) * Math.min(1, FORMS_FROM + share / FORMS_OVER);
  const span = spanOf(way, tippedOf(flight.index, flight.count));
  const reach = cell * REACH * larger;
  const forward = cell * 0.4;
  const tones = bladeTonesOf(ramp[4], ramp[1]);
  const look: CrescentLook = {
    tones,
    thick: cell * THICK * larger,
    alpha: 1,
    spent: 0,
    flowed: seconds * 7 + flight.index,
    ghosts: 0,
    leads: true,
  };
  drawScore(drawn, pathAt, share, (passed) => (share - passed) * fliesS, cell, ramp, flight.floorZ);
  for (const [ghost, back] of [0.13, 0.065].entries()) {
    if (share - back <= 0) continue;
    const behind = arcAt(pathAt(share - back), way, span, reach * (1.12 - 0.06 * ghost), flight.floorZ, cell);
    drawn.ribbons.push(
      ...crescentRibbons(behind, -BENT, BENT, {
        ...look,
        thick: look.thick * (1.3 - 0.15 * ghost),
        alpha: 0.3 + 0.2 * ghost,
        spent: 0.25,
      })
    );
  }
  const arc = arcAt(at, way, span, reach, flight.floorZ, cell);
  drawn.ribbons.push(...crescentRibbons(arc, -BENT, BENT, look));
  drawn.motes.push(glow(at, cell * 1.6 * larger, ramp[3], 0.4, forward));
  for (let shred = 0; shred < SHREDS; shred++) {
    const cycle = (seconds * (3 + 2 * scatter(shred, flight.index + 1)) + scatter(shred, flight.index + 2)) % 1;
    const turn = (scatter(shred, flight.index + 3) * 2 - 1) * BENT * 0.9;
    const root = swingPoint(arc, turn, look.thick * 0.7 * Math.cos(turn));
    const lean = {
      x: -way.x + span.x * Math.sin(turn) * 0.5,
      y: -way.y + span.y * Math.sin(turn) * 0.5,
      z: -way.z + span.z * Math.sin(turn) * 0.5 + 0.15,
    };
    drawn.motes.push(
      flowingMote(
        'lick',
        root,
        lean,
        cell * (0.3 + 0.2 * scatter(shred, 4)) * larger,
        cell * (0.6 + 1.1 * cycle) * larger,
        seconds * 8 + shred,
        {
          color: shred % 2 === 0 ? hueOf(ramp) : ramp[2],
          core: shred % 3 === 0 ? ramp[4] : undefined,
          alpha: Math.min(1, cycle * 6, (1 - cycle) * 2.5),
          forward,
          variant: shred,
        }
      )
    );
  }
  const speed = cell * 16;
  const start = pathAt(0);
  const flown = Math.hypot(at.x - start.x, at.y - start.y, at.z - start.z);
  for (let streak = 0; streak < STREAKS; streak++) {
    const horn = (streak % 2 === 0 ? 1 : -1) * (0.45 + scatter(streak, 5) * 0.55);
    const back = cell * (0.5 + ((scatter(streak, 6) + seconds * 9) % 1.6));
    if (back > flown) continue;
    drawn.motes.push({
      ...glow(
        {
          x: at.x + span.x * horn * reach - way.x * back,
          y: at.y + span.y * horn * reach - way.y * back,
          z: Math.max(flight.floorZ, at.z + span.z * horn * reach - way.z * back),
        },
        cell * 0.05,
        streak % 3 === 0 ? '#ffffff' : ramp[4],
        0.9 * (1 - back / (cell * 2.1)),
        forward
      ),
      shape: 'spark',
      velocity: { x: way.x * speed, y: way.y * speed, z: way.z * speed },
      trail: 0.035,
    });
  }
  drawn.lights.push({ ...at, color: ramp[4], strength: 0.5, reachPx: cell * 2.4 });
}

/**
 * A crescent landing, on the clock of its landing: it carries on through its target and is gone,
 * leaving its cut through the target and the line it tore in the floor, which fades. `index` of
 * `count` tells which of a volley it is, and `fliesS` how long it flew, in seconds.
 */
export function drawSlashLanding(landed: Stage, index: number, count: number, fliesS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = landed;
  const since = landed.seconds;
  const ramp = rampOf(landed.preset.colorPrimary, landed.preset.colorSecondary, 7);
  const tones = bladeTonesOf(landed.preset.colorPrimary, landed.preset.colorSecondary);
  const struck = { x: landed.x, y: landed.y, z: landed.z + cell * 0.5 };
  const from = landed.origin ?? { x: struck.x, y: struck.y + cell * 3, z: struck.z };
  const dx = struck.x - from.x;
  const dy = struck.y - from.y;
  const far = Math.hypot(dx, dy) || 1;
  const way = { x: dx / far, y: dy / far, z: 0 };
  const tipped = tippedOf(index, count);
  const span = spanOf(way, tipped);
  const larger = largerOf(index, count);
  const forward = cell * 0.5;
  const lowestZ = landed.groundZ + cell * 0.1;
  const crowns = count === 1 || index === count - 1;
  const carried = within(since, 0, CARRIES_S);
  if (carried < 1) {
    const on = cell * CARRIES_ON * carried;
    const at = { x: struck.x + way.x * on, y: struck.y + way.y * on, z: struck.z };
    drawn.ribbons.push(
      ...crescentRibbons(arcAt(at, way, span, cell * REACH * larger, landed.groundZ, cell), -BENT, BENT, {
        tones,
        thick: cell * THICK * larger,
        alpha: Math.pow(1 - carried, 1.3),
        spent: 0.5 * carried,
        flowed: since * 7,
        ghosts: 0,
        leads: true,
      })
    );
  }
  drawScore(
    drawn,
    (share) => ({ x: from.x + dx * share, y: from.y + dy * share, z: landed.groundZ }),
    1,
    (passed) => since + (1 - passed) * fliesS,
    cell,
    ramp,
    landed.groundZ
  );
  const impact: Impact = {
    at: struck,
    way: span,
    half: cell * 0.75 * larger,
    cell,
    ramp,
    tones,
    weight: count > 1 ? (crowns ? 1.3 : 0.8) : 1.4,
    forward,
    lowestZ,
    floor: { x: landed.x, y: landed.y, z: landed.groundZ },
    seed: landed.seed + index * 31,
  };
  drawImpact(drawn, impact, since);
  drawSeam(drawn, impact, since - 0.06, 0.6, 1.2);
  if (crowns) {
    const crossing = spanOf(way, tipped + (Math.PI * 4) / 9);
    const second = { ...impact, way: crossing, weight: impact.weight * 0.7, floor: undefined, seed: impact.seed + 3 };
    drawImpact(drawn, second, since - 0.05);
    drawSeam(drawn, second, since - 0.1, 0.55, 1);
    drawDrift(drawn, struck, cell, ramp, since, 1.6, 20, landed.seed);
  }
  return drawn;
}
