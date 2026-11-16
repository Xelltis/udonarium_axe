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
  blastAt,
  type BlastSize,
  blastWithin,
  drawBlastBeat,
  throwBlast,
} from '@axe/domain/effect/scene/fire/blast';
import {
  drawBillowClouds,
  drawBrands,
  type Flame,
  layBillows,
  layFlames,
} from '@axe/domain/effect/scene/fire/fire-body';
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
  CAP_HEIGHT,
  capAt,
  crownAt,
  type MushroomCloud,
  STEM_S,
  stemAt,
  throwCloud,
} from '@axe/domain/effect/scene/fire/mushroom-cloud';
import { drawCaughtBlast, drawFlareStreak } from '@axe/domain/effect/scene/fire/nova';
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
 * The greatest blast, an inferno: the ground under it glows and cracks as the heat gathers, and
 * flames lick up out of the cracks; it goes off in a beat that whites out the table, with rays and a
 * streak of light across it. A surge of fire rolls out low over the ground from its foot, a stem of
 * fire roars up out of it, white-hot and reddening, and at its top a cap rolls up and out, fire at
 * first and then black smoke still red within. The stem is tongues of every height, and its crown
 * never ends in an edge: flames break off their tips one after another and rise burning over it.
 * Three shock rings race out over the area with a band of dust behind them and a front of flame
 * running with them, which leaves the ground burning far and wide; brands, rocks and grit rain about
 * it, sparks fly and embers rise for as long as it burns. The stem thins and breaks, the smoke of the
 * cap climbs and breaks apart, and a fire burns on low in the crater, smoke and embers rising off it
 * long after, over the scorched and cracked ground.
 */

/** How long it lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 2.5;
/** How long after it goes off the shock reaches the pieces caught round it, in seconds. */
const REACHES_ROUND_S = 0.18;
/** How long the shock and the front of flame take to cross the area, in seconds. */
const CROSSES_S = 0.6;
/** Until what share of its whole length smoke goes on rising off the crater and embers off its fire. */
const SMOKES_UNTIL = 0.72;
/** How many low tongues go on burning in the crater once the stem has broken. */
const HEARTH_TONGUES = 5;
/** The surge of fire at the foot of the stem, in cells and seconds: wide, low, and slow to rise. */
const SURGE: BlastSize = {
  reach: 1.15,
  lobes: 10,
  licks: 12,
  swellS: 0.24,
  burnsS: 0.95,
  smokeS: 1.3,
  rises: 0.5,
  domed: 0.5,
};

const thrownByStage = new Map<string, MushroomThrow>();

export const mushroom: Choreography = {
  lingerS: LINGER_S,
  draw: (stage) => (stage.index === 0 ? drawMushroom(stage) : drawCaughtBlast(stage, LINGER_S, REACHES_ROUND_S)),
};

interface MushroomThrow {
  readonly cloud: MushroomCloud;
  readonly surge: Blast;
  readonly fires: readonly GroundFire[];
  /** The stem left as smoke once it has burnt, and the dust thrown out along the ground. */
  readonly column: readonly Cloud[];
  readonly dust: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly brands: readonly Brand[];
  readonly bits: readonly Bit[];
  /** The flames that lick out of the cracks as the heat gathers. */
  readonly omens: readonly GroundFire[];
}

function drawMushroom(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const fiery = isFlame(stage.preset.colorSecondary);
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const heart = { x: stage.x, y: stage.y, z: stage.groundZ + cell * 0.6 };
  const forward = cell * 0.6;
  const depth = { forward };
  const onFloor = { forward: cell * 0.1, exact: true };
  const area = Math.max(stage.areaPx, cell * 3);
  const seed = (stage.seed % 89) + 1;
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwMushroom(throwerFor(stage, ends), heart, floor, ends)
  );

  if (t < 0) {
    const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
    drawn.floor.push(floorMark('disc', floor, cell * 1.6, 1, ramp[4], 0.5 * gather, 'light', 0));
    drawn.floor.push(floorMark('cracks', floor, cell * 1.8 * gather, 0.16, ramp[5], gather, 'light', seed, seed));
    const ring = area * (1 - gather) + cell * 0.5 * gather;
    drawn.floor.push(floorMark('ring', floor, ring, (cell * 0.07) / ring, ramp[4], 0.3 + 0.6 * gather, 'light', 0));
    drawn.motes.push(glow(heart, cell * (0.4 + gather), ramp[5], 0.3 + 0.5 * gather, forward));
    const omens = groundFiresAt(thrown.omens, floor, cell * 1.6, cell, stage.seconds, Math.max(goesOff, 0.01));
    layFlames(drawn, omens, ramp, onFloor);
    return drawn;
  }
  const clearing = 1 - within(t, ends - 1, ends);

  drawn.floor.push(floorMark('cracks', floor, cell * 1.9, 0.4, SMOKE, 0.7 * clearing, 'color', seed, seed));
  const glowing = Math.max(0, 1 - t / 3.5);
  if (glowing > 0) drawn.floor.push(floorMark('cracks', floor, cell * 1.9, 0.2, ramp[4], glowing, 'light', seed, seed));
  layScorch(drawn, floor, cell * 1.3, ramp, t, 4, clearing, seed);
  layShockRing(drawn, floor, cell * 0.5, area + cell * 0.6, cell * 0.22, ramp[5], t, CROSSES_S);
  layShockRing(drawn, floor, cell * 0.4, area * 0.8, cell * 0.14, ramp[4], t - 0.1, 0.55);
  layShockRing(drawn, floor, cell * 0.3, area * 0.55, cell * 0.1, ramp[2], t - 0.2, 0.5);
  layDustBand(drawn, floor, area * 1.15, cell * 0.35, ramp, t, 1.1);

  for (const cloud of thrown.dust) drawCloud(drawn, cloud, t, cell, forward);
  drawBillowClouds(drawn, thrown.column, t, cell, depth);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  const litter = drawBrands(drawn, thrown.brands, t, cell, ramp, forward);
  const ground: Flame[] = [
    ...flameFrontAt(floor, cell * 0.6, area, cell, t, CROSSES_S, 26, stage.seed),
    ...groundFiresAt(thrown.fires, floor, area, cell, t, CROSSES_S),
    ...litter,
  ];
  layFlames(drawn, ground, ramp, onFloor);

  const surge = blastAt(thrown.surge, heart, cell, t, stage.groundZ);
  const cap = capAt(thrown.cloud, floor, cell, t);
  layBillows(drawn, [...surge.billows, ...cap.billows], ramp, fiery, depth);
  layFlames(
    drawn,
    [
      ...surge.flames,
      ...hearthAt(floor, cell, t, ends, stage.seed),
      ...stemAt(thrown.cloud, floor, cell, t, stage.seed),
      ...crownAt(thrown.cloud, floor, cell, t, stage.seed),
      ...cap.flames,
    ],
    ramp,
    depth
  );
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);

  const rising = within(t, 0, STEM_S);
  if (rising < 1) drawn.motes.push(glow(heart, cell * 1.6, ramp[4], 0.35 * (1 - rising), forward * 1.3));
  drawBlastBeat(drawn, heart, floor, cell, ramp, t, 2.4, stage.seed, forward);
  drawFlareStreak(drawn, heart, cell * 1.1, t, 0.35, forward * 1.6);
  layLights(drawn, heart, floor, cell, area, ramp, t, ends);
  return drawn;
}

/**
 * The fire left burning in the crater once the stem has broken: a few low tongues, flickering, that
 * sink and redden until the smoke stops rising off it.
 */
function hearthAt(floor: Point, cell: number, t: number, ends: number, seed: number): Flame[] {
  const lit = within(t, STEM_S * 0.6, STEM_S + 0.4) * (1 - within(t, ends * 0.5, ends * SMOKES_UNTIL));
  if (lit <= 0.02) return [];
  return Array.from({ length: HEARTH_TONGUES }, (_unused, index): Flame => {
    const angle = (index / HEARTH_TONGUES) * Math.PI * 2 + seed;
    const flicker = 0.75 + 0.15 * Math.sin(t * 11 + index * 2.1) + 0.1 * Math.sin(t * 27 + index);
    const wide = cell * (index === 0 ? 0.7 : 0.45) * (0.6 + 0.4 * lit);
    return {
      shape: 'lick',
      at: {
        x: floor.x + Math.cos(angle) * cell * (index === 0 ? 0 : 0.4),
        y: floor.y + Math.sin(angle) * cell * (index === 0 ? 0 : 0.4),
        z: floor.z + cell * 0.02,
      },
      heading: { x: 0.15 * Math.sin(t * 3 + index), y: 0, z: 1 },
      wide,
      long: Math.max(wide, cell * (index === 0 ? 1.6 : 1) * lit * flicker),
      heat: 0.35 + 0.45 * lit,
      flowed: t * 5 + index * 3.1,
      variant: index * 1.9 + seed,
    };
  });
}

/** The light it throws over the table: a white flash for an instant, and the light of the stem and the cap for as long as they burn. */
function layLights(
  drawn: Staged,
  heart: Point,
  floor: Point,
  cell: number,
  area: number,
  ramp: readonly string[],
  t: number,
  ends: number
): void {
  if (t < 0.12) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.9 * (1 - t / 0.12), reachPx: cell * 3.5 });
  }
  const smoulders = within(t, STEM_S * 0.6, STEM_S + 0.4) * (1 - within(t, ends * 0.5, ends * SMOKES_UNTIL));
  const warm = Math.max(Math.pow(Math.max(0, 1 - t / 3.2), 1.3), 0.45 * smoulders);
  if (warm > 0.02) {
    drawn.lights.push({
      x: heart.x,
      y: heart.y,
      z: floor.z + cell * 1.6,
      color: mixColor(ramp[4], WARM, 0.5),
      strength: 1.2 * warm,
      reachPx: area * 0.8 + cell,
    });
  }
}

/** Throws every part of the blast, on its own clock from the moment it goes off. */
function throwMushroom(th: Thrower, heart: Point, floor: Point, ends: number): MushroomThrow {
  const U = th.cell;
  const cloud = throwCloud(th);
  const surge = throwBlast(th, blastWithin(SURGE, ends));
  const fires = throwGroundFires(th, th.count(18), [2.4, Math.max(3, ends * 0.45)]);
  const omens = throwGroundFires(th, 7, [3, 3]);
  const smokesUntil = Math.max(STEM_S + 0.3, ends * SMOKES_UNTIL);
  const column: Cloud[] = Array.from({ length: th.count(20) }, (_unused, index) => {
    const bornAt = index < 8 ? th.range(STEM_S * 0.45, STEM_S + 0.3) : th.range(STEM_S * 0.45, smokesUntil);
    return {
      mote: th.mote({
        x: floor.x + th.range(-0.25, 0.25) * U,
        y: floor.y + th.range(-0.25, 0.25) * U,
        z: floor.z + th.range(0.3, CAP_HEIGHT * 0.8) * U,
        vx: th.range(-0.2, 0.2) * U,
        vy: th.range(-0.2, 0.2) * U,
        vz: th.range(0.5, 1.1) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.8, 2.8),
        gravity: -0.1 * U,
        drag: 0.8,
        bounce: 0,
      }),
      size: th.range(0.75, 1.1),
      color: SMOKE,
      alpha: 0.55,
    };
  });
  const dust = rollingDust(th, floor, th.count(16), [3, 7], [0.8, 1.2]);
  const sparks = thrownSparks(th, heart, th.count(80), [7, 18]);
  const embers = [
    ...risingEmbers(th, heart, th.count(50), [0, 1.2], 0.5),
    ...risingEmbers(th, { ...floor, z: floor.z + U * CAP_HEIGHT * 0.8 }, th.count(40), [0.4, STEM_S + 0.3], 0.4),
    ...risingEmbers(th, { ...floor, z: floor.z + U * 0.3 }, th.count(40), [STEM_S, smokesUntil], 0.6),
  ];
  const brands = thrownBrands(th, heart, th.count(4), [3.5, 7.5]);
  const bits = [...thrownRocks(th, floor, th.count(10), [4.5, 8]), ...thrownGrit(th, floor, th.count(40), [3, 9])];
  return { cloud, surge, fires, omens, column, dust, sparks, embers, brands, bits };
}
