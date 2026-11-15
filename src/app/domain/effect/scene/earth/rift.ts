import { quakeStrikesOf } from '@axe/domain/effect/earth-looks';
import { flowingMote } from '@axe/domain/effect/scene/breath/breath-draw';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { drawSlab, type EarthTones, layDent, type Slab, throwSlabs } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { drawEmbers, type HotPoint, layGash, throwEmbers } from '@axe/domain/effect/scene/earth/rift-parts';
import { type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  keptFor,
  lightBall,
  type Point,
  stageKey,
  starBurst,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A rift. The caster stamps the ground and it tears open from before it to the target in a running
 * jagged line: dust and gravel spray up off the head of the tear as it runs, its depths glow red and
 * white behind it, and slabs of the floor are levered up along both its lips as it passes. Where it
 * reaches the target the ground bursts: a blast of dust and stones, boulders thrown up, a star of
 * cracks and slabs about the target's feet. The tear runs on a little past it, glowing, then the whole
 * crack is left to cool from orange to a dark scar while embers rise out of it and the stones lie.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** How far before its caster a rift starts, and how far past its target it runs on, in cells. */
const STARTS_BEFORE_CELLS = 0.5;
const RUNS_PAST_CELLS = 0.9;
/** Where a rift no one casts starts, from its target: towards the south-west, in cells. */
const UNCAST_FROM_CELLS = 3;
const UNCAST_WAY = { x: -Math.SQRT1_2, y: Math.SQRT1_2 } as const;
/** How far before its target a rift a shot or a blade lands in starts, in cells. */
const LANDING_FROM_CELLS = 1.4;
/** How far apart the bends of a rift are, how far each is thrown aside, and how wide it gapes, in cells. */
const BEND_CELLS = 0.6;
const JAG_CELLS = 0.2;
const GAPES_CELLS = 0.8;
/** When the tear sets off, in seconds, and how long it takes to run on past its target once it is there. */
const SETS_OFF_S = 0.03;
const RUNS_ON_S = 0.1;
/** How long the crack holds its glow after the blast, how long it takes to cool after that, and how long before the end all it left clears, in seconds. */
const HOLDS_HOT_S = 0.45;
const COOLS_S = 2.2;
const CLEARS_S = 0.6;
/** How long the flash of the blast and its glow last, in seconds. */
const FLASH_S = 0.08;
const BLAST_GLOW_S = 0.45;
/** How long the stamp at the caster's feet lasts, in seconds. */
const STAMP_S = 0.3;

/** One bend of a rift: where it is, how far along the rift, in table pixels, and how wide the crack gapes there. */
interface Bend {
  readonly at: Point;
  readonly along: number;
  readonly wide: number;
}

/** A rift laid out over the floor, and what it throws. */
interface RiftThrow {
  readonly from: Point;
  readonly target: Point;
  readonly way: { readonly x: number; readonly y: number };
  readonly bends: readonly Bend[];
  /** How far along the rift the target stands, in table pixels. */
  readonly reaches: number;
  readonly reachAt: number;
  readonly slabs: readonly Slab[];
  readonly rocks: readonly Rock[];
  readonly dust: readonly Cloud[];
  readonly embers: readonly ThrownMote[];
  readonly star: readonly { readonly to: Point; readonly seed: number }[];
}

const riftByStage = new Map<string, RiftThrow>();

/** Where a rift starts and the way it runs, over the floor: from before its caster, from beside its target, or close before a landing. */
function startOf(stage: Stage, target: Point, landing: boolean): { from: Point; way: { x: number; y: number } } {
  const U = stage.cell;
  const origin = stage.origin;
  const dx = origin ? target.x - origin.x : 0;
  const dy = origin ? target.y - origin.y : 0;
  const far = Math.hypot(dx, dy);
  const way = origin && far > U * 0.5 ? { x: dx / far, y: dy / far } : { x: -UNCAST_WAY.x, y: -UNCAST_WAY.y };
  const back = landing
    ? LANDING_FROM_CELLS * U
    : origin && far > U * 1.2
      ? far - STARTS_BEFORE_CELLS * U
      : UNCAST_FROM_CELLS * U;
  return { from: { x: target.x - way.x * back, y: target.y - way.y * back, z: target.z }, way };
}

/** When the tear reaches a distance along the rift, in seconds. */
function opensAt(rift: Pick<RiftThrow, 'reaches' | 'reachAt'>, along: number, ends: number): number {
  const setsOff = Math.min(SETS_OFF_S, rift.reachAt * 0.1);
  if (along <= rift.reaches) return setsOff + (rift.reachAt - setsOff) * (along / Math.max(1, rift.reaches));
  return rift.reachAt + RUNS_ON_S * Math.min(1, (along - rift.reaches) / Math.max(1, ends - rift.reaches));
}

function throwRift(stage: Stage, tones: EarthTones, ends: number, landing: boolean): RiftThrow {
  const th = throwerFor(stage, ends);
  const U = stage.cell;
  const target = { x: stage.x, y: stage.y, z: stage.groundZ };
  const { from, way } = startOf(stage, target, landing);
  const side = { x: -way.y, y: way.x };
  const reaches = Math.hypot(target.x - from.x, target.y - from.y);
  const length = reaches + RUNS_PAST_CELLS * U;
  const thin = Math.min(1, 1.3 / Math.sqrt(Math.max(1, stage.targets.length)));
  const count = Math.max(4, Math.min(18, Math.round((length * thin) / (BEND_CELLS * U))));
  const reachAt =
    stage.blowsAt[0] ?? quakeStrikesOf(stage.preset, stage.duration)?.[0] ?? Math.min(0.3, stage.duration * 0.14);
  let swing = th.chance(0.5) ? 1 : -1;
  const bends: Bend[] = Array.from({ length: count + 1 }, (_unused, index) => {
    const along = (length * index) / count;
    const nearTarget = Math.abs(along - reaches) < BEND_CELLS * U * 0.6;
    swing = -swing;
    const aside =
      index === 0 || index === count ? 0 : swing * th.range(0.35, 1) * JAG_CELLS * U * (nearTarget ? 0.3 : 1);
    const share = along / length;
    return {
      at: { x: from.x + way.x * along + side.x * aside, y: from.y + way.y * along + side.y * aside, z: target.z },
      along,
      wide: GAPES_CELLS * U * (0.45 + 0.55 * Math.sin(Math.PI * Math.min(1, share * 1.15))) * (nearTarget ? 1.35 : 1),
    };
  });
  const rift = { reaches, reachAt };
  const slabs: Slab[] = [];
  const rocks: Rock[] = [];
  const dust: Cloud[] = [];
  for (const [index, bend] of bends.entries()) {
    const at = opensAt(rift, bend.along, length);
    if (index > 0 && index < count) {
      for (const lip of [1, -1]) {
        if (!th.chance(0.9 * thin)) continue;
        const long = th.range(0.42, 0.66);
        const reach = bend.wide * 0.5 + long * U * 0.85;
        slabs.push({
          hinge: { x: bend.at.x + side.x * lip * reach, y: bend.at.y + side.y * lip * reach, z: target.z },
          out: { x: side.x * lip, y: side.y * lip },
          long,
          wide: th.range(0.42, 0.62),
          liftsAt: at + 0.02,
          peak: th.range(1.05, 1.45),
          rests: th.range(0.5, 0.95),
          tone: Math.floor(th.range(0, 2.99)),
          variant: th.range(0, 6),
        });
      }
    }
    if (bend.along > reaches + U * 0.3) continue;
    rocks.push(
      ...throwRocks(th, bend.at, th.count(3), {
        size: [0.06, 0.16],
        up: [3, 6.5],
        out: [0.4, 1.6],
        bornAt: [at, at + 0.04],
        from: 0.1,
        bounce: 0.3,
      })
    );
    dust.push(
      ...kickedDust(th, bend.at, th.count(2), tones.dust, {
        speed: [1.5, 3.5],
        size: [0.5, 0.75],
        bornAt: [at, at + 0.05],
        rise: [1, 3],
        alpha: 0.6,
        life: [0.8, 1.5],
      }),
      ...kickedDust(th, bend.at, 1, tones.sand, {
        speed: [2, 4],
        size: [0.3, 0.45],
        bornAt: [at, at + 0.03],
        rise: [5, 9],
        alpha: 0.8,
        life: [0.3, 0.55],
        jet: 1.4,
      })
    );
  }
  throwBlast(th, target, way, reachAt, tones, { slabs, rocks, dust }, thin);
  const star = Array.from({ length: thin < 0.9 ? 2 : 4 }, (_unused, index) => {
    const turn = Math.atan2(way.y, way.x) + Math.PI * (0.35 + index * 0.45) + th.range(-0.2, 0.2);
    const far = th.range(0.8, 1.4) * U;
    return {
      to: { x: target.x + Math.cos(turn) * far, y: target.y + Math.sin(turn) * far, z: target.z },
      seed: stage.seed + index * 29,
    };
  });
  const embers = throwEmbers(
    th,
    bends.map((bend) => bend.at),
    th.count(26),
    [reachAt + 0.1, reachAt + HOLDS_HOT_S + COOLS_S]
  );
  return { from, target, way, bends, reaches, reachAt, slabs, rocks, dust, embers, star };
}

/** What bursts out of the ground where a rift reaches its target, thinned by `thin` where many are cast together. */
function throwBlast(
  th: Thrower,
  target: Point,
  way: { readonly x: number; readonly y: number },
  at: number,
  tones: EarthTones,
  into: { slabs: Slab[]; rocks: Rock[]; dust: Cloud[] },
  thin: number
): void {
  const fan = { toward: Math.atan2(way.y, way.x), spread: 1.2, share: 0.6 };
  into.rocks.push(
    ...throwRocks(th, target, th.count(3), {
      size: [0.38, 0.62],
      up: [6, 8.5],
      out: [0.4, 1.3],
      bornAt: [at, at + 0.05],
      from: 0.15,
      fan,
      bounce: 0.36,
    }),
    ...throwRocks(th, target, th.count(12), {
      size: [0.12, 0.26],
      up: [5, 10],
      out: [0.5, 2.6],
      bornAt: [at, at + 0.07],
      fan,
    }),
    ...throwRocks(th, target, th.count(28), {
      size: [0.04, 0.09],
      up: [5, 12],
      out: [0.3, 3.2],
      bornAt: [at, at + 0.08],
      bounce: 0.25,
    })
  );
  into.slabs.push(...throwSlabs(th, target, Math.max(2, Math.round(th.count(6) * thin)), [0.55, 1], at, 9));
  into.dust.push(
    ...earthPlumes(th, target, th.count(9), tones.dust, { rise: [8, 14], bornAt: [at, at + 0.12], long: 2.6 }),
    ...kickedDust(th, target, th.count(12), tones.sand, {
      speed: [5, 11],
      size: [0.32, 0.55],
      bornAt: [at, at + 0.03],
      rise: [1, 6],
      from: 0.2,
      alpha: 0.75,
      life: [0.3, 0.6],
      jet: 1.6,
    }),
    ...kickedDust(th, target, th.count(8), tones.dust, {
      speed: [1.6, 4.4],
      size: [0.6, 0.95],
      bornAt: [at, at + 0.08],
      alpha: 0.5,
    })
  );
}

/** A rift: see the head of this file. One a shot or a blade lands in opens close before its target, all at once. */
export function drawRift(stage: Stage, tones: EarthTones, lingerS: number, landing = false): Staged {
  const drawn: Staged = { motes: [], ribbons: [], floor: [], lights: [] };
  const U = stage.cell;
  const t = stage.seconds;
  const ends = stage.duration + lingerS;
  const origin = stage.origin;
  const key = `${stageKey(stage, ends)}|${origin?.x ?? ''}|${origin?.y ?? ''}|${landing}`;
  const rift = keptFor(riftByStage, key, () => throwRift(stage, tones, ends, landing));
  const length = rift.bends.at(-1)!.along;
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const since = t - rift.reachAt;
  const cooling = Math.pow(1 - within(since, HOLDS_HOT_S, HOLDS_HOT_S + COOLS_S), 1.3);
  const flare = since >= 0 ? Math.exp(-since / 0.35) : 0;
  const heatAt = (along: number) => {
    const opened = t - opensAt(rift, along, length);
    if (opened < 0) return 0;
    if (since < 0) return 0.55 + 0.45 * Math.exp(-opened / 0.18);
    return (0.55 + 0.45 * flare) * cooling;
  };
  const head =
    since < 0
      ? rift.reaches * within(t, opensAt(rift, 0, length), rift.reachAt)
      : rift.reaches + (length - rift.reaches) * outCubic(within(since, 0, RUNS_ON_S));
  for (const slab of rift.slabs) drawSlab(drawn, slab, t, U, tones, clearing);
  const opened: HotPoint[] = [];
  for (let index = 0; index < rift.bends.length - 1; index++) {
    const a = rift.bends[index];
    const b = rift.bends[index + 1];
    if (a.along >= head) break;
    const share = Math.min(1, (head - a.along) / (b.along - a.along));
    const to = { x: a.at.x + (b.at.x - a.at.x) * share, y: a.at.y + (b.at.y - a.at.y) * share, z: a.at.z };
    if (index === 0) opened.push({ at: a.at, heat: heatAt(a.along) });
    opened.push({ at: to, heat: heatAt(Math.min(head, b.along)) });
  }
  layGash(drawn, opened, GAPES_CELLS * U, tones, clearing, stage.seed);
  for (const [index, ray] of rift.star.entries()) {
    const run = outCubic(within(since, 0, 0.08));
    if (run <= 0) continue;
    const to = {
      x: rift.target.x + (ray.to.x - rift.target.x) * run,
      y: rift.target.y + (ray.to.y - rift.target.y) * run,
      z: rift.target.z,
    };
    const heat = heatAt(rift.reaches) * 0.9;
    layGash(
      drawn,
      [
        { at: rift.target, heat },
        { at: to, heat },
      ],
      U * (0.36 - index * 0.05),
      tones,
      clearing,
      ray.seed
    );
  }
  if (since >= 0) {
    layDent(drawn, rift.target, U * 0.75 * Math.min(1, since / 0.06 + 0.3), tones, clearing, stage.seed);
    const glowing = heatAt(rift.reaches);
    if (glowing > 0.03)
      drawn.floor.push(floorMark('disc', rift.target, U * 1.1, 1, tones.glow, 0.65 * glowing * clearing, 'light', 0));
  }
  for (const cloud of rift.dust) drawCloud(drawn, cloud, t, U, 0);
  for (const rock of rift.rocks) drawRock(drawn, rock, t, U, tones);
  drawEmbers(drawn, rift.embers, t, U, tones, clearing);
  drawStamp(drawn, rift.from, t, U, tones);
  if (since < 0) drawHead(drawn, rift, head, t, U, tones);
  else drawBlast(drawn, rift.target, since, U, tones, stage.seed);
  if (since >= 0 && cooling > 0.02) {
    const middle = rift.bends[Math.floor(rift.bends.length / 2)].at;
    drawn.lights.push({
      ...middle,
      z: middle.z + U * 0.3,
      color: tones.glow,
      strength: 0.7 * cooling * clearing,
      reachPx: U * 2.6,
    });
  }
  return drawn;
}

/** The stamp at the caster's feet that sets the rift off: a ring of dust thrown out over the floor. */
function drawStamp(drawn: Staged, from: Point, t: number, U: number, tones: EarthTones): void {
  if (t >= STAMP_S) return;
  layShockRing(drawn, from, U * 0.2, U * 1.5, U * 0.25, tones.sand, t, STAMP_S);
  drawn.motes.push(glow({ ...from, z: from.z + U * 0.15 }, U * 1.2, tones.glow, 0.5 * (1 - t / STAMP_S), U * 0.3));
}

/** The head of the tear as it runs: white-hot where it splits the ground, and a fan of dust and grit spraying off it. */
function drawHead(drawn: Staged, rift: RiftThrow, head: number, t: number, U: number, tones: EarthTones): void {
  if (head <= 0) return;
  const at = pointAlong(rift, head);
  const lifted = { ...at, z: at.z + U * 0.12 };
  drawn.motes.push(glow(lifted, U * 1.8, tones.glow, 0.75, U * 0.3));
  drawn.motes.push(lightBall(lifted, U * 0.42, tones.hot, 0.95, U * 0.35));
  for (const [index, lean] of [-0.7, 0, 0.7].entries()) {
    const out = { x: -rift.way.y * lean + rift.way.x * 0.5, y: rift.way.x * lean + rift.way.y * 0.5, z: 1 };
    drawn.motes.push(
      flowingMote('jet', at, out, U * (0.55 - 0.1 * Math.abs(lean)), U * (1.25 + 0.3 * (index % 2)), t * 9 + index, {
        color: tones.dust,
        core: tones.sand,
        alpha: 0.9,
        forward: U * 0.3,
        variant: index * 2.1,
      })
    );
  }
  drawn.lights.push({ ...lifted, z: lifted.z + U * 0.4, color: tones.glow, strength: 1.3, reachPx: U * 2.6 });
}

/** The blast where the rift reaches its target: a white flash lighting the ground, rays of heat and a ring thrown out over the floor. */
function drawBlast(drawn: Staged, target: Point, since: number, U: number, tones: EarthTones, seed: number): void {
  if (since >= BLAST_GLOW_S + 0.3) return;
  const heart = { ...target, z: target.z + U * 0.4 };
  const left = 1 - since / BLAST_GLOW_S;
  if (since < FLASH_S) {
    const white = 1 - since / FLASH_S;
    drawn.floor.push(floorMark('disc', target, U * 2, 1, '#fff4dc', 0.6 * white, 'light', 0));
    drawn.motes.push(lightBall(heart, U * 1.1 * (0.6 + 0.4 * white), '#fff4dc', white, U * 0.5));
    drawn.motes.push({
      ...glow({ ...heart, z: heart.z + U * 0.8 }, U * 0.45, '#fff4dc', white, U * 0.5),
      shape: 'flare',
      trail: 7,
      spin: Math.PI / 2,
    });
  }
  if (left > 0) drawn.motes.push(glow(heart, U * 3, tones.glow, 0.85 * left, U * 0.4));
  drawn.motes.push(...starBurst(heart, U * 2.8, tones.hot, since / 0.3, U * 0.45, 6, seed));
  layShockRing(drawn, target, U * 0.4, U * 3.4, U * 0.4, tones.sand, since, 0.5);
  if (left > 0)
    drawn.lights.push({ ...heart, z: heart.z + U * 0.5, color: tones.glow, strength: 2 * left, reachPx: U * 3.6 });
}

/** The point a distance along a rift's bends. */
function pointAlong(rift: RiftThrow, along: number): Point {
  for (let index = 1; index < rift.bends.length; index++) {
    const b = rift.bends[index];
    if (along > b.along) continue;
    const a = rift.bends[index - 1];
    const share = (along - a.along) / Math.max(1, b.along - a.along);
    return { x: a.at.x + (b.at.x - a.at.x) * share, y: a.at.y + (b.at.y - a.at.y) * share, z: a.at.z };
  }
  return rift.bends.at(-1)!.at;
}
