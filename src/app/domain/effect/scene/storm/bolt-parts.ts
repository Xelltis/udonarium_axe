import { type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { drawSpark, layShockRing, laySoot } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  haze,
  hueOf,
  keptFor,
  lightBall,
  type Point,
  smokePuff,
  stageKey,
  starBurst,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';
import { boltRibbons, boltShape } from '@axe/domain/effect/scene/storm/lightning';

/*
 * What every bolt of lightning is built of where it lands: the white instant of the stroke, which
 * lights the table hard; small bolts crawling over the body it struck and out over the floor; sparks
 * skittering along the floor; soot that glows and cools under a thin ring; and what is left crackling
 * over the piece and the floor until the thunder has died away.
 */

/** How long the soot and the smoke of a bolt stay after its playback, in seconds. */
export const BOLT_LINGER_S = 1.5;
/** The dark a storm lays over the floor under it, and the colour of its cloud. */
export const GLOOM = '#0d0a1c';
export const CLOUD = '#2b2740';

/** The piece a bolt strikes: its foot, the floor under it, the top of its head, and how wide it is, in table pixels. */
export interface StruckBody {
  readonly foot: Point;
  readonly floor: Point;
  readonly head: Point;
  readonly wide: number;
}

/** The piece a stage plays on, as a bolt strikes it. */
export function struckBodyOf(stage: Stage): StruckBody {
  const own = stage.targets.find((target) => target.index === stage.index);
  return {
    foot: { x: stage.x, y: stage.y, z: stage.z },
    floor: { x: stage.x, y: stage.y, z: stage.groundZ },
    head: { x: stage.x, y: stage.y, z: stage.z + stage.tall * 0.92 },
    wide: Math.min(own?.widthPx ?? stage.cell, stage.cell * 1.4),
  };
}

/**
 * How much of its detail a bolt keeps where a cast strikes many pieces at once, from 1 on up to four
 * of them down towards nothing: what the scene draws in a frame is shared between all of them, and a
 * bolt that kept all its forks on every piece would leave the last of them with none. A bolt a great
 * sword lands with keeps less again, the torrent it lands in forking lightning of its own.
 */
export function detailOf(stage: Stage): number {
  const shared = stage.preset.effectKind === 'skyblade' ? SHARED_WITH_TORRENT : 1;
  return Math.min(1, (4 / Math.max(1, stage.targets.length)) ** 1.5) * shared;
}

/** How much of its detail a bolt keeps where it lands in the torrent of a great sword. */
const SHARED_WITH_TORRENT = 0.4;

/** As many of a part as a bolt keeps of `most` at a detail, and never fewer than `least`. */
export function kept(most: number, detail: number, least = 1): number {
  return Math.max(least, Math.round(most * detail));
}

/** A point on the body: a turn round it, and a share of the way up it. */
function onBody(body: StruckBody, turn: number, share: number): Point {
  return {
    x: body.foot.x + Math.cos(turn) * body.wide * 0.32,
    y: body.foot.y + Math.sin(turn) * body.wide * 0.32,
    z: body.foot.z + (body.head.z - body.foot.z) * share,
  };
}

/**
 * Small bolts crawling over the body of the piece struck, each from one part of it to another, in the
 * shapes `flicker` picks.
 */
export function layBodyArcs(
  drawn: Staged,
  body: StruckBody,
  cell: number,
  ramp: readonly string[],
  seed: number,
  flicker: number,
  count: number,
  alpha: number,
  thick = 0.3
): void {
  if (alpha <= 0) return;
  const next = seededRun(seed * 131 + flicker * 17 + 3);
  for (let arc = 0; arc < count; arc++) {
    const turn = next() * Math.PI * 2;
    const share = next();
    const from = onBody(body, turn, 0.08 + share * 0.9);
    const to = onBody(body, turn + (next() - 0.5) * 2.8, Math.min(1, Math.max(0, share + (next() - 0.5) * 1.1)));
    const shape = boltShape(from, to, seed + arc * 7, flicker, { breaks: 3, jag: 0.22, floorZ: body.floor.z });
    drawn.ribbons.push(...boltRibbons(shape, cell, ramp, alpha, thick, 0.3));
  }
}

/**
 * Discharges crawling out over the floor from where a bolt struck, as far as `reach`, each jagged and
 * forked, lying on the floor, in the shapes `flicker` picks, with a glint where each ends.
 */
export function layGroundCrawl(
  drawn: Staged,
  floor: Point,
  cell: number,
  ramp: readonly string[],
  seed: number,
  flicker: number,
  count: number,
  reach: number,
  alpha: number,
  thick = 0.3
): void {
  if (alpha <= 0 || reach <= 0) return;
  const next = seededRun(seed * 173 + flicker * 29 + 11);
  const lies = floor.z + cell * 0.04;
  for (let crawl = 0; crawl < count; crawl++) {
    const turn = ((crawl + next() * 0.8) / count) * Math.PI * 2;
    const far = reach * (0.55 + 0.45 * next());
    const from = { x: floor.x + Math.cos(turn) * cell * 0.12, y: floor.y + Math.sin(turn) * cell * 0.12, z: lies };
    const to = { x: floor.x + Math.cos(turn) * far, y: floor.y + Math.sin(turn) * far, z: lies };
    const shape = boltShape(from, to, seed + crawl * 13, flicker, {
      breaks: 3,
      jag: 0.16,
      forks: 2,
      forkReach: 0.5,
      forkBreaks: 2,
    });
    const flat = (points: Point[]) => points.map((point) => ({ ...point, z: lies }));
    drawn.ribbons.push(
      ...boltRibbons({ main: flat(shape.main), forks: shape.forks.map(flat) }, cell, ramp, alpha, thick, 0.12)
    );
    drawn.motes.push({ ...glow(to, cell * 0.16, '#ffffff', alpha, cell * 0.2), shape: 'star', spin: flicker + crawl });
  }
}

/**
 * The instant a stroke lands: a hard white heart where it strikes, a glare of its colour laid over
 * the piece rather than added, the floor lit under it, and the table lit hard from just over the
 * floor and from the sky. `power` is how much of the stroke is left, from 1 to nothing, `wide` how
 * great a stroke it is, and `glare` how much of its light it throws over the table.
 */
export function layStrikeFlash(
  drawn: Staged,
  at: Point,
  floor: Point,
  cell: number,
  ramp: readonly string[],
  power: number,
  forward: number,
  wide = 1,
  glare = 1
): void {
  if (power <= 0) return;
  const hue = hueOf(ramp);
  drawn.motes.push(haze(at, cell * 2.2 * wide, hue, 0.55 * power, forward));
  drawn.motes.push(glow(at, cell * 1.5 * wide, ramp[4], 0.9 * power, forward));
  drawn.motes.push(lightBall(at, cell * 0.55 * wide, '#ffffff', power, forward + 1));
  drawn.floor.push(floorMark('disc', floor, cell * 2.6 * wide, 1, ramp[4], 0.5 * power, 'light', 0));
  drawn.floor.push(floorMark('disc', floor, cell * 1.1 * wide, 1, '#ffffff', 0.6 * power, 'light', 0));
  drawn.lights.push({
    x: floor.x,
    y: floor.y,
    z: floor.z + cell * 2,
    color: mixColor('#ffffff', ramp[4], 0.6),
    strength: 2.4 * power * glare * Math.min(1.6, wide),
    reachPx: cell * 5.5 * wide,
  });
  drawn.lights.push({
    x: floor.x,
    y: floor.y,
    z: floor.z + cell * 4.5,
    color: mixColor(ramp[4], hue, 0.4),
    strength: 1.3 * power * glare,
    reachPx: cell * 7 * wide,
  });
}

/** Sparks thrown low and fast along the floor from where a bolt struck, which skitter and bounce as they die. */
export function skitteringSparks(
  th: Thrower,
  heart: Point,
  count: number,
  bornAt: readonly [number, number] = [0, 0.04],
  speed: readonly [number, number] = [4, 11]
): ThrownMote[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const fast = th.range(speed[0], speed[1]) * U;
    const born = th.range(bornAt[0], bornAt[1]);
    return th.mote({
      x: heart.x + way.cos * U * 0.1,
      y: heart.y + way.sin * U * 0.1,
      z: heart.z + U * 0.08,
      vx: way.cos * fast,
      vy: way.sin * fast,
      vz: th.range(0.4, 2.4) * U,
      bornAt: born,
      life: th.lifeOf(born, 0.3, 0.95),
      gravity: th.fall,
      drag: 2.6,
      bounce: 0.6,
    });
  });
}

/** What a bolt leaves on the floor where it struck; see {@link layGroundBurst}. */
export interface GroundBurst {
  /** How far its soot reaches, how far its ring runs and how far its discharges crawl, in cells. */
  readonly soot: number;
  readonly ring: number;
  readonly crawl: number;
  /** How many discharges crawl out and how many sparks skitter at the middle grade. */
  readonly crawls: number;
  readonly sparks: number;
  /** How long the discharges go on crawling, in seconds, and how heavy they are; see {@link boltRibbons}. */
  readonly crawlS: number;
  readonly thick?: number;
}

const groundSparks = new Map<string, ThrownMote[]>();

/**
 * What a bolt does to the floor it strikes, `t` seconds after it struck: soot burnt in, glowing and
 * cooling, a thin ring racing out, cracks lit for an instant, discharges crawling out over the floor
 * for a while, sparks skittering along it, and a wisp of smoke off the scorch. It is gone `ends`
 * seconds after the stroke.
 */
export function layGroundBurst(
  drawn: Staged,
  stage: Stage,
  floor: Point,
  ramp: readonly string[],
  t: number,
  ends: number,
  burst: GroundBurst,
  salt = 0
): void {
  if (t < 0) return;
  const { cell } = stage;
  const forward = cell * 0.4;
  const hue = hueOf(ramp);
  laySoot(drawn, floor, cell * burst.soot, t, 1.3, 1 - within(t, ends - 0.5, ends));
  layShockRing(drawn, floor, cell * 0.25, cell * burst.ring, cell * 0.14, hue, t, 0.32);
  drawn.floor.push(
    floorMark(
      'cracks',
      floor,
      cell * burst.soot * 1.7 * Math.min(1, t / 0.05),
      0.1,
      ramp[4],
      Math.max(0, 1 - t / 0.45),
      'light',
      (stage.seed + salt) % 89,
      stage.seed + salt
    )
  );
  const crawling = 1 - within(t, burst.crawlS * 0.5, burst.crawlS);
  layGroundCrawl(
    drawn,
    floor,
    cell,
    ramp,
    stage.seed + salt,
    Math.floor(t / 0.05),
    burst.crawls,
    cell * burst.crawl * Math.min(1, 0.35 + t / 0.12),
    crawling,
    burst.thick ?? 0.4
  );
  const sparks = keptFor(groundSparks, `${stageKey(stage, ends)}|${salt}|${floor.x}|${floor.y}`, () => {
    const th = throwerFor({ ...stage, seed: stage.seed + salt }, ends);
    return skitteringSparks(th, floor, th.count(burst.sparks));
  });
  for (const [index, spark] of sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  if (t > 0.12 && t < ends) {
    const risen = within(t, 0.12, ends);
    drawn.motes.push(
      smokePuff(
        { ...floor, z: floor.z + cell * (0.3 + t * 0.45) },
        cell * burst.soot * (0.8 + t * 0.7),
        '#4b4650',
        0.32 * (1 - risen),
        forward
      )
    );
  }
}

/** How long one crackle of what a bolt leaves lasts, in seconds. */
const CRACKLE_S = 0.12;

/**
 * What is left of a bolt crackling over the piece and the floor, from one moment to another: every
 * beat or so, never quite evenly, a small bolt leaps over the body or out over the floor for an
 * instant with a glint and a faint light, each fainter than the last.
 */
export function layCrackles(
  drawn: Staged,
  body: StruckBody,
  cell: number,
  ramp: readonly string[],
  seed: number,
  t: number,
  from: number,
  until: number,
  everyS: number
): void {
  if (t < from || t >= until) return;
  const beat = Math.floor((t - from) / everyS);
  const next = seededRun(seed * 211 + beat * 37 + 5);
  const since = t - from - beat * everyS - next() * everyS * 0.5;
  if (since < 0 || since >= CRACKLE_S) return;
  const left = 1 - 0.6 * within(t, from, until);
  const flicker = beat * 3 + Math.floor(since / 0.05);
  const forward = cell * 0.4;
  const onFloor = next() < 0.45;
  if (onFloor) {
    const turn = next() * Math.PI * 2;
    const off = cell * (0.2 + next() * 0.5);
    const at = { x: body.floor.x + Math.cos(turn) * off, y: body.floor.y + Math.sin(turn) * off, z: body.floor.z };
    layGroundCrawl(drawn, at, cell, ramp, seed + beat, flicker, 3, cell * 1.2, left, 0.34);
  } else {
    layBodyArcs(drawn, body, cell, ramp, seed + beat, flicker, 3, left, 0.36);
  }
  const chest = onBody(body, 0, 0.5);
  drawn.motes.push(haze(chest, cell * 0.9, hueOf(ramp), 0.22 * left, forward));
  drawn.motes.push(
    ...starBurst(
      onFloor ? { ...body.floor, z: body.floor.z + cell * 0.1 } : chest,
      cell * 1.1,
      ramp[4],
      since / CRACKLE_S,
      forward,
      4,
      beat
    )
  );
  drawn.lights.push({
    x: body.floor.x,
    y: body.floor.y,
    z: body.foot.z + cell * 0.7,
    color: ramp[4],
    strength: 0.7 * left,
    reachPx: cell * 2.4,
  });
}
