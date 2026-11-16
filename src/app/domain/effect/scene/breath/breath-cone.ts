import { type BreathTiming } from '@axe/domain/effect/breath-timing';
import { outCubic, type StageMouth, type StageTarget, within } from '@axe/domain/effect/scene/choreography';
import { acrossOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The shape of a breath: one cone from the mouth over every target of the cast, narrow at the mouth
 * and widening to where the furthest target stands, which the head sways a little as it blows and
 * turns from side to side where the targets stand too far apart for the cone to cover at once. Every
 * length is in table pixels and every angle in radians.
 */

/** How wide the cone is at the mouth and where it reaches, in cells, for a caster of one cell. */
const WIDTH_AT_MOUTH_CELLS = 0.4;
const WIDTH_AT_REACH_CELLS = 2.5;
/** How wide the cone is at the mouth of a large caster, as a share of the caster's width. */
const WIDTH_OF_CASTER = 0.3;
/** How far a cone must reach to be as wide as it gets, in cells; one that reaches less is narrower. */
const FULL_WIDTH_FROM_CELLS = 4;
/** How far past the furthest target the body of the cone ends, in cells. */
const ENDS_PAST_CELLS = 0.5;
/** How far the head sways each way as it blows, and how many times a second. */
const SWAY = 0.052;
const SWAYS_HZ = 0.7;
/** The furthest the head turns each way to blow over targets the cone cannot cover at once. */
const MOST_TURNED = 1.1;
/** How high up a piece its middle is and how high it stands, as shares of its width, and how far from its middle a stream strikes it. */
const CHEST_HEIGHT = 0.45;
const BODY_HEIGHT = 1;
const BODY_RADIUS = 0.42;

/** One cone of breath: see the header. */
export interface BreathCone {
  readonly mouth: Point;
  /** Which way it blows over the table, and how steeply it rises, as the rise over one length along it. */
  readonly yaw: number;
  readonly rise: number;
  /** How far it is from the mouth to the furthest target, and to where the body of the cone ends. */
  readonly reach: number;
  readonly ends: number;
  readonly widthAtMouth: number;
  readonly widthAtReach: number;
  /** How far the head turns each way to blow over all its targets; nothing where the cone covers them at once. */
  readonly turns: number;
  /** How long one turn of the head from side to side and back takes, in seconds. */
  readonly turnS: number;
  readonly floorZ: number;
}

/** The ways of a cone as its head is turned: along it, level across it, and up across it, each of length one. */
export interface BreathAxis {
  readonly way: Point;
  readonly side: Point;
  readonly lift: Point;
}

/** The middle of a target, which a breath is aimed at. */
export function chestOf(target: Pick<StageTarget, 'x' | 'y' | 'z' | 'widthPx'>): Point {
  return { x: target.x, y: target.y, z: target.z + target.widthPx * CHEST_HEIGHT };
}

/**
 * The cone a breath blows from a mouth over its targets, for a cell drawn `cell` wide: aimed between
 * the outermost of them, reaching the furthest, wider for a larger caster and narrower for a short
 * reach, and turning from side to side by as much as the outermost targets stand outside it.
 */
export function breathConeOf(
  mouth: StageMouth,
  targets: readonly StageTarget[],
  cell: number,
  timing: BreathTiming,
  floorZ: number
): BreathCone {
  const aims = targets.map((target) => {
    const chest = chestOf(target);
    const far = Math.hypot(chest.x - mouth.x, chest.y - mouth.y);
    return { chest, far, yaw: Math.atan2(chest.y - mouth.y, chest.x - mouth.x), widthPx: target.widthPx };
  });
  const middle = Math.atan2(
    aims.reduce((sum, aim) => sum + Math.sin(aim.yaw), 0),
    aims.reduce((sum, aim) => sum + Math.cos(aim.yaw), 0)
  );
  const offs = aims.map((aim) => wrapped(aim.yaw - middle));
  const yaw = middle + (Math.min(...offs) + Math.max(...offs)) / 2;
  const level = Math.max(cell * 0.5, ...aims.map((aim) => aim.far));
  const height = aims.reduce((sum, aim) => sum + aim.chest.z, 0) / aims.length - mouth.z;
  const reach = Math.hypot(level, height);
  const widthAtMouth = Math.max(cell * WIDTH_AT_MOUTH_CELLS, mouth.widthPx * WIDTH_OF_CASTER);
  const grown = Math.sqrt(widthAtMouth / (cell * WIDTH_AT_MOUTH_CELLS));
  const short = Math.min(1, Math.max(0.5, Math.sqrt(reach / (cell * FULL_WIDTH_FROM_CELLS))));
  const widthAtReach = Math.max(widthAtMouth, cell * WIDTH_AT_REACH_CELLS * grown * short);
  const shape = { reach, widthAtMouth, widthAtReach };
  const outside = aims.map((aim) => {
    const off = Math.abs(wrapped(aim.yaw - yaw));
    const covered = Math.atan2(coneWidthAt(shape, aim.far) / 2 + aim.widthPx * 0.25, Math.max(aim.far, 1));
    return off - covered;
  });
  return {
    mouth: { x: mouth.x, y: mouth.y, z: mouth.z },
    yaw,
    rise: height / reach,
    reach,
    ends: reach + cell * ENDS_PAST_CELLS,
    widthAtMouth,
    widthAtReach,
    turns: Math.min(MOST_TURNED, Math.max(0, ...outside)),
    turnS: Math.min(1.8, Math.max(0.8, (timing.failsAt - timing.burstsAt) / 1.5)),
    floorZ,
  };
}

/** How wide a cone is a way along it: narrow at the mouth and widening fastest near it, a little wider still past its reach. */
export function coneWidthAt(cone: Pick<BreathCone, 'reach' | 'widthAtMouth' | 'widthAtReach'>, along: number): number {
  const share = Math.min(1.3, Math.max(0, along / cone.reach));
  return cone.widthAtMouth + (cone.widthAtReach - cone.widthAtMouth) * Math.pow(share, 0.8);
}

/**
 * How far the head is turned aside at a moment: swaying a little all the while, and turning from
 * side to side over targets the cone cannot cover at once, from straight ahead as it bursts.
 */
export function headTurnAt(cone: BreathCone, timing: BreathTiming, seconds: number, seed: number): number {
  const sway = SWAY * Math.sin(seconds * Math.PI * 2 * SWAYS_HZ + (seed % 89) * 0.21);
  if (cone.turns <= 0) return sway;
  return sway + cone.turns * Math.sin(((seconds - timing.burstsAt) / cone.turnS) * Math.PI * 2);
}

/** The ways of a cone with its head turned aside by an angle. */
export function coneAxis(cone: BreathCone, turned: number): BreathAxis {
  const yaw = cone.yaw + turned;
  const level = Math.sqrt(Math.max(0, 1 - cone.rise * cone.rise));
  const way = { x: Math.cos(yaw) * level, y: Math.sin(yaw) * level, z: cone.rise };
  return { way, ...acrossOf(way) };
}

/** How far from the mouth the front of the stream has got at a moment: out fast as it bursts, to the end of the cone. */
export function streamFrontAt(cone: BreathCone, timing: BreathTiming, seconds: number): number {
  if (seconds < timing.burstsAt) return 0;
  return cone.ends * outCubic(within(seconds, timing.burstsAt, timing.reachesAt));
}

/** Whether a point is within the body of a target, which a stream breaks on: an upright drum about its middle. */
export function strikes(target: StageTarget, point: Point): boolean {
  if (point.z < target.z || point.z > target.z + target.widthPx * BODY_HEIGHT) return false;
  return Math.hypot(point.x - target.x, point.y - target.y) < target.widthPx * BODY_RADIUS;
}

/** How far from its middle a stream breaks on a target. */
export function bodyRadiusOf(target: Pick<StageTarget, 'widthPx'>): number {
  return target.widthPx * BODY_RADIUS;
}

/** How high the top of a target is. */
export function topOf(target: Pick<StageTarget, 'z' | 'widthPx'>): number {
  return target.z + target.widthPx * BODY_HEIGHT;
}

/** How far from a point the nearest of some targets' bodies begins; nothing where the point is within one. */
export function nearestBodyFrom(point: Point, targets: readonly StageTarget[]): number {
  const gaps = targets.map(
    (target) => Math.hypot(target.x - point.x, target.y - point.y) - target.widthPx * BODY_RADIUS
  );
  return Math.max(0, Math.min(...gaps));
}

/**
 * Where a path first strikes a target: how far along it, to within a step, and which of the targets
 * it is; null for a path that passes them all by before it ends. It is tried from `from` along it on,
 * for a path known to meet nothing before that.
 */
export function firstStruck(
  pathAt: (along: number) => Point,
  from: number,
  ends: number,
  step: number,
  targets: readonly StageTarget[]
): { readonly along: number; readonly target: number } | null {
  for (let along = Math.max(step, from); along <= ends; along += step) {
    const point = pathAt(along);
    const target = targets.findIndex((candidate) => strikes(candidate, point));
    if (target >= 0) return { along: Math.max(0, along - step / 2), target };
  }
  return null;
}

/** An angle taken within half a round either way. */
function wrapped(angle: number): number {
  const round = Math.PI * 2;
  return ((((angle + Math.PI) % round) + round) % round) - Math.PI;
}
