import { clamp } from '@axe/core/util/clamp';
import type { Stage } from '@axe/domain/effect/scene/choreography';
import { seededRun } from '@axe/domain/effect/scene/effect-sim';
import { lerpPoint, type Point, wayBetween } from '@axe/domain/effect/scene/parts';

/*
 * Where and when a meteor falls: it shows as a point of light in the sky while the floor it will
 * strike begins to glow, then falls on a straight line from high up and off to one side, a little
 * faster all the way down, growing as it nears, and strikes where its target stands.
 *
 * Lengths of the rock are in cells of the effect, grown by its size as every look is; the line it
 * falls on is laid out in cells of the table, so a larger meteor falls from as far as a smaller one
 * rather than from out of sight.
 */

/** The share of its travel a meteor hangs in the sky as a point of light before it falls. */
export const METEOR_OMEN_SHARE = 1 / 7;
/** How high it falls from, in cells of the table, and how far off to one side for that height. */
const FALLS_FROM_CELLS = 9;
const ASIDE_FOR_HEIGHT = 4 / 9;
/** How far off to one side it starts at the most, in cells of the table. */
const FURTHEST_ASIDE_CELLS = 8;
/** How high it falls from at the least and at the most, as many times as the rock is wide when it lands. */
const FALLS_FROM_ROCKS = [4.2, 11] as const;
/** How wide the rock is as it starts to fall and as it lands, in cells of the effect. */
const ROCK_CELLS = [0.5, 1.3] as const;
/** How much of its pace it has as it starts to fall, as a share of its pace on the whole: it lands as much faster. */
const STARTS_AT_PACE = 0.75;
/** How far over the floor the middle of the rock is as it lands, as a share of its width: it sinks in to nearly its middle. */
const SINKS_TO = 0.25;
/**
 * How far round from the way its caster faces the target each meteor of a cast comes in, in radians:
 * the first from behind the caster, the rest from either side by turns, so no two fall down one line.
 */
const BEARINGS = [0, 0.8, -0.8, 1.5, -1.5, 0.4, -0.4, 1.15, -1.15];
/** How far each strays from its bearing by its seed, in radians either way. */
const BEARING_STRAYS = 0.15;
/** The way a meteor called from nowhere crosses the table, in radians from the east towards the south: from the south-west. */
const FROM_NOWHERE = -Math.PI / 4;
/** How far apart the meteors of one volley land, in cells of the effect. */
const VOLLEY_APART_CELLS = 0.5;
/** The turn from each meteor of a volley to the next about where they land, in radians: the golden angle. */
const VOLLEY_TURN = 2.4;

/** One meteor's fall: the line it falls on, the moments of it, in seconds of the effect, and how large it is drawn. */
export interface MeteorFall {
  /** Where it shows in the sky and starts to fall from. */
  readonly from: Point;
  /** Where the middle of the rock is as it lands. */
  readonly to: Point;
  /** The floor it strikes, under where it lands. */
  readonly floor: Point;
  /** The way it falls, of length one, and how far. */
  readonly way: Point;
  readonly length: number;
  /** The way it crosses the table as it falls, level and of length one. */
  readonly across: { readonly x: number; readonly y: number };
  /** When its omen shows, when it starts to fall and when it lands. */
  readonly showsAt: number;
  readonly fallsAt: number;
  readonly landsAt: number;
  /** A cell of the effect, in table pixels. */
  readonly unit: number;
}

/** How wide the rock is a share of the way down its fall, in table pixels. */
export function rockSizeAt(fall: MeteorFall, along: number): number {
  return fall.unit * (ROCK_CELLS[0] + (ROCK_CELLS[1] - ROCK_CELLS[0]) * clamp(along, 0, 1));
}

/** How far down its fall a meteor is at a moment, from 0 as it starts to 1 as it lands: a little faster all the way. */
export function fallShareAt(fall: MeteorFall, seconds: number): number {
  const share = clamp((seconds - fall.fallsAt) / Math.max(fall.landsAt - fall.fallsAt, 0.001), 0, 1);
  return STARTS_AT_PACE * share + (1 - STARTS_AT_PACE) * share * share;
}

/** How fast a meteor falls at a moment of its fall, in table pixels a second. */
export function fallSpeedAt(fall: MeteorFall, seconds: number): number {
  const lasts = Math.max(fall.landsAt - fall.fallsAt, 0.001);
  const share = clamp((seconds - fall.fallsAt) / lasts, 0, 1);
  return (fall.length * (STARTS_AT_PACE + 2 * (1 - STARTS_AT_PACE) * share)) / lasts;
}

/** Where the middle of the rock is a share of the way down its fall. */
export function fallPointAt(fall: MeteorFall, along: number): Point {
  return lerpPoint(fall.from, fall.to, clamp(along, 0, 1));
}

/**
 * The fall of one meteor on a stage's target: the one of `shots` it is, sent at `launch` and landing
 * at `lands`, in seconds of the effect. It comes in over its caster's shoulder, each target's and
 * each shot's from its own side, the same for the same cast on every seat; called from nowhere it
 * crosses the table from the south-west. The meteors of a volley land a little apart.
 */
export function meteorFallOf(stage: Stage, shot: number, shots: number, launch: number, lands: number): MeteorFall {
  const unit = stage.cell;
  const tableCell = unit / Math.max(stage.preset.sizeScale, 0.01);
  const landed = unit * ROCK_CELLS[1];
  const height = clamp(tableCell * FALLS_FROM_CELLS, landed * FALLS_FROM_ROCKS[0], landed * FALLS_FROM_ROCKS[1]);
  const aside = Math.min(height * ASIDE_FOR_HEIGHT, tableCell * FURTHEST_ASIDE_CELLS);
  const bearing = bearingOf(stage, shot);
  const across = { x: Math.cos(bearing), y: Math.sin(bearing) };
  const apart = shots > 1 && shot > 0 ? unit * VOLLEY_APART_CELLS * Math.sqrt(shot / (shots - 1)) : 0;
  const spot = {
    x: stage.x + Math.cos(shot * VOLLEY_TURN + stage.seed) * apart,
    y: stage.y + Math.sin(shot * VOLLEY_TURN + stage.seed) * apart,
  };
  const floor = { ...spot, z: stage.groundZ };
  const to = { ...spot, z: Math.max(stage.z, stage.groundZ) + landed * SINKS_TO };
  const from = { x: spot.x - across.x * aside, y: spot.y - across.y * aside, z: to.z + height };
  const { way, length } = wayBetween(from, to);
  const fallsAt = launch + (lands - launch) * METEOR_OMEN_SHARE;
  return { from, to, floor, way, length, across, showsAt: launch, fallsAt, landsAt: lands, unit };
}

/** The way a meteor crosses the table as it falls, in radians from the east towards the south. */
function bearingOf(stage: Stage, shot: number): number {
  const origin = stage.origin;
  const far = origin ? Math.hypot(stage.x - origin.x, stage.y - origin.y) : 0;
  const towards = origin && far > stage.cell * 0.25 ? Math.atan2(stage.y - origin.y, stage.x - origin.x) : FROM_NOWHERE;
  const strays = (seededRun(stage.seed * 31 + shot * 7 + 5)() - 0.5) * 2 * BEARING_STRAYS;
  return towards + BEARINGS[(stage.index + shot * 2) % BEARINGS.length] + strays;
}
