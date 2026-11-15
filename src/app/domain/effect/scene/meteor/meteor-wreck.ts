import { outCubic, type Staged, within } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { layBillows, layFlames, thrownFireAt } from '@axe/domain/effect/scene/fire/fire-body';
import {
  type Bit,
  type Cloud,
  drawBit,
  drawCloud,
  DUST,
  type FireBall,
  SMOKE,
  STONE,
  WARM,
} from '@axe/domain/effect/scene/fire/fire-parts';
import type { MeteorFall } from '@axe/domain/effect/scene/meteor/meteor-fall';
import { fireTongue } from '@axe/domain/effect/scene/meteor/meteor-rock';
import { ball, floorMark, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * What a meteor leaves where it strikes, over and above the look it lands with: a crater, molten
 * at once and cooling from its edge in to soot, cracked about and rimmed with clods of earth; pieces
 * of rock and grit thrown out of it, most of them on along the way the meteor was flying; fire
 * thrown on and up the same way; and dust running out low to either side of its way.
 *
 * Every length is in cells of the effect and every moment in seconds from the landing.
 */

/** How far the crater reaches from its middle, in cells. */
export const CRATER_CELLS = 0.95;
/** How long a crater takes to cool from molten to soot at the most, in seconds. */
const CRATER_COOLS_S = 2.6;
/** The share of what is thrown out that goes on the way the meteor was flying, and how far to either side of it, in radians. */
export const THROWN_ONWARD = 0.75;
const ONWARD_SPREAD = 0.6;
/** How many of each a meteor of the middle grade throws out as it strikes. */
export const METEOR_THROWS = { rocks: 18, grit: 28, dust: 9, fire: 6 } as const;
/** The earth of the clods about the crater's rim. */
const EARTH = '#3a2c25';
/** How many clods stand about the rim. */
const CLODS = 9;

/** A clod of earth on the crater's rim: where it lies and how wide it is, in table pixels. */
interface Clod {
  readonly x: number;
  readonly y: number;
  readonly size: number;
  readonly variant: number;
}

/** All a meteor throws out as it strikes. */
export interface MeteorWreck {
  readonly bits: readonly Bit[];
  readonly clouds: readonly Cloud[];
  readonly fire: readonly FireBall[];
  readonly clods: readonly Clod[];
}

/**
 * Throws all a meteor throws out as it strikes, `thin` of what one alone throws; a meteor that is
 * not `whole`, one of a volley, raises no clods.
 */
export function throwWreck(th: Thrower, fall: MeteorFall, thin: number, whole: boolean): MeteorWreck {
  const U = fall.unit;
  const { floor, across } = fall;
  const onward = Math.atan2(across.y, across.x);
  /** A way out over the floor: on the way the meteor was flying for most, any way for the rest. */
  const thrownWay = () => {
    const angle = th.chance(THROWN_ONWARD)
      ? onward + th.range(-ONWARD_SPREAD, ONWARD_SPREAD)
      : th.range(0, Math.PI * 2);
    return { cos: Math.cos(angle), sin: Math.sin(angle) };
  };
  const stones = [mixColor(STONE, '#ffffff', 0.2), STONE, mixColor(STONE, '#000000', 0.35)];

  const rocks = Array.from({ length: th.count(METEOR_THROWS.rocks * thin) }, (_unused, index): Bit => {
    const way = thrownWay();
    const speed = th.range(1.5, 4.5) * U;
    return {
      mote: th.mote({
        x: floor.x + th.range(-0.3, 0.3) * U,
        y: floor.y + th.range(-0.3, 0.3) * U,
        z: floor.z + 0.05 * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(3, 7) * U,
        bornAt: th.range(0.02, 0.08),
        life: th.lifeOf(0.1, 1.3, 1.9),
        gravity: th.fall,
        drag: 0.4,
        bounce: 0.3,
      }),
      size: th.range(0.12, 0.3),
      color: stones[index % stones.length],
      turnRate: th.range(-16, 16),
      variant: th.range(0, 6),
    };
  });
  const grit = Array.from({ length: th.count(METEOR_THROWS.grit * thin) }, (_unused, index): Bit => {
    const way = thrownWay();
    const speed = th.range(2, 5.5) * U;
    return {
      mote: th.mote({
        x: floor.x + way.cos * th.range(0, 0.25) * U,
        y: floor.y + way.sin * th.range(0, 0.25) * U,
        z: floor.z + 0.04 * U,
        vx: way.cos * speed,
        vy: way.sin * speed,
        vz: th.range(2, 6.5) * U,
        bornAt: th.range(0.02, 0.08),
        life: th.lifeOf(0.1, 1, 1.7),
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
  const clouds = Array.from({ length: th.count(METEOR_THROWS.dust * thin) }, (_unused, index): Cloud => {
    const sideways = onward + (index % 2 === 0 ? 1 : -1) * (Math.PI / 2 + th.range(-0.35, 0.1));
    const speed = th.range(3.5, 7.5) * U;
    const carried = th.range(0, 1.5) * U;
    const bornAt = th.range(0, 0.06);
    return {
      mote: th.mote({
        x: floor.x + Math.cos(sideways) * th.range(0.1, 0.5) * U,
        y: floor.y + Math.sin(sideways) * th.range(0.1, 0.5) * U,
        z: floor.z + th.range(0.05, 0.2) * U,
        vx: Math.cos(sideways) * speed + across.x * carried,
        vy: Math.sin(sideways) * speed + across.y * carried,
        vz: th.range(0.05, 0.5) * U,
        bornAt,
        life: th.lifeOf(bornAt, 1, 1.7),
        gravity: -0.15 * U,
        drag: 2.8,
        bounce: 0,
      }),
      size: th.range(0.55, 0.85),
      color: DUST,
      alpha: 0.42,
    };
  });
  const fire = Array.from({ length: th.count(METEOR_THROWS.fire * thin) }, (): FireBall => {
    const angle = onward + th.range(-0.4, 0.4);
    const speed = th.range(2.5, 5) * U;
    const smokes = th.chance(0.5);
    return {
      mote: th.mote({
        x: floor.x,
        y: floor.y,
        z: floor.z + th.range(0.15, 0.4) * U,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        vz: th.range(2.5, 5) * U,
        bornAt: 0,
        life: th.lifeOf(0, smokes ? 1 : 0.45, smokes ? 1.7 : 0.9),
        gravity: -2 * U,
        drag: 3.2,
        bounce: 0,
      }),
      size: th.range(0.3, 0.6),
      burns: smokes ? th.range(0.4, 0.5) : 1,
      variant: th.range(0, 6),
    };
  });
  const clods = whole
    ? Array.from({ length: CLODS }, (_unused, index): Clod => {
        const round = (index / CLODS) * Math.PI * 2 + th.range(-0.25, 0.25);
        const out = th.range(0.78, 1) * CRATER_CELLS * U;
        return {
          x: floor.x + Math.cos(round) * out,
          y: floor.y + Math.sin(round) * out,
          size: th.range(0.12, 0.22) * U,
          variant: th.range(0, 6),
        };
      })
    : [];
  return { bits: [...rocks, ...grit], clouds, fire, clods };
}

/** How hot a crater still is some time after the meteor struck, from 1 molten to 0 soot, cooled by the time what it left clears. */
export function craterHeatAt(since: number, ends: number): number {
  const cools = Math.max(0.2, Math.min(CRATER_COOLS_S, ends - 0.45));
  return Math.pow(Math.max(0, 1 - since / cools), 1.4);
}

/**
 * The crater a meteor leaves at a moment after it struck, laid on the floor: soot under all, a dark
 * rim, and while it is hot, light pooled about it, the molten floor in steps that draw in from its
 * edge as it cools, and cracks glowing out past its rim. One of a volley leaves the soot and the
 * last of the molten floor alone.
 */
export function layCrater(
  drawn: Staged,
  fall: MeteorFall,
  ramp: readonly string[],
  since: number,
  ends: number,
  whole: boolean,
  seed: number
): void {
  const U = fall.unit;
  const { floor } = fall;
  const clearing = 1 - within(since, ends - 0.5, ends);
  const reach = CRATER_CELLS * U * Math.min(1, 0.4 + since / 0.06);
  const heat = craterHeatAt(since, ends);
  drawn.floor.push(floorMark('scorch', floor, reach, 1, SMOKE, 0.6 * clearing, 'color', seed));
  if (whole) drawn.floor.push(floorMark('ring', floor, reach * 0.92, 0.16, EARTH, 0.55 * clearing, 'color', 0));
  if (heat <= 0) return;
  const steps = whole
    ? ([
        [0.1, 1],
        [0.45, 2],
        [0.8, 4],
      ] as const)
    : ([[0.3, 2]] as const);
  for (const [level, step] of steps) {
    const share = 1.25 - level / heat;
    if (share <= 0.05) continue;
    drawn.floor.push(floorMark('scorch', floor, reach * Math.min(1, share), 1, ramp[step], 0.85, 'light', seed));
  }
  if (!whole) return;
  drawn.floor.push(floorMark('disc', floor, reach * 2.6, 1, WARM, 0.3 * heat, 'light', 0));
  drawn.floor.push(floorMark('cracks', floor, reach * 1.6, 0.5, ramp[2], 0.8 * heat, 'light', seed));
}

/** Draws all a meteor threw out at a moment after it struck: the clods on its rim, its dust, its rock and grit, and its fire. */
export function drawWreck(
  drawn: Staged,
  wreck: MeteorWreck,
  fall: MeteorFall,
  ramp: readonly string[],
  since: number,
  ends: number,
  forward: number
): void {
  const U = fall.unit;
  const clearing = 1 - within(since, ends - 0.5, ends);
  const risen = Math.min(1, since / 0.08);
  for (const clod of wreck.clods) {
    const at = { x: clod.x, y: clod.y, z: fall.floor.z + clod.size * 0.3 * risen };
    drawn.motes.push({
      ...ball(at, clod.size * risen, EARTH, clearing, U * 0.05, clod.variant),
      shape: 'chunk',
      spin: clod.variant,
    });
  }
  for (const cloud of wreck.clouds) drawCloud(drawn, cloud, since, U, forward);
  for (const bit of wreck.bits) drawBit(drawn, bit, since, U, ramp, forward);
  const thrown = thrownFireAt(wreck.fire, since, U);
  layBillows(drawn, thrown.billows, ramp, true, { forward });
  layFlames(drawn, thrown.flames, ramp, { forward });
}

/** How long the fire of the landing takes to rise, when it begins to burn out and when it has, and when its smoke has cleared, in seconds from the landing. */
const FIREBALL_RISES_S = 0.4;
const FIREBALL_BURNS_S = [0.35, 0.95] as const;
const FIREBALL_SMOKE_S = [0.3, 1.7] as const;
/**
 * The columns the fire of the landing rises in, in cells: how far to one side of where it struck and
 * how far on along the way the meteor was flying each is rooted, how wide and how tall it is, and how
 * far it leans on the way the meteor was flying.
 */
const FIREBALL_COLUMNS = [
  { aside: 0, on: 0.15, wide: 1.7, tall: 3.3, leans: 0.25 },
  { aside: -0.6, on: 0.45, wide: 1.1, tall: 2.1, leans: 0.45 },
  { aside: 0.6, on: 0.4, wide: 1.1, tall: 1.9, leans: 0.4 },
] as const;
/** The sheets the fire is laid in, the deepest first: how wide and tall each is as shares of its column, and the step of the ramp it starts at. */
const FIREBALL_SHEETS = [
  { wide: 1, tall: 1, step: 1 },
  { wide: 0.8, tall: 0.9, step: 2 },
  { wide: 0.6, tall: 0.76, step: 3 },
  { wide: 0.42, tall: 0.6, step: 4 },
  { wide: 0.26, tall: 0.42, step: 5 },
] as const;
/** How many steps down the ramp the fire cools as it burns out. */
const FIREBALL_COOLS_STEPS = 3.4;

/** How long the fire of a meteor's landing is seen for, smoke and all, in seconds from the landing. */
export const METEOR_FIREBALL_S = FIREBALL_SMOKE_S[1];

/**
 * The fire of the landing at a moment after the meteor struck: columns of flame shooting up out of
 * the crater, the tallest over where it struck and one to each side leaning on the way the meteor
 * was flying, each laid in sheets from a deep red in to a white heart; as it burns out every sheet
 * cools down the ramp together and the fire narrows, and the last of it turns to smoke that swells
 * and rises away. One of a volley raises the tallest column alone.
 */
export function drawFireball(
  drawn: Staged,
  fall: MeteorFall,
  ramp: readonly string[],
  since: number,
  whole: boolean,
  seed: number,
  forward: number
): void {
  if (since < 0 || since >= FIREBALL_SMOKE_S[1]) return;
  const U = fall.unit;
  const { floor, across } = fall;
  const risen = outCubic(within(since, 0, FIREBALL_RISES_S));
  const burnt = within(since, FIREBALL_BURNS_S[0], FIREBALL_BURNS_S[1]);
  const smoked = within(since, FIREBALL_SMOKE_S[0], FIREBALL_SMOKE_S[1]);
  const columns = whole ? FIREBALL_COLUMNS : FIREBALL_COLUMNS.slice(0, 1);
  const placed = columns.map((column, index) => {
    const lean = { x: across.x * column.leans, y: across.y * column.leans, z: 1 };
    const far = Math.hypot(lean.x, lean.y, lean.z);
    return {
      column,
      index,
      way: { x: lean.x / far, y: lean.y / far, z: lean.z / far },
      root: {
        x: floor.x + across.x * column.on * U - across.y * column.aside * U,
        y: floor.y + across.y * column.on * U + across.x * column.aside * U,
        z: floor.z + U * 0.05,
      },
    };
  });
  if (smoked > 0) {
    const alpha = Math.min(within(smoked, 0, 0.2), 1 - smoked) * 0.62;
    for (const { column, index, way, root } of placed) {
      const lifted = { ...root, z: root.z + U * (0.4 + 1.6 * smoked) };
      const wide = U * column.wide * (0.9 + 0.6 * smoked);
      const tall = U * column.tall * (0.8 + 0.4 * smoked);
      const flowed = since * 1.6 + index * 3.1 + (seed % 11);
      drawn.motes.push({
        ...fireTongue(
          lifted,
          way,
          wide,
          tall,
          flowed,
          mixColor(SMOKE, ramp[0], 0.25),
          undefined,
          alpha,
          forward,
          seed + index
        ),
        shape: 'wisp',
      });
    }
  }
  if (burnt >= 1) return;
  const cooled = Math.floor(burnt * FIREBALL_COOLS_STEPS);
  const dying = 1 - within(burnt, 0.7, 1);
  FIREBALL_SHEETS.forEach((sheet, order) => {
    const step = sheet.step - cooled;
    if (step < 1) return;
    const color = order === 0 ? mixColor(ramp[1], SMOKE, 0.5 * burnt) : ramp[step];
    const heart = order === FIREBALL_SHEETS.length - 1 && cooled === 0 ? '#ffffff' : undefined;
    for (const { column, index, way, root } of placed) {
      const wide = U * column.wide * sheet.wide * (0.55 + 0.45 * risen) * (1 - 0.3 * burnt);
      const tall = U * column.tall * sheet.tall * (0.2 + 0.8 * risen) * (1 + 0.25 * burnt);
      const flowed = since * 6 + index * 3.1 + (seed % 11);
      drawn.motes.push(fireTongue(root, way, wide, tall, flowed, color, heart, dying, forward, seed + index));
    }
  });
}
