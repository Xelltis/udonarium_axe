import { clamp } from '@axe/core/util/clamp';
import { type Swing } from '@axe/domain/effect/scene/blade/crescent';
import { type Stage, within } from '@axe/domain/effect/scene/choreography';
import type { Point } from '@axe/domain/effect/scene/parts';
import type { SlashHit } from '@axe/domain/effect/timeline/blade';

/*
 * How a cut is laid over its target: the ways across it, up and back to its caster; the arc each
 * stroke of it swings along; and the clock of a stroke, which is quick whatever the length of the
 * playback and crosses the target at the moment its blow lands.
 */

/** How far over the floor a blade stays at its lowest, in cells. */
const OVER_FLOOR = 0.12;
/** How much of a slanting stroke's rise is kept, so it lies nearer level and the table, seen from above, sees the whole of it. */
const SLANT_KEPT = 0.8;
/** How steep a stroke is, as the sine of its tilt, before it comes straight down or up. */
const STEEP = 0.9;
/** How deep an arc bows back towards the caster, as a share of its reach. */
const ARC_DEPTH = 0.95;
/** How far round the arc a blade sweeps, either side of the target, in radians. */
const SWEEP = 1.25;
/** How far round a slanting stroke sweeps at the least, in radians: where it would go into the floor it skims along it instead. */
const SKIMS = 1;
/** How far past the middle of its arc a blade is as its blow lands, in radians: just through what it cuts. */
const CROSSED = 0.16;

/** How high up its target a cut crosses, as a share of how tall the target stands, and at the least, in cells. */
const CROSSES_HIGH = 0.5;
const CROSSES_LEAST = 0.3;

/** Where a cut crosses its target: its middle, half as high as it stands. */
export function chestOf(stage: Stage): Point {
  return { x: stage.x, y: stage.y, z: stage.z + Math.max(stage.tall * CROSSES_HIGH, stage.cell * CROSSES_LEAST) };
}

/** The ways a stroke sweeps: across the target as its caster sees it, up, and back towards the caster. */
export interface CutFrame {
  readonly across: Point;
  readonly up: Point;
  readonly toward: Point;
  /** The lowest a blade may go, in table pixels: a little over the floor under the target. */
  readonly lowestZ: number;
}

/** The ways a stroke sweeps, from where its caster stands, or from the south for one cast from nowhere. */
export function cutFrameOf(stage: Stage): CutFrame {
  const dx = stage.origin ? stage.x - stage.origin.x : 0;
  const dy = stage.origin ? stage.y - stage.origin.y : -1;
  const length = Math.hypot(dx, dy) || 1;
  const heading = length < 1 ? { x: 0, y: -1 } : { x: dx / length, y: dy / length };
  return {
    across: { x: -heading.y, y: heading.x, z: 0 },
    up: { x: 0, y: 0, z: 1 },
    toward: { x: -heading.x, y: -heading.y, z: 0 },
    lowestZ: stage.groundZ + stage.cell * OVER_FLOOR,
  };
}

/** A frame turned about the upright by a number of degrees. */
function turned(frame: CutFrame, degrees: number): CutFrame {
  if (!degrees) return frame;
  const turn = (degrees * Math.PI) / 180;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const about = (v: Point): Point => ({ x: v.x * cos - v.y * sin, y: v.x * sin + v.y * cos, z: 0 });
  return { ...frame, across: about(frame.across), toward: about(frame.toward) };
}

/** A level way lifted off the level by a number of degrees, of length one. */
function lifted(way: Point, degrees: number): Point {
  if (!degrees) return way;
  const lift = (degrees * Math.PI) / 180;
  return { x: way.x * Math.cos(lift), y: way.y * Math.cos(lift), z: Math.sin(lift) };
}

/**
 * The arc a stroke swings along about a point of its target: across, tipped down or up by its angle
 * and laid nearer level; a stroke tipped steeply comes straight down, or up. It sweeps as far round
 * as it may; one that comes straight down stops short at the floor, and a slanting one skims it.
 */
export function swingOf(hit: SlashHit, frame: CutFrame, centre: Point, cell: number): Swing {
  const facing = turned(frame, hit.yaw ?? 0);
  const angle = (hit.angle * Math.PI) / 180;
  const fall = Math.sin(angle);
  const steep = Math.abs(fall) > STEEP;
  const level = steep ? 0 : Math.cos(angle);
  const drop = steep ? Math.sign(fall) : fall * SLANT_KEPT;
  const size = Math.hypot(level, drop) || 1;
  const travel = {
    x: (facing.across.x * level) / size,
    y: (facing.across.y * level) / size,
    z: -drop / size,
  };
  const radius = (hit.reach / 2) * cell;
  const falls = travel.z * radius;
  const room = centre.z - frame.lowestZ;
  const reaches = Math.abs(falls) < 0.001 ? SWEEP : Math.asin(clamp(room / Math.abs(falls), 0, 1));
  const stop = steep ? reaches : Math.max(reaches, SKIMS);
  return {
    centre,
    travel,
    toward: lifted(facing.toward, hit.lift ?? 0),
    radius,
    depth: ARC_DEPTH,
    from: falls > 0 ? -Math.min(SWEEP, stop) : -SWEEP,
    to: falls < 0 ? Math.min(SWEEP, stop) : SWEEP,
    lowestZ: frame.lowestZ,
  };
}

/** Where a blade is on its arc, and how far its stroke and what it leaves have gone. */
export interface StrokeClock {
  /** The turn the blade's head is at, in radians, or the turn it starts from before its stroke. */
  readonly head: number;
  /** How far through its stroke it is, from 0 before it to 1 once it has swung through. */
  readonly swung: number;
  /** How far the trail it left has faded, from 0 until the stroke ends to 1 gone. */
  readonly spent: number;
  /** When the stroke starts and ends, in seconds of the playback. */
  readonly starts: number;
  readonly ends: number;
}

/**
 * The clock of a stroke that takes `takes` seconds and whose trail fades over `fades` after it: its
 * head starts fast and eases, and is just through what it cuts at the moment `crosses`, however
 * little of its arc lies before the target.
 */
export function strokeClock(swing: Swing, crosses: number, takes: number, fades: number, t: number): StrokeClock {
  const span = swing.to - swing.from || 1;
  const reached = clamp((Math.min(CROSSED, swing.to) - swing.from) / span, 0, 1);
  const before = Math.min(crosses, takes * (1 - Math.sqrt(1 - reached)));
  const starts = crosses - before;
  const ends = starts + takes;
  const swung = within(t, starts, ends);
  const eased = 1 - (1 - swung) * (1 - swung);
  return {
    head: swing.from + span * eased,
    swung,
    spent: within(t, ends, ends + fades),
    starts,
    ends,
  };
}
