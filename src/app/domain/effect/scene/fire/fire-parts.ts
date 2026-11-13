import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { moteAt, type ThrownMote } from '@axe/domain/effect/scene/effect-sim';
import {
  ball,
  floorMark,
  glow,
  haze,
  hueOf,
  lightBall,
  type Point,
  smokePuff,
  type Thrower,
} from '@axe/domain/effect/scene/parts';

/*
 * The parts of what burns and blows apart, each thrown once from a seed and drawn as it flies:
 * balls of flame cooling down the ramp, clouds of smoke and dust, rocks and grit, burning brands,
 * sparks and embers; and on the floor, shock rings, a band of dust and a scorch. A look of fire is
 * these, thrown as many, as fast and as large as it asks.
 *
 * Every length is in cells and every speed in cells a second; a ramp runs from the deepest shadow at
 * 0 to white at 6.
 */

export const SMOKE = '#221d26';
export const STONE = '#6e625b';
export const DUST = '#7a6a5c';
export const WARM = '#ffb060';
const BRAND = '#2a1d1c';

/** One ball of flame: where it flies, how wide it is, in cells, and how much of its life it burns before it is smoke. */
export interface FireBall {
  readonly mote: ThrownMote;
  readonly size: number;
  /** The share of its life it burns before it is smoke; all of it for one that only burns out. */
  readonly burns: number;
  readonly variant: number;
  /** How far it sways from side to side as it rises, in cells, as a tongue of flame does; nothing for none. */
  readonly sway?: number;
  /** The step of the ramp it is born at; the light colour's step above it, for a ball that starts white-hot. */
  readonly hottest?: number;
  /** How much narrower it is at the end of its burning than at its birth, as a share; 0.4 for none given. */
  readonly taper?: number;
  /**
   * How far it is drawn out behind it as it flies, in seconds of its flight, as a gout of flame
   * streaming from a mouth; nothing for a ball that is only round.
   */
  readonly streak?: number;
  /**
   * Whether it is drawn as soft light rather than as a hard ball of colour: a breath of frost, of
   * lightning or of light, which is no flame and has no stepped body.
   */
  readonly soft?: boolean;
}

/** A cloud of smoke or dust: where it drifts and how wide it is, in cells. */
export interface Cloud {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly color: string;
  readonly alpha: number;
  /** How long it is drawn out the way it rises, in cells, as a plume of a column of smoke; nothing for a round cloud. */
  readonly plume?: number;
}

/** A piece of rock or a speck of grit, which tumbles. */
export interface Bit {
  readonly mote: ThrownMote;
  readonly size: number;
  readonly color: string;
  readonly turnRate: number;
  readonly variant: number;
}

/** A burning brand: a chunk that arcs out trailing flame, and burns on where it lands. */
export interface Brand {
  readonly mote: ThrownMote;
  readonly power: number;
}

/** Everything a look of fire throws. */
export interface FireThrow {
  readonly fire: readonly FireBall[];
  readonly clouds: readonly Cloud[];
  readonly sparks: readonly ThrownMote[];
  readonly embers: readonly ThrownMote[];
  readonly brands: readonly Brand[];
  readonly bits: readonly Bit[];
}

/** Draws all a look of fire has thrown at a moment, what is behind first: smoke and debris, the flame, then light. */
export function drawFireThrow(
  drawn: Staged,
  thrown: FireThrow,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  for (const cloud of thrown.clouds) drawCloud(drawn, cloud, t, cell, forward);
  for (const bit of thrown.bits) drawBit(drawn, bit, t, cell, ramp, forward);
  for (const fire of thrown.fire) drawFire(drawn, fire, t, cell, ramp, forward);
  for (const brand of thrown.brands) drawBrand(drawn, brand, t, cell, ramp, forward);
  for (const [index, spark] of thrown.sparks.entries()) drawSpark(drawn, spark, t, cell, ramp, index, forward);
  for (const [index, ember] of thrown.embers.entries()) drawEmber(drawn, ember, t, cell, ramp, index, forward);
}

/**
 * A ball of flame at a moment: three balls a step apart down the ramp, the hotter the smaller and the
 * higher, cooling a step at a time; one that turns to smoke fades into a cloud swelling as it rises,
 * one that burns out shrinks away to nothing.
 */
export function drawFire(
  drawn: Staged,
  fire: FireBall,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  const now = moteAt(fire.mote, t);
  if (!now) return;
  const age = now.age;
  const sway = fire.sway ? Math.sin(fire.variant * 3 + t * 7) * fire.sway * cell * age : 0;
  const at = sway ? { x: now.x + sway, y: now.y, z: now.z } : now;
  const smokes = fire.burns < 1;
  if (age < fire.burns) {
    const burnt = age / fire.burns;
    const hottest = fire.hottest ?? 5;
    const step = Math.max(
      1,
      Math.min(hottest, burnt < 0.06 ? 5 : burnt < 0.28 ? 4 : burnt < 0.52 ? 3 : burnt < 0.78 ? 2 : 1)
    );
    const dying = within(burnt, smokes ? 0.55 : 0.6, 1);
    const size = cell * fire.size * (1 - (fire.taper ?? 0.4) * burnt) * (smokes ? 1 : 1 - 0.75 * dying);
    const alpha = smokes ? 1 - dying : 1 - dying * dying * dying;
    const near = Math.max(forward, size * 0.6);
    if (fire.soft) {
      // Soft light: a wide glow of the colour and a white heart, drawn out behind it as it streams.
      const velocity = { x: now.vx, y: now.vy, z: now.vz };
      const streaming = fire.streak ? fire.streak : 0;
      drawn.motes.push(haze(at, size * 2, hueOf(ramp), 0.4 * alpha, near));
      drawn.motes.push(glow(at, size * 1.6, ramp[3], 0.45 * alpha, near));
      drawn.motes.push({
        ...glow(at, size * 0.7, ramp[4], 0.8 * alpha, near),
        shape: streaming ? 'comet' : 'puff',
        velocity,
        trail: streaming,
        blend: 'light',
      });
      if (burnt < 0.5)
        drawn.motes.push({
          ...glow(at, size * 0.3, '#ffffff', alpha, near + 1),
          shape: streaming ? 'comet' : 'puff',
          velocity,
          trail: streaming * 0.6,
          blend: 'light',
        });
      return;
    }
    if (burnt < 0.45) drawn.motes.push(glow(at, size * 1.5, ramp[step], 0.2 * (1 - burnt / 0.45), near));
    const drawnOut = fire.streak ? Math.hypot(now.vx, now.vy, now.vz) * fire.streak : 0;
    if (drawnOut > size * 0.5) {
      // Streaming fast it is drawn out behind it, round at its head: three comets a step apart.
      const velocity = { x: now.vx, y: now.vy, z: now.vz };
      for (const [share, lift, step2] of [
        [1, 0, step - 1],
        [0.72, 0.05, step],
        [0.4, 0.1, step + 1],
      ] as const) {
        if (share < 0.5 && burnt >= 0.6) continue;
        drawn.motes.push({
          ...ball(at, size * share, ramp[step2], alpha, near + size * lift, fire.variant + share * 3),
          shape: 'comet',
          velocity,
          trail: fire.streak! * share,
        });
      }
    } else {
      drawn.motes.push(ball(at, size, ramp[step - 1], alpha, near, fire.variant));
      const body = { x: at.x, y: at.y, z: at.z + size * 0.09 };
      drawn.motes.push(ball(body, size * 0.78, ramp[step], alpha, near + size * 0.05, fire.variant + 1.3));
      if (burnt < 0.6) {
        const core = { x: at.x, y: at.y, z: at.z + size * 0.16 };
        drawn.motes.push(ball(core, size * 0.42, ramp[step + 1], alpha, near + size * 0.1, fire.variant + 2.9));
      }
    }
  }
  if (!smokes || age < fire.burns * 0.6) return;
  const smoked = within(age, fire.burns * 0.6, 1);
  const size = cell * fire.size * (0.9 + smoked * 1.1);
  const alpha = Math.min(within(smoked, 0, 0.2), 1 - smoked) * 0.7;
  drawn.motes.push(smokePuff(at, size, mixColor(SMOKE, ramp[0], 0.25), alpha, forward));
}

/** A cloud at a moment: three soft discs, swelling as it drifts and thinning away. */
export function drawCloud(drawn: Staged, cloud: Cloud, t: number, cell: number, forward: number): void {
  const at = moteAt(cloud.mote, t);
  if (!at) return;
  const age = at.age;
  const size = cell * cloud.size * (0.7 + age * 0.9);
  const alpha = Math.min(within(age, 0, 0.15), 1 - age) * cloud.alpha;
  const speed = Math.hypot(at.vx, at.vy, at.vz);
  if (cloud.plume && speed > 1) {
    drawn.motes.push({
      ...smokePuff(at, size, cloud.color, alpha, forward),
      shape: 'plume',
      velocity: { x: at.vx, y: at.vy, z: at.vz },
      trail: (cloud.plume * cell * (0.8 + age * 0.6)) / speed,
    });
    return;
  }
  drawn.motes.push(smokePuff(at, size, cloud.color, alpha, forward));
  const left = { x: at.x - size * 0.3, y: at.y, z: at.z + size * 0.12 };
  const right = { x: at.x + size * 0.28, y: at.y, z: at.z + size * 0.22 };
  drawn.motes.push(smokePuff(left, size * 0.7, cloud.color, alpha * 0.9, forward));
  drawn.motes.push(smokePuff(right, size * 0.62, cloud.color, alpha * 0.9, forward));
}

/** A rock or a speck of grit at a moment, tumbling while it flies, lit by the blast at first. */
export function drawBit(
  drawn: Staged,
  bit: Bit,
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): void {
  const at = moteAt(bit.mote, t);
  if (!at) return;
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

/** A burning brand at a moment: a streak of flame behind it while it flies, little flames licking up where it lands. */
export function drawBrand(
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
    drawn.motes.push({
      ...glow(now, cell * 0.13, ramp[4], burning + 0.2, forward),
      shape: 'spark',
      velocity: { x: now.vx, y: now.vy, z: now.vz },
      trail: 0.07,
    });
    drawn.motes.push(glow(now, cell * 0.45, ramp[4], 0.35 * burning, forward));
  } else {
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

/** A spark at a moment: a streak of light drawn out by its speed, cooling as it falls. */
export function drawSpark(
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

/** An ember at a moment: a mote of light drifting up, flickering as it dies. */
export function drawEmber(
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

/**
 * The hero frame of a blast: a disc of light, white at its heart and rimmed in the fire, shrinking
 * away over its first instant; held through the blow's stop.
 */
export function drawFlashDisc(
  drawn: Staged,
  heart: Point,
  width: number,
  ramp: readonly string[],
  t: number,
  lasts = 0.07
): void {
  if (t >= lasts) return;
  const left = 1 - t / lasts;
  const across = width * (0.8 + 0.2 * left);
  const near = across * 0.8;
  drawn.motes.push(lightBall(heart, across * 1.12, ramp[3], 0.55, near));
  drawn.motes.push(lightBall(heart, across, left > 0.45 ? ramp[5] : ramp[4], 0.7, near + 1));
  drawn.motes.push(lightBall(heart, across * 0.58, '#ffffff', left > 0.45 ? 1 : 0.6, near + 2));
}

/**
 * A scorch on the floor: white-hot at once, cooling from its edge in through the fire to soot over
 * `coolS` seconds, and gone as `clearing` falls to nothing. Under it a warm pool of light while it is hot.
 */
export function layScorch(
  drawn: Staged,
  floor: Point,
  reach: number,
  ramp: readonly string[],
  t: number,
  coolS: number,
  clearing: number,
  seed: number
): void {
  const spread = reach * Math.min(1, t / 0.08);
  drawn.floor.push(floorMark('scorch', floor, spread, 1, SMOKE, 0.55 * clearing, 'color', seed));
  const heat = Math.pow(Math.max(0, 1 - t / coolS), 1.4);
  if (heat <= 0) return;
  drawn.floor.push(floorMark('disc', floor, reach * 2.75, 1, WARM, 0.32 * heat, 'light', 0));
  for (const [level, step] of [
    [0.1, 1],
    [0.4, 3],
    [0.7, 5],
    [0.95, 6],
  ] as const) {
    const share = 1.25 - level / heat;
    if (share <= 0.05) continue;
    drawn.floor.push(floorMark('scorch', floor, spread * Math.min(1, share), 1, ramp[step], 0.85, 'light', seed));
  }
}

/** A shock ring racing out along the floor, thinning and fading over `lifeS` seconds. */
export function layShockRing(
  drawn: Staged,
  floor: Point,
  from: number,
  to: number,
  thick: number,
  color: string,
  t: number,
  lifeS: number
): void {
  const left = 1 - t / lifeS;
  if (t < 0 || left <= 0) return;
  const radius = from + (to - from) * (1 - left * left * left);
  const width = Math.max(thick * 0.25, thick * left + thick * 0.1) / radius;
  drawn.floor.push(floorMark('ring', floor, radius, width, color, Math.min(1, left * 1.6), 'light', 0));
}

/** A band of dust thrown out along the floor behind the shock, as far as `reach`, with a hot edge, over `lifeS` seconds. */
export function layDustBand(
  drawn: Staged,
  floor: Point,
  reach: number,
  thick: number,
  ramp: readonly string[],
  t: number,
  lifeS: number
): void {
  const band = t / lifeS;
  if (t < 0 || band >= 1) return;
  const radius = reach * outCubic(band);
  if (radius <= thick * 0.6) return;
  const width = Math.max(thick * 0.25, thick * (1 - band)) / radius;
  drawn.floor.push(floorMark('ring', floor, radius, width, DUST, Math.min(1, 1.15 - band) * 0.7, 'color', 0));
  drawn.floor.push(floorMark('ring', floor, radius * 0.97, width * 0.35, ramp[3], (1 - band) * 0.8, 'light', 0));
}

/** Balls of flame flung out every way and up from a heart, some turning to smoke. */
export function flungFire(
  th: Thrower,
  heart: Point,
  count: number,
  options: {
    speed?: readonly [number, number];
    from?: number;
    smokes?: number;
    bornAt?: readonly [number, number];
  } = {}
): FireBall[] {
  const U = th.cell;
  const [slow, fast] = options.speed ?? [0.8, 3.4];
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const from = th.range(0, options.from ?? 0.3) * U;
    const speed = th.range(slow, fast) * U;
    const smokes = th.chance(options.smokes ?? 0.45);
    const big = th.chance(0.3);
    const bornAt = options.bornAt ? th.range(options.bornAt[0], options.bornAt[1]) : 0;
    return {
      mote: th.mote({
        x: heart.x + way.cos * from,
        y: heart.y + way.sin * from,
        z: heart.z + th.range(-0.15, 0.2) * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(-0.2, 0.8) * speed * 0.6 + 1.7 * U,
        bornAt,
        life: th.lifeOf(bornAt, smokes ? 1.1 : 0.45, smokes ? 2 : 0.95),
        gravity: -th.range(1.6, 3) * U,
        drag: 3.2,
        bounce: 0,
      }),
      size: big ? th.range(0.55, 0.75) : th.range(0.22, 0.45),
      burns: smokes ? th.range(0.38, 0.5) : 1,
      variant: th.range(0, 6),
    };
  });
}

/** Sparks flying out from a heart, slowed, falling and bouncing off the floor. */
export function thrownSparks(
  th: Thrower,
  heart: Point,
  count: number,
  speed: readonly [number, number] = [5.8, 15.8],
  bornAt: readonly [number, number] = [0, 0.03]
): ThrownMote[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const fast = th.range(speed[0], speed[1]) * U;
    const born = th.range(bornAt[0], bornAt[1]);
    return th.mote({
      x: heart.x,
      y: heart.y,
      z: heart.z,
      vx: way.cos * fast,
      vy: way.sin * fast,
      vz: th.range(-0.35, 0.9) * fast + 2.9 * U,
      bornAt: born,
      life: th.lifeOf(born, 0.18, 0.6),
      gravity: th.fall,
      drag: 2,
      bounce: 0.4,
    });
  });
}

/** Embers drifting up from about a heart and dying. */
export function risingEmbers(
  th: Thrower,
  heart: Point,
  count: number,
  bornAt: readonly [number, number] = [0, 0.15],
  reach = 0.3
): ThrownMote[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const speed = th.range(1.25, 6.25) * U;
    const born = th.range(bornAt[0], bornAt[1]);
    return th.mote({
      x: heart.x + way.cos * reach * U,
      y: heart.y + way.sin * reach * U,
      z: heart.z,
      vx: way.cos * speed,
      vy: way.sin * speed,
      vz: th.range(0, 0.6) * speed + 3.1 * U,
      bornAt: born,
      life: th.lifeOf(born, 1.2, 2.6),
      gravity: -th.range(0.2, 0.8) * U,
      drag: 2.2,
      bounce: 0,
    });
  });
}

/** Burning brands arcing out from a heart, to land and burn on. */
export function thrownBrands(
  th: Thrower,
  heart: Point,
  count: number,
  speed: readonly [number, number] = [3, 6]
): Brand[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const fast = th.range(speed[0], speed[1]) * U;
    return {
      mote: th.mote({
        x: heart.x,
        y: heart.y,
        z: heart.z,
        vx: way.cos * fast,
        vy: way.sin * fast,
        vz: th.range(4, 8) * U,
        bornAt: 0.05,
        life: th.lifeOf(0, 1.6, 2.4),
        gravity: th.fall,
        drag: 0.6,
        bounce: 0,
      }),
      power: th.range(0.55, 0.85),
    };
  });
}

/** Smoke billowing out of a heart a moment after it goes off, rising slowly. */
export function billowingSmoke(
  th: Thrower,
  heart: Point,
  count: number,
  options: {
    spread?: number;
    size?: readonly [number, number];
    rise?: readonly [number, number];
    bornAt?: readonly [number, number];
    life?: readonly [number, number];
  } = {}
): Cloud[] {
  const U = th.cell;
  const [small, large] = options.size ?? [0.6, 1];
  const [slow, fast] = options.rise ?? [0.6, 1.4];
  const [early, late] = options.bornAt ?? [0.12, 0.45];
  const [short, long] = options.life ?? [1.8, 2.8];
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const from = th.range(0, options.spread ?? 0.53) * U;
    const speed = th.range(0.3, 1.5) * U;
    const bornAt = th.range(early, late);
    return {
      mote: th.mote({
        x: heart.x + way.cos * from,
        y: heart.y + way.sin * from,
        z: heart.z + th.range(0, 0.3) * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(slow, fast) * U,
        bornAt,
        life: th.lifeOf(bornAt, short, long),
        gravity: -th.range(0.15, 0.35) * U,
        drag: 1.6,
        bounce: 0,
      }),
      size: th.range(small, large),
      color: SMOKE,
      alpha: 0.7,
    };
  });
}

/** Plumes of smoke rising from about a heart as a column, slowing as they climb and drifting apart. */
export function risingPlumes(
  th: Thrower,
  heart: Point,
  count: number,
  bornAt: readonly [number, number],
  rise: readonly [number, number],
  length: number,
  size: readonly [number, number] = [0.7, 1]
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const born = th.range(bornAt[0], bornAt[1]);
    return {
      mote: th.mote({
        x: heart.x + way.cos * th.range(0, 0.4) * U,
        y: heart.y + way.sin * th.range(0, 0.4) * U,
        z: heart.z + th.range(0, 0.4) * U,
        vx: way.cos * th.range(0.1, 0.4) * U,
        vy: way.sin * th.range(0.1, 0.4) * U,
        vz: th.range(rise[0], rise[1]) * U,
        bornAt: born,
        life: th.lifeOf(born, 2, 3),
        gravity: -0.15 * U,
        drag: 0.5,
        bounce: 0,
      }),
      size: th.range(size[0], size[1]),
      color: SMOKE,
      alpha: 0.6,
      plume: length,
    };
  });
}

/** Dust rolling out along the floor from about a foot. */
export function rollingDust(
  th: Thrower,
  foot: Point,
  count: number,
  speed: readonly [number, number] = [2.25, 7.1],
  size: readonly [number, number] = [0.5, 0.75]
): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const from = th.range(0, 0.45) * U;
    const fast = th.range(speed[0], speed[1]) * U;
    const bornAt = th.range(0, 0.06);
    return {
      mote: th.mote({
        x: foot.x + way.cos * from,
        y: foot.y + way.sin * from,
        z: th.floorZ + th.range(0.04, 0.2) * U,
        vx: way.cos * fast,
        vy: way.sin * fast,
        vz: th.range(0.05, 0.6) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.1, 2),
        gravity: -0.15 * U,
        drag: 2.8,
        bounce: 0,
      }),
      size: th.range(size[0], size[1]),
      color: DUST,
      alpha: 0.35,
    };
  });
}

/** A column of dust thrown up from the floor about a foot. */
export function dustColumn(th: Thrower, foot: Point, count: number): Cloud[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const bornAt = th.range(0, 0.15);
    return {
      mote: th.mote({
        x: foot.x + th.range(-0.22, 0.22) * U,
        y: foot.y + th.range(-0.22, 0.22) * U,
        z: th.floorZ + th.range(0.05, 0.45) * U,
        vx: th.range(-0.6, 0.6) * U,
        vy: th.range(-0.6, 0.6) * U,
        vz: th.range(2, 5) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1.6, 2.6),
        gravity: -0.2 * U,
        drag: 2.2,
        bounce: 0,
      }),
      size: th.range(0.6, 0.95),
      color: DUST,
      alpha: 0.3,
    };
  });
}

/** Rocks thrown up from the floor about a foot, tumbling, bouncing and settling. */
export function thrownRocks(th: Thrower, foot: Point, count: number, rise: readonly [number, number] = [3, 6]): Bit[] {
  const U = th.cell;
  return Array.from({ length: count }, () => {
    const way = th.outward();
    const speed = th.range(0.4, 2.2) * U;
    return {
      mote: th.mote({
        x: foot.x + th.range(-0.3, 0.3) * U,
        y: foot.y + th.range(-0.3, 0.3) * U,
        z: th.floorZ + 0.05 * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(rise[0], rise[1]) * U,
        bornAt: th.range(0.04, 0.1),
        life: th.lifeOf(0.1, 1.8, 2.6),
        gravity: th.fall,
        drag: 0.4,
        bounce: 0.3,
      }),
      size: th.range(0.08, 0.16),
      color: STONE,
      turnRate: th.range(-16, 16),
      variant: th.range(0, 6),
    };
  });
}

/** Grit thrown up from the floor about a foot in a cone, the steepest the fastest. */
export function thrownGrit(
  th: Thrower,
  foot: Point,
  count: number,
  speed: readonly [number, number] = [2.5, 7]
): Bit[] {
  const U = th.cell;
  const stones = [mixColor(STONE, '#ffffff', 0.25), STONE, STONE, mixColor(STONE, '#000000', 0.35)];
  return Array.from({ length: count }, (_unused, index) => {
    const lean = th.range(-1, 1);
    const way = th.outward();
    const fast = th.range(speed[0], speed[1]) * U * (1 - 0.45 * Math.abs(lean));
    const across = Math.sin(Math.abs(lean) * 0.5);
    return {
      mote: th.mote({
        x: foot.x + way.cos * Math.abs(lean) * 0.19 * U,
        y: foot.y + way.sin * Math.abs(lean) * 0.19 * U,
        z: th.floorZ + 0.04 * U,
        vx: way.cos * across * fast,
        vy: way.sin * across * fast,
        vz: Math.cos(lean * 0.5) * fast,
        bornAt: th.range(0.04, 0.1),
        life: th.lifeOf(0.1, 1.2, 2.2),
        gravity: th.fall,
        drag: 0.6,
        bounce: 0.25,
      }),
      size: th.chance(0.45) ? 0.075 : 0.045,
      color: stones[index % stones.length],
      turnRate: th.range(-12, 12),
      variant: th.range(0, 6),
    };
  });
}
