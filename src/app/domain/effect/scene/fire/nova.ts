import {
  type Choreography,
  nothingStaged,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { flameRampOf, isFlame, mixColor } from '@axe/domain/effect/scene/effect-ramp';
import type { ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  type Blast,
  type BlastSize,
  blastWithin,
  drawBlast,
  drawBlastBeat,
  throwBlast,
} from '@axe/domain/effect/scene/fire/blast';
import { drawBrands, layFlames } from '@axe/domain/effect/scene/fire/fire-body';
import {
  flameFrontAt,
  type GroundFire,
  groundFiresAt,
  throwGroundFires,
} from '@axe/domain/effect/scene/fire/fire-ground';
import {
  type Bit,
  type Brand,
  type Cloud,
  drawBit,
  drawCloud,
  drawEmber,
  drawSpark,
  layDustBand,
  layScorch,
  layShockRing,
  risingEmbers,
  rollingDust,
  SMOKE,
  thrownBrands,
  thrownGrit,
  thrownRocks,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import {
  floorMark,
  glow,
  keptFor,
  type Point,
  stageKey,
  type Thrower,
  throwerFor,
} from '@axe/domain/effect/scene/parts';

/*
 * A great explosion over an area: the heat about it is drawn in to a point in streaks while a ring
 * closes on it along the floor; it goes off in a beat that whites out the table about it, rays
 * shooting from it and a streak of light across it; a dome of fire swells over the piece, wide and
 * low, and rolls up as it burns, cooling to a heavy cloud of smoke. Two shock rings race out to the
 * edge of the area with a band of dust behind them and a front of flame running with them, which
 * leaves fires burning over the floor it crossed; the floor cracks, glowing, under the blast.
 * Burning brands, rocks and grit rain over the area, sparks fly and embers drift. Each piece caught
 * round it is struck as the shock reaches it, with a blast of its own. The scorch it leaves is wide
 * and cools slowly while the smoke clears.
 */

/** How long it lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 2.2;
/** How long after it goes off the shock reaches the pieces caught round it, in seconds. */
const REACHES_ROUND_S = 0.14;
/** How long the shock and the front of flame take to cross the area, in seconds. */
const CROSSES_S = 0.55;
/** The dome of fire, in cells and seconds. */
const DOME: BlastSize = {
  reach: 1.2,
  lobes: 12,
  licks: 14,
  swellS: 0.26,
  burnsS: 1.05,
  smokeS: 1.5,
  rises: 2.1,
  domed: 0.7,
};
/** The blast a piece caught round a great blast is struck with, in cells and seconds. */
const CAUGHT: BlastSize = { reach: 0.5, lobes: 4, licks: 6, swellS: 0.14, burnsS: 0.45, smokeS: 0.7, rises: 0.9 };

const thrownByStage = new Map<string, NovaThrow>();
const caughtByStage = new Map<string, CaughtThrow>();

export const nova: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (stage.index === 0 ? drawNova(stage) : drawCaughtBlast(stage, LINGER_S, REACHES_ROUND_S)),
};

interface NovaThrow {
  readonly blast: Blast;
  readonly fires: readonly GroundFire[];
  readonly clouds: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly brands: readonly Brand[];
  readonly bits: readonly Bit[];
  /** Where the streaks of heat drawn in start, as a turn about the heart and how far out, in cells. */
  readonly drawnIn: readonly { readonly angle: number; readonly out: number; readonly lift: number }[];
}

interface CaughtThrow {
  readonly blast: Blast;
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly bits: readonly Bit[];
}

function drawNova(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const fiery = isFlame(stage.preset.colorSecondary);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.55 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.6;
  const depth = { forward };
  const area = Math.max(stage.areaPx, cell * 2.5);
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwNova(throwerFor(stage, ends), heart, floor, ends)
  );

  if (t < 0) {
    drawDrawingIn(drawn, thrown, stage, heart, floor, area, ramp, forward, goesOff);
    return drawn;
  }
  const clearing = 1 - within(t, ends - 0.8, ends);
  const seed = (stage.seed % 89) + 1;

  const cracking = within(t, 0, 0.12);
  drawn.floor.push(floorMark('cracks', floor, cell * 1.5 * cracking, 0.35, SMOKE, 0.7 * clearing, 'color', seed, seed));
  const glowing = Math.max(0, 1 - t / 2.4);
  if (glowing > 0) {
    drawn.floor.push(floorMark('cracks', floor, cell * 1.5 * cracking, 0.18, ramp[4], glowing, 'light', seed, seed));
  }
  layScorch(drawn, floor, cell * 1.05, ramp, t, 3, clearing, seed);
  layShockRing(drawn, floor, cell * 0.4, area + cell * 0.5, cell * 0.2, ramp[5], t, CROSSES_S);
  layShockRing(drawn, floor, cell * 0.3, area * 0.75, cell * 0.12, ramp[3], t - 0.08, 0.45);
  layDustBand(drawn, floor, area * 1.1, cell * 0.3, ramp, t, 0.9);

  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  const litter = drawBrands(drawn, thrown.brands, t, cell, ramp, forward);
  layFlames(
    drawn,
    [
      ...flameFrontAt(floor, cell * 0.5, area, cell, t, CROSSES_S, 20, stage.seed),
      ...groundFiresAt(thrown.fires, floor, area, cell, t, CROSSES_S),
      ...litter,
    ],
    ramp,
    { forward: cell * 0.1, exact: true }
  );
  drawBlast(drawn, thrown.blast, heart, cell, ramp, t, stage.groundZ, fiery, depth);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);

  drawBlastBeat(drawn, heart, floor, cell, ramp, t, 2.1, stage.seed, forward);
  drawFlareStreak(drawn, heart, cell, t, 0.3, forward * 1.6);

  if (t < 0.12) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.8 * (1 - t / 0.12), reachPx: cell * 3 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / 2), 1.5);
  if (warm > 0.02) {
    drawn.lights.push({
      ...heart,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.0 * warm,
      reachPx: area * 0.8 + cell,
    });
  }
  return drawn;
}

/** A streak of light across a great flash, drawn out as it fades over `lasts` seconds. */
export function drawFlareStreak(
  drawn: Staged,
  heart: Point,
  cell: number,
  t: number,
  lasts: number,
  forward: number
): void {
  const streak = within(t, 0, lasts);
  if (t < 0 || streak >= 1) return;
  drawn.motes.push({
    ...glow(heart, cell * 0.5 * (1 - streak * 0.7), '#ffffff', 1 - streak, forward),
    shape: 'flare',
    trail: 7 + streak * 9,
  });
}

/** The heat drawn in before it goes off: streaks closing on the heart, a glow growing in it, and a ring on the floor closing in. */
function drawDrawingIn(
  drawn: Staged,
  thrown: NovaThrow,
  stage: Stage,
  heart: Point,
  floor: Point,
  area: number,
  ramp: readonly string[],
  forward: number,
  goesOff: number
): void {
  const { cell } = stage;
  const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
  const closing = gather * gather;
  for (const streak of thrown.drawnIn) {
    const out = streak.out * cell * (1 - closing);
    const at = {
      x: heart.x + Math.cos(streak.angle) * out,
      y: heart.y + Math.sin(streak.angle) * out,
      z: heart.z + streak.lift * cell * (1 - closing),
    };
    const speed = streak.out * cell * 2 * gather;
    drawn.motes.push({
      ...glow(at, cell * 0.07, ramp[5], 0.4 + 0.6 * gather, forward),
      shape: 'spark',
      velocity: {
        x: -Math.cos(streak.angle) * speed,
        y: -Math.sin(streak.angle) * speed,
        z: -streak.lift * cell * 2 * gather,
      },
      trail: 0.12,
    });
  }
  drawn.motes.push(glow(heart, cell * (0.3 + gather * 0.9), ramp[5], 0.3 + gather * 0.6, forward));
  const ring = area * (1 - gather) + cell * 0.4 * gather;
  drawn.floor.push(floorMark('ring', floor, ring, (cell * 0.06) / ring, ramp[4], 0.3 + 0.6 * gather, 'light', 0));
}

/**
 * A piece caught round a blast: struck as the shock reaches it, `reachesS` seconds after the blast
 * goes off, with a small blast of its own, sparks and a scorch.
 */
export function drawCaughtBlast(stage: Stage, lingerS: number, reachesS: number): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = (stage.blowsAt[0] ?? 0) + reachesS;
  const t = stage.seconds - goesOff;
  if (t < 0) return drawn;
  const ends = stage.duration + lingerS - goesOff;
  const ramp = flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.6 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.9;
  const thrown = keptFor(caughtByStage, `caught|${stageKey(stage, ends)}`, () => {
    const th = throwerFor(stage, ends);
    return {
      blast: throwBlast(th, blastWithin(CAUGHT, ends)),
      sparks: thrownSparks(th, heart, th.count(24)),
      embers: risingEmbers(th, heart, th.count(10)),
      bits: thrownGrit(th, floor, th.count(10)),
    };
  });
  const clearing = 1 - within(t, ends - 0.6, ends);
  layScorch(drawn, floor, cell * 0.8, ramp, t, 1.5, clearing, (stage.seed % 89) + 1);
  layShockRing(drawn, floor, cell * 0.3, cell * 1.8, cell * 0.15, ramp[4], t, 0.3);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  drawBlast(drawn, thrown.blast, heart, cell, ramp, t, stage.groundZ, isFlame(stage.preset.colorSecondary), {
    forward,
  });
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);
  drawBlastBeat(drawn, heart, floor, cell, ramp, t, 0.7, stage.seed, forward);
  return drawn;
}

/** Throws every part of the blast from its heart, on its own clock from the moment it goes off. */
function throwNova(th: Thrower, heart: Point, floor: Point, ends: number): NovaThrow {
  const blast = throwBlast(th, blastWithin(DOME, ends));
  const fires = throwGroundFires(th, th.count(9), [0.9, 1.7]);
  const clouds = rollingDust(th, floor, th.count(12), [3, 9], [0.7, 1]);
  const sparks = thrownSparks(th, heart, th.count(80), [7, 18]);
  const embers = risingEmbers(th, heart, th.count(40), [0, 0.4], 0.6);
  const brands = thrownBrands(th, heart, th.count(4), [3.5, 7]);
  const bits = [...thrownRocks(th, floor, th.count(8), [4, 7]), ...thrownGrit(th, floor, th.count(40), [3, 9])];
  const drawnIn = Array.from({ length: th.count(16) }, () => ({
    angle: th.range(0, Math.PI * 2),
    out: th.range(2.2, 3.6),
    lift: th.range(-0.2, 1.2),
  }));
  return { blast, fires, clouds, sparks, embers, brands, bits, drawnIn };
}
