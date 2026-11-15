import { type GreatSwordTiming, UNWIELDED_WAY } from '@axe/domain/effect/great-sword-looks';
import { outCubic, type Stage, type StageTarget, within } from '@axe/domain/effect/scene/choreography';
import type { Point } from '@axe/domain/effect/scene/parts';
import { smooth } from '@axe/domain/effect/scene/wind/wind-parts';

/*
 * Where a great sword is: who wields it and where they hold it, the line it is brought down along,
 * how tall its blade of light stands and how far its torrent runs; and how it is held at each
 * moment, upright while the light gathers, drawn back a little before the swing, and brought down
 * about the hands that hold it until it lies along the line.
 */

/** How tall the blade of light stands, how wide it is, and how wide the torrent is, in cells, by grade. */
const TALL_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 2.8, 2: 3.5, 3: 4.3 };
const BROAD_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 0.58, 2: 0.7, 3: 0.84 };
const THICK_BY_GRADE: Record<1 | 2 | 3, number> = { 1: 1.6, 2: 2.1, 3: 2.7 };
/** How long the sword of steel is, in cells, and against its wielder's width at the least. */
const STEEL_CELLS = 0.95;
const STEEL_BY_WIDTH = 1;
/** How tall the blade of light stands against its wielder's width, at the least. */
const TALL_BY_WIDTH = 3;
/** How high over its wielder's foot the sword is held, against the wielder's width, and how much higher, in cells. */
const HELD_BY_WIDTH = 1.02;
const HELD_OVER_CELLS = 0.1;
/** How far from its target a sword that no one wields is swung, in cells. */
const UNWIELDED_CELLS = 2.4;
/** How far past its target the torrent runs, in cells, and how far it runs at the least. */
const RUNS_ON_CELLS = 9;
const RUNS_CELLS = 11;
/** How far the blade is drawn back before it is swung, in radians, and how long that takes, in seconds. */
const DRAWN_BACK = 0.26;
const DRAWS_BACK_S = 0.16;
/** How far along the torrent it comes down from the hands to run along the floor, in cells. */
const COMES_DOWN_CELLS = 1.7;
/** How high the middle of the torrent runs over the floor, as a share of its width. */
const RUNS_HIGH = 0.4;
/** Where along the sword of steel, from its pommel, its guard is: where the blade of light stands from. */
const GUARD_AT = 0.26;

/** Where a great sword is, in table pixels. */
export interface SwordPose {
  readonly cell: number;
  /** Whether someone wields it, rather than it being swung from a place beside its target. */
  readonly wielded: boolean;
  /** The middle of its wielder's foot, and how wide the wielder is. */
  readonly foot: Point;
  readonly wide: number;
  /** Where it is held: its pommel, over its wielder's head. */
  readonly hands: Point;
  /** The way it is brought down, over the floor and of length one, and how far off the target is. */
  readonly way: { readonly x: number; readonly y: number };
  readonly far: number;
  readonly floorZ: number;
  /** How long the sword of steel is, and how tall and how wide the blade of light on it. */
  readonly steel: number;
  readonly tall: number;
  readonly broad: number;
  /** How far before its wielder's foot the torrent starts, how far it runs from there, and how wide it is. */
  readonly rootAt: number;
  readonly runs: number;
  readonly thick: number;
  /** How far below level the blade lies once it is down, in radians. */
  readonly lies: number;
}

/** Where the great sword of a stage is, brought down towards the first target of its cast. */
export function swordPoseOf(stage: Stage, first: StageTarget): SwordPose {
  const U = stage.cell;
  const grade = stage.preset.gradeLevel;
  const floorZ = first.groundZ;
  const wielded = stage.origin !== null;
  const wide = stage.mouth?.widthPx ?? U * 0.55;
  const foot = stage.origin
    ? { x: stage.origin.x, y: stage.origin.y, z: stage.mouth ? stage.mouth.z - wide * 0.6 : floorZ }
    : {
        x: first.x - UNWIELDED_WAY.x * U * UNWIELDED_CELLS,
        y: first.y - UNWIELDED_WAY.y * U * UNWIELDED_CELLS,
        z: floorZ,
      };
  const dx = first.x - foot.x;
  const dy = first.y - foot.y;
  const far = Math.hypot(dx, dy);
  const way = far < 1 ? UNWIELDED_WAY : { x: dx / far, y: dy / far };
  const hands = { x: foot.x, y: foot.y, z: foot.z + wide * HELD_BY_WIDTH + U * HELD_OVER_CELLS };
  const steel = Math.max(U * STEEL_CELLS, wide * STEEL_BY_WIDTH);
  const tall = Math.max(U * TALL_BY_GRADE[grade], wide * TALL_BY_WIDTH);
  const thick = U * THICK_BY_GRADE[grade];
  const rootAt = wide * 0.5 + U * 0.15;
  const runs = Math.max(U * RUNS_CELLS, far - rootAt + first.widthPx * 0.5 + U * RUNS_ON_CELLS);
  const drop = hands.z - floorZ - thick * RUNS_HIGH;
  return {
    cell: U,
    wielded,
    foot,
    wide,
    hands,
    way,
    far,
    floorZ,
    steel,
    tall,
    broad: U * BROAD_BY_GRADE[grade] * Math.max(1, tall / (U * TALL_BY_GRADE[grade])),
    rootAt,
    runs,
    thick,
    lies: Math.asin(Math.min(0.5, Math.max(0, drop) / (tall + steel))),
  };
}

/**
 * How the sword is held at a moment, in radians up from the line it is brought down along: upright
 * and swaying a little while the light gathers, drawn back before the swing, and brought down ever
 * faster until it lies along the line as it is let go.
 */
export function swordTiltAt(pose: SwordPose, timing: GreatSwordTiming, t: number): number {
  const upright = Math.PI / 2;
  const sway = Math.sin(t * 2.3) * 0.02;
  const back = DRAWN_BACK * smooth(timing.swingsAt - DRAWS_BACK_S, timing.swingsAt, t);
  if (t <= timing.swingsAt) return upright + sway * (1 - back / DRAWN_BACK) + back;
  const swung = within(t, timing.swingsAt, timing.releasesAt);
  const from = upright + DRAWN_BACK;
  return from + (-pose.lies - from) * Math.pow(swung, 2.3);
}

/** The way the blade points for how it is held, of length one. */
export function bladeWay(pose: SwordPose, tilt: number): Point {
  return { x: pose.way.x * Math.cos(tilt), y: pose.way.y * Math.cos(tilt), z: Math.sin(tilt) };
}

/** A point of the sword a distance up it from the hands that hold it. */
export function upSword(pose: SwordPose, heading: Point, by: number): Point {
  return { x: pose.hands.x + heading.x * by, y: pose.hands.y + heading.y * by, z: pose.hands.z + heading.z * by };
}

/** A point of the blade of light a share of the way up it, from the guard of the sword at 0 to its point at 1. */
export function upBlade(pose: SwordPose, heading: Point, share: number): Point {
  return upSword(pose, heading, pose.steel * GUARD_AT + pose.tall * share);
}

/**
 * The middle of the torrent a distance along it from its root, which is just before its wielder: it
 * leaves from the hands and comes down to run along the floor.
 */
export function alongTorrent(pose: SwordPose, by: number): Point {
  const out = pose.rootAt + by;
  const low = pose.floorZ + pose.thick * RUNS_HIGH;
  const down = outCubic(within(by, 0, pose.cell * COMES_DOWN_CELLS));
  return {
    x: pose.foot.x + pose.way.x * out,
    y: pose.foot.y + pose.way.y * out,
    z: pose.hands.z + (low - pose.hands.z) * down,
  };
}

/** The floor under the torrent a distance along it. */
export function underTorrent(pose: SwordPose, by: number, aside = 0): Point {
  const out = pose.rootAt + by;
  return {
    x: pose.foot.x + pose.way.x * out - pose.way.y * aside,
    y: pose.foot.y + pose.way.y * out + pose.way.x * aside,
    z: pose.floorZ,
  };
}
