import { clamp } from '@axe/core/util/clamp';
import { quakeStrikesOf } from '@axe/domain/effect/earth-looks';
import { outCubic, type Stage, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { driftingDust, earthPlumes, kickedDust } from '@axe/domain/effect/scene/earth/earth-dust';
import { crag, type EarthTones, layDent } from '@axe/domain/effect/scene/earth/earth-parts';
import { drawRock, type Rock, throwRocks } from '@axe/domain/effect/scene/earth/earth-rocks';
import { drawEmbers, type HotPoint, layGash, throwEmbers } from '@axe/domain/effect/scene/earth/rift-parts';
import { type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, drawCloud, layShockRing } from '@axe/domain/effect/scene/fire/fire-parts';
import {
  circlePoints,
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
 * A quake over an area. The ground trembles first: pebbles hop all over it and hairline cracks creep
 * out from its middle. Then it heaves three times, the first the hardest. At each a ripple races out
 * over the whole floor of the area as a ring of dust, a great crack tears across it glowing red from
 * its depths, slabs of the floor jump as the ripple passes under them and land askew, and boulders,
 * stones and earth are thrown up from the vents it opens; between the heaves the ground goes on
 * shaking and embers rise out of the cracks. After the last, dust hangs over the area, the cracks cool
 * to dark scars, the embers die and the rubble lies where it fell. About each piece caught in it slabs
 * jump at every heave over a crack of its own.
 *
 * Every length is in cells and every speed in cells a second.
 */

/** How long a ripple takes to race out to the edge of the area, and how long a great crack takes to tear across it, in seconds. */
const RIPPLE_S = 0.45;
const TEARS_S = 0.3;
/** How far apart the bends of a crack are, and how far each is thrown aside, in cells. */
const BEND_CELLS = 0.55;
const JAG_CELLS = 0.26;
/** How long a slab is in the air when it jumps, in seconds. */
const HOP_S = 0.4;
/** How long the cracks keep their glow after the last heave, how long they take to cool after that, and how long before the end all clears, in seconds. */
const HOLDS_HOT_S = 0.6;
const COOLS_S = 1.9;
const CLEARS_S = 0.6;
/** How strongly each heave lights the ground, the first the hardest. */
const HEAVE_LIGHT = [2.4, 1.7, 1.9] as const;
/** How long the white of a heave lasts, in seconds: the beat each heave is read by, before its slabs jump and its dust rises. */
const HEAVE_WHITE_S = 0.13;

/** A slab of the floor that jumps as the ripple passes under it and lands askew. */
interface Jumper {
  readonly hinge: Point;
  readonly out: { readonly x: number; readonly y: number };
  readonly long: number;
  readonly wide: number;
  readonly jumpsAt: number;
  /** How high it jumps, in cells, how steeply it is tipped at the height of its jump, and how steeply it lands, in radians. */
  readonly hop: number;
  readonly peak: number;
  readonly rests: number;
  readonly tone: number;
  readonly variant: number;
}

/** A crack torn across the area at a heave: from its middle out both ways. */
interface Crack {
  readonly opensAt: number;
  /** Whether it is a hairline that creeps out before the first heave rather than a great crack torn open by one. */
  readonly hairline: boolean;
  readonly halves: readonly (readonly Point[])[];
  readonly wide: number;
  readonly seed: number;
}

interface QuakeThrow {
  readonly heaves: readonly number[];
  readonly cracks: readonly Crack[];
  readonly jumpers: readonly Jumper[];
  readonly vents: readonly { readonly at: Point; readonly opensAt: number }[];
  readonly rocks: readonly Rock[];
  readonly dust: readonly Cloud[];
  readonly embers: readonly ThrownMote[];
}

const quakeByStage = new Map<string, QuakeThrow>();

/** When a stage heaves: at its blows where it is told of three, or as a quake of its length does. */
function heavesOf(stage: Stage): number[] {
  if (stage.blowsAt.length >= 3) return [...stage.blowsAt.slice(0, 3)];
  const strikes = quakeStrikesOf({ effectKind: 'quake', gradeLevel: 3, areaRadiusCells: 3 }, stage.duration) ?? [0];
  return stage.blowsAt.length > 0 ? strikes.map((at) => at - strikes[0] + stage.blowsAt[0]) : strikes;
}

/** A jagged line of points from one point out along a way, as far as `long`, each bend thrown aside. */
function jaggedLine(th: Thrower, from: Point, way: { x: number; y: number }, long: number): Point[] {
  const U = th.cell;
  const count = Math.max(2, Math.round(long / (BEND_CELLS * U)));
  let swing = th.chance(0.5) ? 1 : -1;
  return Array.from({ length: count + 1 }, (_unused, index) => {
    const along = (long * index) / count;
    swing = -swing;
    const aside = index === 0 ? 0 : swing * th.range(0.3, 1) * JAG_CELLS * U;
    return { x: from.x + way.x * along - way.y * aside, y: from.y + way.y * along + way.x * aside, z: from.z };
  });
}

/** Slabs of the floor about a foot, between two distances from it, each jumping as a ripple from `centre` reaches it. */
export function throwJumpers(
  th: Thrower,
  foot: Point,
  count: number,
  ring: readonly [number, number],
  heave: number,
  centre: Point,
  reach: number
): Jumper[] {
  const U = th.cell;
  return Array.from({ length: count }, (_unused, index) => {
    const turn = ((index + th.range(0.1, 0.9)) / count) * Math.PI * 2;
    const far = th.range(ring[0], ring[1]) * U;
    const hinge = { x: foot.x + Math.cos(turn) * far, y: foot.y + Math.sin(turn) * far, z: foot.z };
    const askew = th.range(0, Math.PI * 2);
    const fromCentre = Math.hypot(hinge.x - centre.x, hinge.y - centre.y);
    return {
      hinge,
      out: { x: Math.cos(askew), y: Math.sin(askew) },
      long: th.range(0.42, 0.66),
      wide: th.range(0.45, 0.65),
      jumpsAt: heave + RIPPLE_S * Math.min(1, fromCentre / Math.max(1, reach)),
      hop: th.range(0.25, 0.55),
      peak: th.range(0.9, 1.4),
      rests: th.range(0.22, 0.5),
      tone: Math.floor(th.range(0, 2.99)),
      variant: th.range(0, 6),
    };
  });
}

/** A slab at a moment: thrown up off the floor and tipped as it goes, landing askew over the hole it left. */
export function drawJumper(drawn: Staged, slab: Jumper, t: number, U: number, tones: EarthTones, alpha: number): void {
  const since = t - slab.jumpsAt;
  if (since < 0) return;
  const flight = clamp(since / HOP_S, 0, 1);
  const hop = 4 * slab.hop * U * flight * (1 - flight);
  const tilt =
    since < 0.12
      ? slab.peak * outCubic(since / 0.12)
      : slab.rests + (slab.peak - slab.rests) * Math.pow(1 - clamp((since - 0.12) / HOP_S, 0, 1), 2);
  const long = U * slab.long;
  const hole = {
    x: slab.hinge.x - slab.out.x * long * 0.5,
    y: slab.hinge.y - slab.out.y * long * 0.5,
    z: slab.hinge.z,
  };
  drawn.floor.push(floorMark('scorch', hole, long * 0.85, 1, tones.earth, 0.7 * alpha, 'color', slab.variant));
  const way = { x: -slab.out.x * Math.cos(tilt), y: -slab.out.y * Math.cos(tilt), z: Math.sin(tilt) };
  drawn.motes.push(
    crag(
      { ...slab.hinge, z: slab.hinge.z + hop },
      way,
      long / 0.28,
      U * slab.wide,
      tones.rock[slab.tone] ?? tones.rock[1],
      alpha,
      {
        variant: slab.variant,
        broken: 0.72,
      }
    )
  );
}

/** What a heave throws up out of a vent. */
function throwVent(
  th: Thrower,
  at: Point,
  heave: number,
  tones: EarthTones,
  into: { rocks: Rock[]; dust: Cloud[] }
): void {
  into.rocks.push(
    ...throwRocks(th, at, th.count(2), {
      size: [0.4, 0.7],
      up: [6.5, 9],
      out: [0.35, 1.2],
      bornAt: [heave, heave + 0.05],
      from: 0.15,
      bounce: 0.36,
    }),
    ...throwRocks(th, at, th.count(7), {
      size: [0.12, 0.26],
      up: [5, 10],
      out: [0.4, 2.4],
      bornAt: [heave, heave + 0.07],
    }),
    ...throwRocks(th, at, th.count(16), {
      size: [0.04, 0.09],
      up: [5, 12],
      out: [0.3, 3],
      bornAt: [heave, heave + 0.08],
      bounce: 0.25,
    })
  );
  into.dust.push(
    ...earthPlumes(th, at, th.count(4), tones.dust, {
      rise: [7, 11],
      bornAt: [heave + 0.04, heave + 0.14],
      long: 2,
      life: [0.7, 1.1],
    }),
    ...kickedDust(th, at, th.count(7), tones.sand, {
      speed: [5, 10],
      size: [0.32, 0.55],
      bornAt: [heave, heave + 0.03],
      rise: [1, 6],
      alpha: 0.75,
      life: [0.3, 0.6],
      jet: 1.6,
    })
  );
}

function throwQuake(stage: Stage, tones: EarthTones, ends: number, reach: number): QuakeThrow {
  const th = throwerFor(stage, ends);
  const U = stage.cell;
  const centre = { x: stage.x, y: stage.y, z: stage.groundZ };
  const heaves = heavesOf(stage);
  const base = th.range(0, Math.PI);
  const cracks: Crack[] = heaves.map((opensAt, index) => {
    const turn = base + index * 1.05 + th.range(-0.3, 0.3);
    const off = (index === 0 ? th.range(-0.1, 0.1) : th.range(0.2, 0.45) * (th.chance(0.5) ? 1 : -1)) * reach;
    const middle = { x: centre.x - Math.sin(turn) * off, y: centre.y + Math.cos(turn) * off, z: centre.z };
    const way = { x: Math.cos(turn), y: Math.sin(turn) };
    const back = { x: -way.x, y: -way.y };
    return {
      opensAt: opensAt - 0.03,
      hairline: false,
      halves: [jaggedLine(th, middle, way, reach * 0.98), jaggedLine(th, middle, back, reach * 0.98)],
      wide: U * (index === 0 ? 0.9 : 0.72),
      seed: stage.seed + index * 37,
    };
  });
  cracks.push(
    ...Array.from({ length: 5 }, (_unused, index) => {
      const turn = base + ((index + 0.5) / 5) * Math.PI * 2;
      return {
        opensAt: 0,
        hairline: true,
        halves: [jaggedLine(th, centre, { x: Math.cos(turn), y: Math.sin(turn) }, reach * th.range(0.35, 0.55))],
        wide: U * 0.2,
        seed: stage.seed + 200 + index * 11,
      };
    })
  );
  const jumpers: Jumper[] = [];
  const vents: { at: Point; opensAt: number }[] = [];
  const rocks: Rock[] = [];
  const dust: Cloud[] = [];
  const spot = (near: number, far: number): Point => {
    const way = th.outward();
    const out = th.range(near, far) * reach;
    return { x: centre.x + way.cos * out, y: centre.y + way.sin * out, z: centre.z };
  };
  for (const [index, heave] of heaves.entries()) {
    jumpers.push(
      ...throwJumpers(th, centre, th.count(index === 0 ? 7 : 5), [0.5, (reach / U) * 0.95], heave, centre, reach)
    );
    const opened = index === 0 ? [centre, spot(0.4, 0.7)] : [spot(0.3, 0.75)];
    for (const at of opened) {
      vents.push({ at, opensAt: heave });
      throwVent(th, at, heave, tones, { rocks, dust });
    }
    for (let puff = 0; puff < th.count(16); puff++) {
      const turn = (puff / 16) * Math.PI * 2 + index;
      const out = reach * (puff % 2 === 0 ? 0.5 : 0.85);
      const at = { x: centre.x + Math.cos(turn) * out, y: centre.y + Math.sin(turn) * out, z: centre.z };
      const born = heave + RIPPLE_S * (out / reach);
      dust.push(
        ...kickedDust(th, at, 1, tones.dust, {
          speed: [0.8, 1.8],
          size: [0.5, 0.75],
          bornAt: [born + 0.05, born + 0.08],
          fan: { toward: turn, spread: 0.4 },
          rise: [1.2, 2.4],
          from: 0.1,
          alpha: 0.5,
          life: [0.4, 0.7],
        })
      );
    }
  }
  const last = heaves.at(-1) ?? 0;
  rocks.push(
    ...throwRocks(th, centre, th.count(26), {
      size: [0.04, 0.09],
      up: [1, 2.6],
      out: [0, 0.4],
      from: reach / U,
      bornAt: [0, last + 0.4],
      bounce: 0.2,
    })
  );
  dust.push(
    ...kickedDust(th, centre, th.count(8), tones.dust, {
      speed: [0.2, 0.8],
      size: [1.4, 2.2],
      bornAt: [last + 0.2, last + 0.5],
      rise: [0.1, 0.4],
      from: (reach / U) * 0.8,
      alpha: 0.2,
      life: [1.6, 2.4],
    }),
    ...driftingDust(th, centre, th.count(10), tones.dust, reach / U, [last + 0.6, Math.max(last + 0.7, ends - 1.8)])
  );
  const embers = cracks.flatMap((crack) =>
    crack.halves.flatMap((half) =>
      throwEmbers(th, half, th.count(5), [crack.opensAt + 0.2, last + HOLDS_HOT_S + COOLS_S])
    )
  );
  return { heaves, cracks, jumpers, vents, rocks, dust, embers };
}

/** A quake over an area, on the piece at its middle: see the head of this file. */
export function drawEarthquake(stage: Stage, tones: EarthTones, lingerS: number): Staged {
  const drawn: Staged = { motes: [], ribbons: [], floor: [], lights: [] };
  const U = stage.cell;
  const t = stage.seconds;
  const ends = stage.duration + lingerS;
  const reach = stage.areaPx > 0 ? stage.areaPx : U * 3;
  const quake = keptFor(quakeByStage, `${stageKey(stage, ends)}|${reach}`, () => throwQuake(stage, tones, ends, reach));
  const centre = { x: stage.x, y: stage.y, z: stage.groundZ };
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const last = quake.heaves.at(-1) ?? 0;
  const cooling = Math.pow(1 - within(t, last + HOLDS_HOT_S, last + HOLDS_HOT_S + COOLS_S), 1.3);
  const flare = quake.heaves.reduce(
    (most, heave) => (t >= heave ? Math.max(most, Math.exp(-(t - heave) / 0.35)) : most),
    0
  );
  for (const slab of quake.jumpers) drawJumper(drawn, slab, t, U, tones, clearing);
  for (const crack of quake.cracks) {
    const since = t - crack.opensAt;
    if (since < 0) continue;
    const hairline = crack.hairline;
    const run = hairline ? within(t, 0, quake.heaves[0] ?? 0.4) : outCubic(within(since, 0, TEARS_S));
    const heat = hairline && t < (quake.heaves[0] ?? 0) ? 0.3 : (0.5 + 0.5 * flare) * cooling;
    for (const half of crack.halves) layCrack(drawn, half, run, crack.wide, heat, tones, clearing, crack.seed);
  }
  for (const vent of quake.vents) {
    const opened = t - vent.opensAt;
    if (opened < 0) continue;
    layDent(
      drawn,
      vent.at,
      U * 0.6 * Math.min(1, opened / 0.06 + 0.3),
      tones,
      clearing,
      stage.seed + vent.opensAt * 10
    );
    const hot = Math.max(Math.exp(-opened / 0.5), 0.6 * cooling);
    if (hot > 0.03)
      drawn.floor.push(floorMark('disc', vent.at, U * 0.85, 1, tones.glow, 0.7 * hot * clearing, 'light', 0));
  }
  for (const [index, heave] of quake.heaves.entries()) drawRipple(drawn, centre, reach, t - heave, U, tones, index);
  for (const cloud of quake.dust) drawCloud(drawn, cloud, t, U, 0);
  for (const rock of quake.rocks) drawRock(drawn, rock, t, U, tones);
  drawEmbers(drawn, quake.embers, t, U, tones, clearing);
  const glowing = Math.max(flare, 0.5 * cooling) * clearing;
  if (glowing > 0.02)
    drawn.lights.push({
      ...centre,
      z: centre.z + U * 0.6,
      color: tones.glow,
      strength: 1.1 * glowing,
      reachPx: reach * 1.2,
    });
  return drawn;
}

/** One crack of a quake a share of the way torn out along its points: dark, glowing from its depths while hot. */
export function layCrack(
  drawn: Staged,
  points: readonly Point[],
  run: number,
  wide: number,
  heat: number,
  tones: EarthTones,
  alpha: number,
  seed: number
): void {
  if (run <= 0 || points.length < 2) return;
  const total = points.length - 1;
  const reached = run * total;
  const hot: HotPoint[] = [{ at: points[0], heat }];
  for (let index = 0; index < total && index < reached; index++) {
    const share = Math.min(1, reached - index);
    const a = points[index];
    const b = points[index + 1];
    hot.push({
      at: { x: a.x + (b.x - a.x) * share, y: a.y + (b.y - a.y) * share, z: a.z },
      heat: heat * (1 - 0.3 * (index / total)),
    });
  }
  layGash(drawn, hot, wide, tones, alpha, seed);
}

/**
 * The ripple of one heave racing out over the floor of the area: a pale crest of raised ground with a
 * dark trough behind it, a ring of dust thrown up along it, and at its middle the flash of the heave.
 */
function drawRipple(
  drawn: Staged,
  centre: Point,
  reach: number,
  since: number,
  U: number,
  tones: EarthTones,
  index: number
): void {
  const lasts = RIPPLE_S + 0.25;
  if (since < 0 || since >= lasts) return;
  const left = 1 - since / lasts;
  const radius = Math.max(U * 0.3, reach * 1.08 * Math.pow(since / RIPPLE_S, 0.8));
  drawn.floor.push(
    floorMark('ring', centre, radius, Math.min(0.9, (U * 0.42) / radius), tones.sand, 0.75 * left, 'color', 0)
  );
  if (radius > U * 0.6)
    drawn.floor.push(
      floorMark(
        'ring',
        centre,
        radius - U * 0.42,
        Math.min(0.9, (U * 0.3) / radius),
        tones.earth,
        0.55 * left,
        'color',
        0
      )
    );
  drawn.ribbons.push({
    points: circlePoints({ ...centre, z: centre.z + U * 0.14 }, radius, 28),
    widths: U * 0.42 * (0.6 + 0.4 * left),
    color: tones.dust,
    core: tones.sand,
    alpha: 0.75 * left,
    blend: 'color',
    torn: 0.7,
    soft: 0.3,
    flowed: since * 6 + index,
  });
  layShockRing(drawn, centre, U * 0.4, reach * 1.25, U * 0.4, '#fff4dc', since, 0.4);
  const flash = Math.max(0, 1 - since / 0.35);
  if (flash <= 0) return;
  const heart = { ...centre, z: centre.z + U * 0.4 };
  drawn.motes.push(glow(heart, U * 3.6, tones.glow, 0.85 * flash, U * 0.4));
  if (since < HEAVE_WHITE_S) {
    const white = 1 - since / HEAVE_WHITE_S;
    drawn.floor.push(floorMark('disc', centre, reach * 0.95, 1, '#fff4dc', 0.55 * white, 'light', 0));
    drawn.motes.push(lightBall(heart, U * (index === 0 ? 1.6 : 1.2), '#fff4dc', white, U * 0.5));
    drawn.motes.push(
      ...starBurst(heart, U * (index === 0 ? 4 : 3), tones.hot, since / HEAVE_WHITE_S, U * 0.5, 8, index)
    );
  }
  drawn.lights.push({
    ...heart,
    z: heart.z + U * 0.6,
    color: tones.glow,
    strength: HEAVE_LIGHT[index % 3] * flash,
    reachPx: reach * 1.4,
  });
}

/** A piece caught in a quake: slabs jumping about its feet at every heave over a crack of its own, and dust thrown up. */
export function drawCaughtQuake(stage: Stage, tones: EarthTones, lingerS: number): Staged {
  const drawn: Staged = { motes: [], ribbons: [], floor: [], lights: [] };
  const U = stage.cell;
  const t = stage.seconds;
  const ends = stage.duration + lingerS;
  const centre = stage.targets[0] ?? stage;
  const caught = keptFor(quakeByStage, `${stageKey(stage, ends)}|caught|${centre.x}|${centre.y}`, () => {
    const th = throwerFor(stage, ends);
    const foot = { x: stage.x, y: stage.y, z: stage.groundZ };
    const middle = { x: centre.x, y: centre.y, z: stage.groundZ };
    const reach = Math.max(U, stage.areaPx);
    const heaves = heavesOf(stage);
    const away = Math.atan2(foot.y - middle.y, foot.x - middle.x) + Math.PI / 2;
    const way = { x: Math.cos(away), y: Math.sin(away) };
    const crack = {
      opensAt: heaves[0] ?? 0,
      hairline: false,
      halves: [jaggedLine(th, foot, way, U * 0.9), jaggedLine(th, foot, { x: -way.x, y: -way.y }, U * 0.9)],
      wide: U * 0.5,
      seed: stage.seed,
    };
    const rocks: Rock[] = [];
    const dust: Cloud[] = [];
    const jumpers = heaves.flatMap((heave, index) =>
      throwJumpers(th, foot, th.count(index === 0 ? 2 : 1), [0.5, 0.85], heave, middle, reach)
    );
    for (const heave of heaves) {
      const at = heave + RIPPLE_S * Math.min(1, Math.hypot(foot.x - middle.x, foot.y - middle.y) / reach);
      rocks.push(
        ...throwRocks(th, foot, th.count(5), {
          size: [0.05, 0.14],
          up: [3, 6],
          out: [0.3, 1.4],
          bornAt: [at, at + 0.05],
          from: 0.3,
        })
      );
      dust.push(
        ...kickedDust(th, foot, th.count(4), tones.dust, {
          speed: [1.2, 3],
          size: [0.5, 0.8],
          bornAt: [at + 0.05, at + 0.1],
          alpha: 0.5,
          life: [0.5, 0.9],
        })
      );
    }
    return {
      heaves,
      cracks: [crack],
      jumpers,
      vents: [],
      rocks,
      dust,
      embers: throwEmbers(th, crack.halves[0], th.count(4), [crack.opensAt + 0.2, ends - 1]),
    };
  });
  const clearing = 1 - within(t, ends - CLEARS_S, ends);
  const last = caught.heaves.at(-1) ?? 0;
  const cooling = Math.pow(1 - within(t, last + HOLDS_HOT_S, last + HOLDS_HOT_S + COOLS_S), 1.3);
  const flare = caught.heaves.reduce(
    (most, heave) => (t >= heave ? Math.max(most, Math.exp(-(t - heave) / 0.35)) : most),
    0
  );
  for (const slab of caught.jumpers) drawJumper(drawn, slab, t, U, tones, clearing);
  for (const crack of caught.cracks) {
    const run = outCubic(within(t - crack.opensAt, 0, TEARS_S));
    for (const half of crack.halves)
      layCrack(drawn, half, run, crack.wide, (0.5 + 0.5 * flare) * cooling, tones, clearing, crack.seed);
  }
  for (const cloud of caught.dust) drawCloud(drawn, cloud, t, U, 0);
  for (const rock of caught.rocks) drawRock(drawn, rock, t, U, tones);
  drawEmbers(drawn, caught.embers, t, U, tones, clearing);
  return drawn;
}
