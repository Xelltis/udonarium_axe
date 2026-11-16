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
  BLAST_WHITE_S,
  type BlastSize,
  blastWithin,
  drawBlast,
  drawBlastBeat,
  throwBlast,
} from '@axe/domain/effect/scene/fire/blast';
import { drawBrands, layFlames } from '@axe/domain/effect/scene/fire/fire-body';
import {
  type Bit,
  type Brand,
  type Cloud,
  drawBit,
  drawCloud,
  drawEmber,
  drawSpark,
  dustColumn,
  layDustBand,
  layScorch,
  layShockRing,
  risingEmbers,
  rollingDust,
  thrownBrands,
  thrownGrit,
  thrownRocks,
  thrownSparks,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import { glow, keptFor, type Point, stageKey, type Thrower, throwerFor } from '@axe/domain/effect/scene/parts';

/*
 * A burst: heat gathers to a point; it goes off in a white beat with rays, held for an instant; a
 * fireball swells out of it, licks of flame torn off it every way, and rolls up as it burns, cooling
 * from its edge in to a deep red and to smoke that rises away. Sparks fly, are slowed, fall and
 * bounce; embers drift up and die; the floor under it is scorched white-hot and cools to soot.
 *
 * Its grade is how large it is and how much it does, not only how many parts it throws. The least is
 * a pop: a small fireball and its sparks. The middle one throws a shock ring out along the floor,
 * raises dust and throws grit. The greatest throws a second ring and a band of dust behind them,
 * rocks, and burning brands that land and burn on. The flash is fast and the release slow: the smoke
 * rises away and the scorch cools long after the blow.
 *
 * A burst a meteor lands with leaves the beat, the fire and the scorch to the meteor, which strikes
 * with its own, and throws only what a burst throws about them.
 */

/** How long a burst lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 1.8;

/** The fireball of a burst of each grade, in cells and seconds. */
const BLASTS: Record<1 | 2 | 3, BlastSize> = {
  1: { reach: 0.46, lobes: 4, licks: 6, swellS: 0.14, burnsS: 0.42, smokeS: 0.7, rises: 0.9 },
  2: { reach: 0.68, lobes: 6, licks: 9, swellS: 0.18, burnsS: 0.6, smokeS: 0.95, rises: 1.3 },
  3: { reach: 0.92, lobes: 9, licks: 12, swellS: 0.22, burnsS: 0.8, smokeS: 1.15, rises: 1.8 },
};
/** How strong the beat a burst of each grade strikes in is, and how far its scorch reaches, in cells. */
const BEAT: Record<1 | 2 | 3, number> = { 1: 0.6, 2: 1, 3: 1.4 };
const SCORCH: Record<1 | 2 | 3, number> = { 1: 0.4, 2: 0.62, 3: 0.85 };

/** All a burst throws besides its fireball. */
interface BurstThrow {
  readonly blast: Blast;
  readonly clouds: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly brands: readonly Brand[];
  readonly bits: readonly Bit[];
}

const thrownByStage = new Map<string, BurstThrow>();

export const burst: Choreography = { lingerS: LINGER_S, draw: drawBurst };

function drawBurst(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const grade = stage.preset.gradeLevel;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = flameRampOf(stage.preset.colorPrimary, stage.preset.colorSecondary);
  const fiery = isFlame(stage.preset.colorSecondary);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.4 };
  const floor = { x: stage.x, y: stage.y, z: stage.groundZ };
  const forward = cell * 0.5;

  if (t < 0) {
    const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
    drawn.motes.push(glow(heart, cell * (0.2 + gather * 0.5), ramp[5], 0.4 + gather * 0.5, forward));
    return drawn;
  }
  const thrown = keptFor(thrownByStage, stageKey(stage, ends), () =>
    throwBurst(throwerFor(stage, ends), heart, floor, grade, ends)
  );
  const clearing = 1 - within(t, ends - 0.5, ends);
  const depth = { forward };
  const bare = stage.preset.effectKind === 'projectile' && stage.preset.projectileLook === 'meteor';

  if (!bare) layScorch(drawn, floor, cell * SCORCH[grade], ramp, t, 0.9 + 0.4 * grade, clearing, (stage.seed % 89) + 1);
  if (grade >= 2) layShockRing(drawn, floor, cell * 0.34, cell * (1.4 + 0.5 * grade), cell * 0.13, ramp[4], t, 0.34);
  if (grade >= 3) {
    layShockRing(drawn, floor, cell * 0.22, cell * 1.6, cell * 0.08, ramp[2], t - 0.05, 0.3);
    layDustBand(drawn, floor, cell * 2.7, cell * 0.17, ramp, t, 0.5);
  }
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  const litter = drawBrands(drawn, thrown.brands, t, cell, ramp, forward);
  if (!bare) drawBlast(drawn, thrown.blast, heart, cell, ramp, t, stage.groundZ, fiery, depth);
  layFlames(drawn, litter, ramp, { forward: cell * 0.1, exact: true });
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);
  if (bare) return drawn;
  drawBlastBeat(drawn, heart, floor, cell, ramp, t, BEAT[grade], stage.seed, forward);
  layLights(drawn, cell, heart, ramp, t, BEAT[grade]);
  return drawn;
}

/** The light it throws over the table: a white flash for an instant and a warm light that dies away as the fire does. */
function layLights(drawn: Staged, cell: number, heart: Point, ramp: readonly string[], t: number, power: number): void {
  if (t < BLAST_WHITE_S + 0.02) {
    const left = 1 - t / (BLAST_WHITE_S + 0.02);
    drawn.lights.push({ ...heart, color: '#ffffff', strength: (1 + 0.5 * power) * left, reachPx: cell * 1.8 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / (0.6 + 0.4 * power)), 1.5);
  if (warm > 0.02) {
    drawn.lights.push({ ...heart, color: mixColor(ramp[4], WARM, 0.5), strength: 1.1 * warm, reachPx: cell * 3 });
  }
}

/** Throws every part of a burst from its heart, on its own clock from the moment it goes off. */
function throwBurst(th: Thrower, heart: Point, floor: Point, grade: 1 | 2 | 3, ends: number): BurstThrow {
  const blast = throwBlast(th, blastWithin(BLASTS[grade], ends));
  const sparkSpeed = grade === 1 ? ([4.5, 11] as const) : grade === 2 ? ([5.8, 15.8] as const) : ([7, 18] as const);
  const sparks = thrownSparks(th, heart, th.count(56), sparkSpeed);
  const embers = risingEmbers(th, heart, th.count(30), [0, 0.15], 0.2 + 0.12 * grade);
  if (grade === 1) return { blast, clouds: [], sparks, embers, brands: [], bits: thrownGrit(th, floor, th.count(12)) };
  const clouds = [...rollingDust(th, floor, th.count(8)), ...dustColumn(th, floor, th.count(4))];
  const bits = [...thrownGrit(th, floor, th.count(30))];
  if (grade === 2) return { blast, clouds, sparks, embers, brands: [], bits };
  return {
    blast,
    clouds,
    sparks,
    embers,
    brands: thrownBrands(th, heart, th.count(3), [3, 6.5]),
    bits: [...bits, ...thrownRocks(th, floor, th.count(4))],
  };
}
