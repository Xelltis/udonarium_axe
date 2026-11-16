import { type BreathTiming } from '@axe/domain/effect/breath-timing';
import {
  bodyRadiusOf,
  type BreathAxis,
  type BreathCone,
  coneAxis,
  coneWidthAt,
  firstStruck,
  headTurnAt,
  nearestBodyFrom,
  streamFrontAt,
  topOf,
} from '@axe/domain/effect/scene/breath/breath-cone';
import { outCubic, type StageTarget } from '@axe/domain/effect/scene/choreography';
import { type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * What flows down a breath: gouts thrown from the mouth one after another for as long as it is
 * blown, each running down the cone at a steady pace however long the breath lasts, spreading as the
 * cone widens and rolling about its axis. A gout that meets a target breaks on it: it slides round
 * the target's side, is thrown back towards the caster, or climbs over its top, and dies there; one
 * that meets nothing is spent where the cone ends, and only a thin few run on past it. Where a gout
 * is at a moment is worked out from when it was thrown alone, so every seat draws the same stream.
 */

/** How far across the cone the middles of its gouts keep, as a share of its half width, so their edges stay about within it. */
const KEEPS_WITHIN = 0.85;
/** How much flatter than wide the cone is. */
const FLATNESS = 0.6;
/** How far apart a gout's way is tried for a target standing in it, in cells. */
const STRIKE_STEP_CELLS = 0.12;
/** How fast a gout spent in the open drifts on as it thins away, as a share of its pace. */
const SPENT_DRIFT = 0.3;

/** What a gout does where its flight ends. */
export type GoutEnd = 'wrap' | 'curl' | 'over' | 'spent';

/** One gout of a breath: see the header. Lengths in table pixels, times in seconds of the breath. */
export interface Gout {
  readonly bornAt: number;
  /** How fast it runs down the cone. */
  readonly pace: number;
  readonly axis: BreathAxis;
  /** Where across the cone it runs, as shares of its half width: to the side, and up. */
  readonly across: number;
  readonly up: number;
  /** How far it is rolled about the axis by the time it reaches the cone's end. */
  readonly rolls: number;
  /** How far out of the middle of the cone it runs, from 0 on the axis to 1 at the edge. */
  readonly edge: number;
  /** How wide it is as it leaves the mouth. */
  readonly size: number;
  readonly variant: number;
  /** How far from the mouth its flight ends, the target it ends on, or -1 for none, and what it does there, for how long. */
  readonly flies: number;
  readonly struck: number;
  readonly end: GoutEnd;
  readonly endS: number;
  /** How far it is thrown or turned as it breaks, by what it does: an angle for one that wraps, a length otherwise. */
  readonly thrown: number;
  /** How far it rises as it breaks. */
  readonly climbs: number;
}

/** Where a gout is at a moment, and how far through its life. */
export interface GoutState extends Point {
  /** Which way it is going, of length one. */
  readonly heading: Point;
  /** How far down the cone it has got, as a share of the cone's length, and on past 1 as it breaks. */
  readonly along: number;
  /** How far through its breaking it is, from 0 while it flies to 1 as it is gone. */
  readonly breaking: number;
  /** How much larger than at the mouth it has grown, and how much of it is left to see. */
  readonly grown: number;
  readonly left: number;
}

/** How a kind of gout is thrown. */
export interface GoutKind {
  /** How many are thrown a second at the middle grade. */
  readonly rate: number;
  /** How fast they run, as shares of the stream's pace. */
  readonly pace: readonly [number, number];
  /** How far out of the middle of the cone they run, as shares of its half width. */
  readonly edge: readonly [number, number];
  /** How wide they leave the mouth, in cells. */
  readonly size: readonly [number, number];
  /** How far they roll about the axis on their way, either way. */
  readonly rolls: number;
  /** Whether they keep to the upper half of the cone, as what curls up off its edge does. */
  readonly upper?: boolean;
  /** Whether they break on a target standing in their way; those that do not run on through it. */
  readonly breaks: boolean;
  /** The share of those that meet nothing that run on past the cone's end, and how far, in cells. */
  readonly leaks?: number;
  readonly leaksCells?: readonly [number, number];
}

/** What a cone and its gouts are thrown with. */
export interface StreamSetting {
  readonly cone: BreathCone;
  readonly timing: BreathTiming;
  readonly targets: readonly StageTarget[];
  /** How fast the stream runs down the cone, in table pixels a second. */
  readonly pace: number;
  /** How far its gouts rise by the cone's end, in table pixels; below nothing they sink. */
  readonly buoyancy: number;
  readonly seed: number;
}

/**
 * Throws the gouts of one kind for the whole of a breath: those already on their way down the cone
 * as it bursts, which the front of the stream uncovers as it shoots out, and those breathed until it
 * is spent, fewer and smaller as it fails.
 */
export function throwGouts(th: Thrower, setting: StreamSetting, kind: GoutKind): Gout[] {
  const { cone, timing, targets, pace } = setting;
  const U = th.cell;
  const gouts: Gout[] = [];
  const every = 1 / th.count(kind.rate);
  const slowest = pace * kind.pace[0];
  const clearUntil = nearestBodyFrom(cone.mouth, targets) - U * STRIKE_STEP_CELLS;
  for (let born = timing.burstsAt - cone.ends / slowest; born < timing.spentAt; born += every) {
    const bornAt = born + th.range(0, every);
    const failing = Math.min(1, Math.max(0, (bornAt - timing.failsAt) / (timing.spentAt - timing.failsAt)));
    const kept = !th.chance(failing * 0.7);
    const edge = th.range(kind.edge[0], kind.edge[1]);
    const round = th.range(0, Math.PI * 2);
    const own = pace * th.range(kind.pace[0], kind.pace[1]) * (1.12 - 0.24 * edge);
    const shaped = {
      bornAt,
      pace: own,
      axis: coneAxis(cone, headTurnAt(cone, timing, bornAt, setting.seed)),
      across: Math.cos(round) * edge,
      up: (kind.upper ? Math.abs(Math.sin(round)) : Math.sin(round)) * edge,
      rolls: th.range(-kind.rolls, kind.rolls),
      edge,
      size: th.range(kind.size[0], kind.size[1]) * U * (1 - 0.7 * failing),
      variant: th.range(0, 6),
    };
    const hit = kind.breaks
      ? firstStruck((along) => wayPoint(setting, shaped, along), clearUntil, cone.ends, U * STRIKE_STEP_CELLS, targets)
      : null;
    const pick = th.range(0, 1);
    const leaks = !hit && th.chance(kind.leaks ?? 0);
    const leakCells = kind.leaksCells ?? [0.8, 1.6];
    const end: GoutEnd = !hit ? 'spent' : pick < 0.55 ? 'wrap' : pick < 0.85 ? 'curl' : 'over';
    const gout: Gout = {
      ...shaped,
      size: leaks ? shaped.size * 0.55 : shaped.size,
      flies: hit
        ? hit.along
        : leaks
          ? cone.ends + th.range(leakCells[0], leakCells[1]) * U
          : cone.ends * th.range(0.9, 1.04),
      struck: hit ? hit.target : -1,
      end,
      endS: end === 'wrap' ? th.range(0.35, 0.6) : end === 'spent' ? th.range(0.2, 0.35) : th.range(0.3, 0.5),
      thrown: end === 'wrap' ? th.range(0.5, 0.95) * Math.PI : th.range(0.6, 1.4) * U,
      climbs: th.range(-0.1, 0.45) * U,
    };
    if (kept) gouts.push(gout);
  }
  return gouts;
}

/** Where a gout thrown down the cone is a way along its flight: spread as the cone widens, rolled about its axis, risen or sunk. */
export function wayPoint(
  setting: Pick<StreamSetting, 'cone' | 'buoyancy'>,
  gout: Pick<Gout, 'axis' | 'across' | 'up' | 'rolls' | 'bornAt'>,
  along: number
): Point {
  const { cone } = setting;
  const { way, side, lift } = gout.axis;
  const share = along / cone.ends;
  const wavering =
    1 + 0.1 * Math.sin(share * 7.3 - gout.bornAt * 11) + 0.05 * Math.sin(share * 13.1 + gout.bornAt * 6.2);
  const half = (coneWidthAt(cone, along) / 2) * KEEPS_WITHIN * wavering;
  const rolled = gout.rolls * share;
  const across = (gout.across * Math.cos(rolled) - gout.up * Math.sin(rolled)) * half;
  const up = (gout.across * Math.sin(rolled) + gout.up * Math.cos(rolled)) * half * FLATNESS;
  return {
    x: cone.mouth.x + way.x * along + side.x * across + lift.x * up,
    y: cone.mouth.y + way.y * along + side.y * across + lift.y * up,
    z: Math.max(
      cone.floorZ,
      cone.mouth.z + way.z * along + side.z * across + lift.z * up + setting.buoyancy * share * share
    ),
  };
}

/**
 * Where a gout is as it breaks, a share of the way through its breaking: sliding round the side of
 * the target it struck and on behind it, thrown back and aside from where it struck, climbing over
 * the target's top, or, spent in the open, drifting on.
 */
export function breakingPoint(setting: StreamSetting, gout: Gout, share: number): Point {
  const at = wayPoint(setting, gout, gout.flies);
  const target = setting.targets[gout.struck];
  const { way } = gout.axis;
  if (!target || gout.end === 'spent') {
    const on = gout.pace * SPENT_DRIFT * gout.endS * share;
    return { x: at.x + way.x * on, y: at.y + way.y * on, z: Math.max(setting.cone.floorZ, at.z + gout.climbs * share) };
  }
  const level = Math.hypot(way.x, way.y) || 1;
  const ahead = { x: way.x / level, y: way.y / level };
  const off = { x: at.x - target.x, y: at.y - target.y };
  const far = Math.hypot(off.x, off.y);
  const out = far > 1 ? { x: off.x / far, y: off.y / far } : { x: -ahead.x, y: -ahead.y };
  const leaning = ahead.x * out.y - ahead.y * out.x;
  const hand = Math.abs(leaning) > 0.02 ? Math.sign(leaning) : Math.floor(gout.variant) % 2 === 0 ? 1 : -1;
  if (gout.end === 'wrap') {
    const round = Math.atan2(out.y, out.x) - hand * gout.thrown * (1 - (1 - share) * (1 - share));
    const radius = Math.max(far, bodyRadiusOf(target)) * (1.05 + 0.4 * share);
    return {
      x: target.x + Math.cos(round) * radius,
      y: target.y + Math.sin(round) * radius,
      z: Math.max(setting.cone.floorZ, at.z + gout.climbs * share),
    };
  }
  if (gout.end === 'curl') {
    const flung = gout.thrown * outCubic(share);
    const aside = { x: -ahead.y * hand, y: ahead.x * hand };
    return {
      x: at.x + (out.x * 0.8 + aside.x * 0.6 * share) * flung,
      y: at.y + (out.y * 0.8 + aside.y * 0.6 * share) * flung,
      z: Math.max(
        setting.cone.floorZ,
        at.z + gout.thrown * 0.5 * Math.sin(share * Math.PI * 0.6) + gout.climbs * share
      ),
    };
  }
  const over = bodyRadiusOf(target) * 2 * share;
  const top = topOf(target) + gout.size * 0.3 - at.z;
  return {
    x: at.x + ahead.x * over,
    y: at.y + ahead.y * over,
    z: Math.max(setting.cone.floorZ, at.z + Math.max(top, 0) * Math.sin(share * Math.PI * 0.62) + gout.climbs * share),
  };
}

/**
 * Where a gout is at a moment of the breath, or null before it is thrown, while the front of the
 * stream has not yet got to it, and once it is gone.
 */
export function goutAt(setting: StreamSetting, gout: Gout, seconds: number): GoutState | null {
  const since = seconds - gout.bornAt;
  if (since < 0) return null;
  const { cone } = setting;
  const gone = since * gout.pace;
  if (Math.min(gone, gout.flies) > streamFrontAt(cone, setting.timing, seconds)) return null;
  if (gone < gout.flies) {
    const at = wayPoint(setting, gout, gone);
    const next = wayPoint(setting, gout, gone + 4);
    const along = gone / cone.ends;
    return {
      ...at,
      heading: headingOf(at, next, gout.axis.way),
      along,
      breaking: 0,
      grown: 0.75 + 1.6 * along,
      left: 1,
    };
  }
  const breaking = (since - gout.flies / gout.pace) / gout.endS;
  if (breaking >= 1) return null;
  const at = breakingPoint(setting, gout, breaking);
  const next = breakingPoint(setting, gout, Math.min(1, breaking + 0.04));
  const reached = gout.flies / cone.ends;
  return {
    ...at,
    heading: headingOf(at, next, gout.axis.way),
    along: reached + 0.35 * breaking,
    breaking,
    grown: (0.75 + 1.6 * Math.min(reached, 1.2)) * (1 - (gout.end === 'spent' ? 0.45 : 0.65) * breaking),
    left: gout.end === 'spent' ? 1 - breaking : 1 - breaking * breaking,
  };
}

/** The way from one point to the next, of length one, or the way given where they are the same. */
function headingOf(from: Point, to: Point, otherwise: Point): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dz = to.z - from.z;
  const length = Math.hypot(dx, dy, dz);
  return length > 0.001 ? { x: dx / length, y: dy / length, z: dz / length } : otherwise;
}
