import {
  type Choreography,
  nothingStaged,
  outCubic,
  type Stage,
  type Staged,
  within,
} from '@axe/domain/effect/scene/choreography';
import { mixColor, rampOf } from '@axe/domain/effect/scene/effect-ramp';
import type { EffectFloorMark, EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { moteAt, seededRun, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';

/*
 * A burst: heat gathers to a point; it goes off in a white flash, held for an instant, with two shock
 * rings racing out along the floor and a band of dust behind them; balls of flame are flung out and
 * up, cooling down the ramp as they rise and turning to smoke; sparks fly, are slowed, fall and
 * bounce; burning brands arc out, land and burn on; rocks and grit are thrown up, tumble and settle;
 * dust rolls out along the floor and a column of it rises; embers drift up and die; the floor under it
 * is scorched white-hot and cools through the fire to soot. The flash is fast and the release slow:
 * the smoke rises away and the scorch cools long after the blow.
 *
 * Every length is in cells and every speed in cells a second, so it plays alike at any size; every
 * part is thrown once for a cast and a target, from the seed, and moved by the same steps on every
 * seat.
 */

const SMOKE = '#221d26';
const STONE = '#6e625b';
const DUST = '#7a6a5c';
const WARM = '#ffb060';
const BRAND = '#2a1d1c';

/** How long a burst lingers after its playback as its smoke clears, in seconds. */
const LINGER_S = 1.8;

interface Point {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** One ball of flame: where it flies, how wide it is, in cells, and how much of its life it burns before it is smoke. */
interface FireBall {
  readonly mote: ThrownMote;
  readonly size: number;
  /** The share of its life it burns before it is smoke; all of it for one that only burns out. */
  readonly burns: number;
  readonly variant: number;
}

/** A cloud of smoke or dust: where it drifts and how wide it is, in cells. */
interface Cloud {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly color: string;
  readonly alpha: number;
}

/** A piece of rock or a speck of grit, which tumbles. */
interface Bit {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly color: string;
  readonly turnRate: number;
  readonly variant: number;
}

/** A burning brand: a chunk that arcs out trailing flame, and burns on where it lands. */
interface Brand {
  readonly mote: ThrownMote;
  readonly power: number;
}

/** What a burst throws, thrown once for a seed and a size and kept while it plays. */
interface Thrown {
  readonly fire: readonly FireBall[];
  readonly clouds: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly brands: readonly Brand[];
  readonly bits: readonly Bit[];
}

const thrownByStage = new Map<string, Thrown>();
const MAX_KEPT = 48;

export const burst: Choreography = { lingerS: LINGER_S, draw: drawBurst };

function drawBurst(stage: Stage): Staged {
  const drawn = nothingStaged();
  const { cell } = stage;
  const goesOff = stage.blowsAt[0] ?? 0;
  const t = stage.seconds - goesOff;
  const ends = stage.duration + LINGER_S - goesOff;
  const ramp = rampOf(stage.preset.colorPrimary, stage.preset.colorSecondary, 7);
  const heart = { x: stage.x, y: stage.y, z: stage.z + cell * 0.35 };
  const forward = cell * 0.5;

  if (t < 0) {
    // Heat gathers to a point before it goes off.
    const gather = goesOff > 0 ? within(stage.seconds, 0, goesOff) : 1;
    drawn.motes.push(glow(heart, cell * (0.2 + gather * 0.5), ramp[5], 0.4 + gather * 0.5, forward));
    return drawn;
  }
  const thrown = thrownFor(stage, ends);
  const clearing = 1 - within(t, ends - 0.5, ends);

  layScorch(drawn, stage, ramp, t, clearing);
  layRings(drawn, stage, ramp, t);

  // Behind first: what the fire hides is drawn before the fire.
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  for (const fire of thrown.fire) drawFire(drawn, fire, t, cell, ramp, forward);
  for (const brand of thrown.brands) drawBrand(drawn, brand, t, cell, ramp, forward);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);

  // The hero frame: a disc of light held through the blow's stop, white at its heart and rimmed in
  // the fire, shrinking away.
  if (t < 0.07) {
    const left = 1 - t / 0.07;
    const width = cell * 1.1 * (0.8 + 0.2 * left);
    const near = width * 0.8;
    drawn.motes.push(lightBall(heart, width * 1.12, ramp[3], 0.55, near));
    drawn.motes.push(lightBall(heart, width, left > 0.45 ? ramp[5] : ramp[4], 0.7, near + 1));
    drawn.motes.push(lightBall(heart, width * 0.58, '#ffffff', left > 0.45 ? 1 : 0.6, near + 2));
  }

  layLights(drawn, cell, heart, ramp, t);
  return drawn;
}

/** The floor under the blast: white-hot at once, cooling from its edge in through the fire to soot, and gone as the smoke clears. */
function layScorch(drawn: Staged, stage: Stage, ramp: readonly string[], t: number, clearing: number): void {
  const reach = stage.cell * 0.62 * Math.min(1, t / 0.08);
  const at = { x: stage.x, y: stage.y, z: stage.groundZ };
  const seed = (stage.seed % 89) + 1;
  drawn.floor.push(floorMark('scorch', at, reach, 1, SMOKE, 0.55 * clearing, 'color', seed));
  const heat = Math.pow(Math.max(0, 1 - t / 1.5), 1.4);
  if (heat <= 0) return;
  drawn.floor.push(floorMark('disc', at, stage.cell * 1.7, 1, WARM, 0.32 * heat, 'light', 0));
  // Each step of heat reaches as far as the floor is still that hot: the middle stays hot the longest.
  for (const [level, step] of [
    [0.1, 1],
    [0.4, 3],
    [0.7, 5],
    [0.95, 6],
  ] as const) {
    const share = 1.25 - level / heat;
    if (share <= 0.05) continue;
    drawn.floor.push(floorMark('scorch', at, reach * Math.min(1, share), 1, ramp[step], 0.85, 'light', seed));
  }
}

/** Two shock rings racing out along the floor, and a band of dust thrown out behind them. */
function layRings(drawn: Staged, stage: Stage, ramp: readonly string[], t: number): void {
  const { cell } = stage;
  const at = { x: stage.x, y: stage.y, z: stage.groundZ };
  for (const [life, from, to, thick, step] of [
    [0.34, 0.34, 2, 0.13, 4],
    [0.22, 0.22, 1.2, 0.08, 2],
  ] as const) {
    const left = 1 - t / life;
    if (left <= 0) continue;
    const radius = cell * (from + (to - from) * (1 - left * left * left));
    const width = (cell * Math.max(0.03, thick * left + 0.015)) / radius;
    drawn.floor.push(floorMark('ring', at, radius, width, ramp[step], Math.min(1, left * 1.6), 'light', 0));
  }
  const band = t / 0.5;
  if (band >= 1) return;
  const radius = cell * 2.5 * outCubic(band);
  if (radius <= cell * 0.1) return;
  const width = (cell * Math.max(0.04, 0.17 * (1 - band))) / radius;
  drawn.floor.push(floorMark('ring', at, radius, width, DUST, Math.min(1, 1.15 - band) * 0.7, 'color', 0));
  drawn.floor.push(floorMark('ring', at, radius * 0.97, width * 0.35, ramp[3], (1 - band) * 0.8, 'light', 0));
}

function drawFire(
  drawn: Staged,
  fire: FireBall,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  const at = moteAt(fire.mote, t);
  if (!at) return;
  const age = at.age;
  const smokes = fire.burns < 1;
  if (age < fire.burns) {
    const burnt = age / fire.burns;
    // Hard steps down the ramp as it cools, from the light colour to the dark; white only at its heart while young.
    const step = burnt < 0.06 ? 5 : burnt < 0.28 ? 4 : burnt < 0.52 ? 3 : burnt < 0.78 ? 2 : 1;
    // One that turns to smoke fades into it; one that burns out shrinks away to nothing.
    const dying = within(burnt, smokes ? 0.55 : 0.6, 1);
    const size = cell * fire.size * (1 - 0.4 * burnt) * (smokes ? 1 : 1 - 0.75 * dying);
    const alpha = smokes ? 1 - dying : 1 - dying * dying * dying;
    const near = Math.max(forward, size * 0.6);
    if (burnt < 0.45) drawn.motes.push(glow(at, size * 1.5, ramp[step], 0.2 * (1 - burnt / 0.45), near));
    // Three balls a step apart, the hotter the smaller and the higher: lit on its cap, shaded beneath.
    drawn.motes.push(ball(at, size, ramp[step - 1], alpha, near, fire.variant));
    const body = { x: at.x, y: at.y, z: at.z + size * 0.09 };
    drawn.motes.push(ball(body, size * 0.78, ramp[step], alpha, near + size * 0.05, fire.variant + 1.3));
    if (burnt < 0.6) {
      const core = { x: at.x, y: at.y, z: at.z + size * 0.16 };
      drawn.motes.push(ball(core, size * 0.42, ramp[step + 1], alpha, near + size * 0.1, fire.variant + 2.9));
    }
  }
  if (!smokes || age < fire.burns * 0.6) return;
  // It turns to smoke as it dies, swelling and thinning as it rises.
  const smoked = within(age, fire.burns * 0.6, 1);
  const size = cell * fire.size * (0.9 + smoked * 1.1);
  const alpha = Math.min(within(smoked, 0, 0.2), 1 - smoked) * 0.7;
  drawn.motes.push(smokePuff(at, size, mixColor(SMOKE, ramp[0], 0.25), alpha, forward));
}

function drawCloud(drawn: Staged, cloud: Cloud, t: number, cell: number, forward: number): void {
  const at = moteAt(cloud.mote, t);
  if (!at) return;
  const age = at.age;
  const size = cell * cloud.size * (0.7 + age * 0.9);
  const alpha = Math.min(within(age, 0, 0.15), 1 - age) * cloud.alpha;
  drawn.motes.push(smokePuff(at, size, cloud.color, alpha, forward));
  // A cloud is three soft discs: two smaller beside and over the first.
  const left = { x: at.x - size * 0.3, y: at.y, z: at.z + size * 0.12 };
  const right = { x: at.x + size * 0.28, y: at.y, z: at.z + size * 0.22 };
  drawn.motes.push(smokePuff(left, size * 0.7, cloud.color, alpha * 0.9, forward));
  drawn.motes.push(smokePuff(right, size * 0.62, cloud.color, alpha * 0.9, forward));
}

function drawBit(drawn: Staged, bit: Bit, t: number, cell: number, ramp: readonly string[], forward: number): void {
  const at = moteAt(bit.mote, t);
  if (!at) return;
  // Lit by the blast while it burns, then its own colour.
  const lit = 0.65 * Math.max(0, 1 - t / 0.6);
  drawn.motes.push({
    x: at.x,
    y: at.y,
    z: at.z + cell * bit.size * 0.4,
    size: cell * bit.size,
    color: lit > 0 ? mixColor(bit.color, ramp[4], lit) : bit.color,
    alpha: Math.min(1, (1 - at.age) * 2.5),
    blend: 'color',
    shape: 'chunk',
    spin: at.landed ? bit.variant : (t - bit.mote.bornAt) * bit.turnRate + bit.variant,
    variant: bit.variant,
    forward,
  });
}

function drawBrand(
  drawn: Staged,
  brand: Brand,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  const now = moteAt(brand.mote, t);
  if (!now) return;
  const burning = (1 - now.age * now.age) * brand.power;
  if (!now.landed) {
    // A streak of flame behind it, and the light of it.
    drawn.motes.push({
      ...glow(now, cell * 0.13, ramp[4], burning + 0.2, forward),
      shape: 'spark',
      velocity: { x: now.vx, y: now.vy, z: now.vz },
      trail: 0.07,
    });
    drawn.motes.push(glow(now, cell * 0.45, ramp[4], 0.35 * burning, forward));
  } else {
    // It burns on where it landed: little flames licking up from it, flickering.
    drawn.motes.push(glow(now, cell * 0.6, WARM, 0.3 * burning, forward));
    for (let lick = 0; lick < 3; lick++) {
      const phase = (t * 2.3 + lick / 3 + brand.power) % 1;
      const flame = { x: now.x + (lick - 1) * cell * 0.04, y: now.y, z: now.z + cell * (0.04 + phase * 0.26) };
      const size = cell * 0.17 * (1 - phase) * burning;
      if (size > cell * 0.02) {
        drawn.motes.push(ball(flame, size, ramp[Math.max(1, 5 - Math.floor(phase * 4))], 1, forward, lick));
      }
    }
  }
  drawn.motes.push({ ...ball(now, cell * 0.11, BRAND, 1, forward, 3), shape: 'chunk', spin: now.landed ? 0 : t * 9 });
}

function drawSpark(
  drawn: Staged,
  spark: ThrownMote,
  t: number,
  cell: number,
  ramp: readonly string[],
  index: number,
  forward: number
): void {
  const at = moteAt(spark, t);
  if (!at) return;
  const age = at.age;
  const step = age < 0.2 ? 6 : age < 0.45 ? 5 : age < 0.75 ? 4 : 2;
  drawn.motes.push({
    x: at.x,
    y: at.y,
    z: at.z,
    size: cell * (index % 4 === 0 ? 0.06 : 0.04),
    color: ramp[step],
    alpha: age < 0.7 ? 1 : 1 - within(age, 0.7, 1),
    blend: 'light',
    shape: 'spark',
    velocity: { x: at.vx, y: at.vy, z: at.vz },
    trail: 0.028,
    forward,
  });
}

function drawEmber(
  drawn: Staged,
  ember: ThrownMote,
  t: number,
  cell: number,
  ramp: readonly string[],
  index: number,
  forward: number
): void {
  const at = moteAt(ember, t);
  if (!at) return;
  const flicker = 0.6 + 0.4 * Math.sin(t * 27 + index * 2.3);
  const step = at.age < 0.3 ? 5 : at.age < 0.7 ? 4 : 3;
  drawn.motes.push(glow(at, cell * 0.075, ramp[step], (1 - at.age) * flicker, forward));
}

/** The light it throws over the table: a white flash for an instant and a warm light that dies away as the fire does. */
function layLights(drawn: Staged, cell: number, heart: Point, ramp: readonly string[], t: number): void {
  if (t < 0.08) {
    drawn.lights.push({ ...heart, color: '#ffffff', strength: 1.4 * (1 - t / 0.08), reachPx: cell * 1.6 });
  }
  const warm = Math.pow(Math.max(0, 1 - t / 0.9), 1.5);
  if (warm > 0.02) {
    drawn.lights.push({ ...heart, color: mixColor(ramp[4], WARM, 0.5), strength: 1.1 * warm, reachPx: cell * 3 });
  }
}

function glow(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: Math.max(0, alpha), blend: 'light', shape: 'glow', forward };
}

function lightBall(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha, blend: 'light', shape: 'puff', variant: 0, forward };
}

function ball(at: Point, size: number, color: string, alpha: number, forward: number, variant: number): EffectMote {
  const shown = Math.max(0, alpha);
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: shown, blend: 'color', shape: 'puff', variant, forward };
}

function smokePuff(at: Point, size: number, color: string, alpha: number, forward: number): EffectMote {
  return { x: at.x, y: at.y, z: at.z, size, color, alpha: Math.max(0, alpha), blend: 'color', shape: 'smoke', forward };
}

function floorMark(
  shape: 'ring' | 'disc' | 'scorch',
  at: Point,
  radius: number,
  width: number,
  color: string,
  alpha: number,
  blend: 'light' | 'color',
  seed: number
): EffectFloorMark {
  return { shape, x: at.x, y: at.y, z: at.z, radius, width, color, alpha: Math.max(0, alpha), blend, turn: 0, seed };
}

/** What a burst throws for a stage, thrown once and kept while it plays. */
function thrownFor(stage: Stage, ends: number): Thrown {
  const key = [stage.seed, stage.cell, ends, stage.preset.gradeLevel, stage.x, stage.y, stage.z, stage.groundZ].join(
    '|'
  );
  const kept = thrownByStage.get(key);
  if (kept) return kept;
  const made = throwBurst(stage, ends);
  thrownByStage.set(key, made);
  if (thrownByStage.size > MAX_KEPT) thrownByStage.delete(thrownByStage.keys().next().value!);
  return made;
}

/** Throws every part of a burst, in cells and cells a second from its heart, on its own clock from the moment it goes off. */
function throwBurst(stage: Stage, ends: number): Thrown {
  const next = seededRun(stage.seed);
  const range = (low: number, high: number) => low + (high - low) * next();
  const chance = (share: number) => next() < share;
  const U = stage.cell;
  const density = stage.preset.gradeDensity;
  const count = (base: number) => Math.max(1, Math.round(base * density));
  const heartZ = stage.z + U * 0.35;
  const floorZ = stage.groundZ;
  const fall = 13 * U;
  const lifeOf = (bornAt: number, low: number, high: number) =>
    Math.max(0.05, Math.min(range(low, high), ends - bornAt - 0.02));
  const thrown = (fields: Omit<ThrownMote, 'floorZ'>): ThrownMote => ({ ...fields, floorZ });
  const outward = () => {
    const angle = range(0, Math.PI * 2);
    return { cos: Math.cos(angle), sin: Math.sin(angle) };
  };

  const fire: FireBall[] = [];
  // The heart of the fireball: a few big balls that burn out where it went off.
  for (let index = 0; index < 5; index++) {
    fire.push({
      mote: thrown({
        x: stage.x + range(-0.1, 0.1) * U,
        y: stage.y + range(-0.1, 0.1) * U,
        z: heartZ + range(-0.1, 0.1) * U,
        vx: range(-0.8, 0.8) * U,
        vy: range(-0.8, 0.8) * U,
        vz: range(0.4, 1.6) * U,
        bornAt: 0,
        life: lifeOf(0, 0.18, 0.3),
        gravity: -U,
        drag: 3,
        bounce: 0,
      }),
      size: range(0.6, 0.82),
      burns: 1,
      variant: range(0, 6),
    });
  }
  // Flung out every way and up, nearly half of them turning to smoke.
  for (let index = 0; index < count(25); index++) {
    const way = outward();
    const from = range(0, 0.3) * U;
    const speed = range(0.8, 3.4) * U;
    const smokes = chance(0.45);
    const big = chance(0.3);
    fire.push({
      mote: thrown({
        x: stage.x + way.cos * from,
        y: stage.y + way.sin * from,
        z: heartZ + range(-0.15, 0.2) * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: range(-0.2, 0.8) * speed * 0.6 + 1.7 * U,
        bornAt: 0,
        life: lifeOf(0, smokes ? 1.1 : 0.45, smokes ? 2 : 0.95),
        gravity: -range(1.6, 3) * U,
        drag: 3.2,
        bounce: 0,
      }),
      size: big ? range(0.55, 0.75) : range(0.22, 0.45),
      burns: smokes ? range(0.38, 0.5) : 1,
      variant: range(0, 6),
    });
  }
  // A column of flame rising straight up out of it.
  for (let index = 0; index < 5; index++) {
    const smokes = chance(0.6);
    const bornAt = range(0, 0.1);
    fire.push({
      mote: thrown({
        x: stage.x + range(-0.19, 0.19) * U,
        y: stage.y + range(-0.19, 0.19) * U,
        z: heartZ,
        vx: range(-0.5, 0.5) * U,
        vy: range(-0.5, 0.5) * U,
        vz: range(4.2, 7.5) * U,
        bornAt,
        life: lifeOf(bornAt, smokes ? 1.4 : 0.8, smokes ? 2.2 : 1.3),
        gravity: -0.5 * U,
        drag: 2.4,
        bounce: 0,
      }),
      size: range(0.36, 0.54),
      burns: smokes ? range(0.5, 0.62) : 1,
      variant: range(0, 6),
    });
  }

  const clouds: Cloud[] = [];
  // Smoke billowing out of it a moment after.
  for (let index = 0; index < count(10); index++) {
    const way = outward();
    const from = range(0, 0.53) * U;
    const speed = range(0.3, 1.5) * U;
    const bornAt = range(0.12, 0.45);
    clouds.push({
      mote: thrown({
        x: stage.x + way.cos * from,
        y: stage.y + way.sin * from,
        z: heartZ + range(0, 0.3) * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: range(0.6, 1.4) * U,
        bornAt,
        life: lifeOf(bornAt, 1.8, 2.8),
        gravity: -range(0.15, 0.35) * U,
        drag: 1.6,
        bounce: 0,
      }),
      size: range(0.6, 1),
      color: SMOKE,
      alpha: 0.7,
    });
  }
  // Dust rolling out along the floor.
  for (let index = 0; index < count(9); index++) {
    const way = outward();
    const from = range(0, 0.45) * U;
    const speed = range(2.25, 7.1) * U;
    const bornAt = range(0, 0.06);
    clouds.push({
      mote: thrown({
        x: stage.x + way.cos * from,
        y: stage.y + way.sin * from,
        z: floorZ + range(0.04, 0.2) * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: range(0.05, 0.6) * U,
        bornAt,
        life: lifeOf(bornAt, 1.1, 2),
        gravity: -0.15 * U,
        drag: 2.8,
        bounce: 0,
      }),
      size: range(0.5, 0.75),
      color: DUST,
      alpha: 0.35,
    });
  }
  // A column of dust thrown up from the floor.
  for (let index = 0; index < count(6); index++) {
    const bornAt = range(0, 0.15);
    clouds.push({
      mote: thrown({
        x: stage.x + range(-0.22, 0.22) * U,
        y: stage.y + range(-0.22, 0.22) * U,
        z: floorZ + range(0.05, 0.45) * U,
        vx: range(-0.6, 0.6) * U,
        vy: range(-0.6, 0.6) * U,
        vz: range(2, 5) * U,
        bornAt,
        life: lifeOf(bornAt, 1.6, 2.6),
        gravity: -0.2 * U,
        drag: 2.2,
        bounce: 0,
      }),
      size: range(0.6, 0.95),
      color: DUST,
      alpha: 0.3,
    });
  }

  const sparks = Array.from({ length: count(72) }, () => {
    const way = outward();
    const speed = range(5.8, 15.8) * U;
    return thrown({
      x: stage.x,
      y: stage.y,
      z: heartZ,
      vx: way.cos * speed,
      vy: way.sin * speed,
      vz: range(-0.35, 0.9) * speed + 2.9 * U,
      bornAt: range(0, 0.03),
      life: lifeOf(0, 0.18, 0.6),
      gravity: fall,
      drag: 2,
      bounce: 0.4,
    });
  });

  const embers = Array.from({ length: count(36) }, () => {
    const way = outward();
    const speed = range(1.25, 6.25) * U;
    const bornAt = range(0, 0.15);
    return thrown({
      x: stage.x + way.cos * 0.3 * U,
      y: stage.y + way.sin * 0.3 * U,
      z: heartZ,
      vx: way.cos * speed,
      vy: way.sin * speed,
      vz: range(0, 0.6) * speed + 3.1 * U,
      bornAt,
      life: lifeOf(bornAt, 1.2, 2.6),
      gravity: -range(0.2, 0.8) * U,
      drag: 2.2,
      bounce: 0,
    });
  });

  const brands = Array.from({ length: Math.round(range(3, 5) * density) }, () => {
    const way = outward();
    const speed = range(3, 6) * U;
    return {
      mote: thrown({
        x: stage.x,
        y: stage.y,
        z: heartZ,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: range(4, 8) * U,
        bornAt: 0.05,
        life: lifeOf(0, 1.6, 2.4),
        gravity: fall,
        drag: 0.6,
        bounce: 0,
      }),
      power: range(0.55, 0.85),
    };
  });

  const bits: Bit[] = [];
  // Rocks thrown high, tumbling, bouncing and settling.
  for (let index = 0; index < count(6); index++) {
    const way = outward();
    const speed = range(0.4, 2.2) * U;
    bits.push({
      mote: thrown({
        x: stage.x + range(-0.3, 0.3) * U,
        y: stage.y + range(-0.3, 0.3) * U,
        z: floorZ + 0.05 * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: range(3, 6) * U,
        bornAt: range(0.04, 0.1),
        life: lifeOf(0.1, 1.8, 2.6),
        gravity: fall,
        drag: 0.4,
        bounce: 0.3,
      }),
      size: range(0.08, 0.16),
      color: STONE,
      turnRate: range(-16, 16),
      variant: range(0, 6),
    });
  }
  // Grit thrown up in a cone, the steepest the fastest.
  const stones = [mixColor(STONE, '#ffffff', 0.25), STONE, STONE, mixColor(STONE, '#000000', 0.35)];
  for (let index = 0; index < count(36); index++) {
    const lean = range(-1, 1);
    const way = outward();
    const speed = range(2.5, 7) * U * (1 - 0.45 * Math.abs(lean));
    const across = Math.sin(Math.abs(lean) * 0.5);
    bits.push({
      mote: thrown({
        x: stage.x + way.cos * Math.abs(lean) * 0.19 * U,
        y: stage.y + way.sin * Math.abs(lean) * 0.19 * U,
        z: floorZ + 0.04 * U,
        vx: way.cos * across * speed,
        vy: way.sin * across * speed,
        vz: Math.cos(lean * 0.5) * speed,
        bornAt: range(0.04, 0.1),
        life: lifeOf(0.1, 1.2, 2.2),
        gravity: fall,
        drag: 0.6,
        bounce: 0.25,
      }),
      size: chance(0.45) ? 0.075 : 0.045,
      color: stones[index % stones.length],
      turnRate: range(-12, 12),
      variant: range(0, 6),
    });
  }

  return { fire, clouds, sparks, embers, brands, bits };
}
