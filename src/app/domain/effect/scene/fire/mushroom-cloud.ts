import { outCubic, within } from '@axe/domain/effect/scene/choreography';
import { type Billow, type Flame } from '@axe/domain/effect/scene/fire/fire-body';
import { type Point, type Thrower } from '@axe/domain/effect/scene/parts';

/*
 * The cloud of the greatest blast: a stem of fire roaring up out of the ground, and at its top a cap
 * that rolls. The stem is tongues of flame of every height standing together, white-hot at first and
 * reddening as it burns, narrowing as it breaks; flames break off the tips of its crown one after
 * another and rise burning over it, so that it ends in licking tongues and never in an edge. The cap
 * is a dome of fire over a ring of lobes that turn over and over, up through the middle and out and
 * down round the edge, the ring widening as it rolls; it cools from white through orange to a deep
 * red, the lobes on the underside first, and what is left of it is smoke, still red within for a
 * while, that climbs, breaks apart, spreads and thins away.
 *
 * Every length is in cells of the effect and every moment in seconds from the moment the blast goes off.
 */

/** How long the stem stands, in seconds. */
export const STEM_S = 2.1;
/** When the cap begins to roll out, and how long it rolls before it has cleared, in seconds. */
const CAP_FROM_S = 0.4;
const CAP_S = 4;
/** How high the cap rolls, in cells over the floor. */
export const CAP_HEIGHT = 3;
/** The share of its rolling over which the cap burns before it is all smoke. */
const CAP_BURNS = 0.36;
/** How many tongues the stem is made of, and how many flames break off its crown at once. */
const STEM_TONGUES = 8;
const CROWN_FLAMES = 12;
/** How long a flame broken off the crown burns as it rises, in seconds, and how fast it rises, in cells a second. */
const CROWN_BURNS_S = 0.6;
const CROWN_RISES = 2.6;
/** How far the smoke the cap leaves climbs as it rolls, in cells, and how far apart its lobes drift in height. */
const SMOKE_CLIMBS = 2.4;
const SMOKE_BREAKS = 1.6;

/** One tongue of the stem: where about the foot it is rooted, how wide and how tall, and how it sways. */
interface StemTongue {
  readonly angle: number;
  readonly out: number;
  readonly wide: number;
  readonly tall: number;
  readonly phase: number;
  readonly variant: number;
}

/** One lobe of the cap: where round the ring it sits, where round the roll it starts, and how large it is. */
interface CapLobe {
  readonly around: number;
  readonly roll: number;
  readonly size: number;
  readonly variant: number;
}

/** The cloud as it was thrown. */
export interface MushroomCloud {
  readonly stem: readonly StemTongue[];
  readonly cap: readonly CapLobe[];
}

/** Throws the cloud: the tongues of its stem and the lobes of its cap. */
export function throwCloud(th: Thrower): MushroomCloud {
  const stem = Array.from({ length: STEM_TONGUES }, (_unused, index): StemTongue => ({
    angle: ((index + th.range(-0.3, 0.3)) / STEM_TONGUES) * Math.PI * 2,
    out: index === 0 ? 0 : th.range(0.25, 0.5),
    wide: index === 0 ? 1.15 : th.range(0.55, 0.9),
    tall: index === 0 ? 1.22 : index % 2 === 0 ? th.range(0.95, 1.12) : th.range(0.55, 0.85),
    phase: th.range(0, 6.3),
    variant: th.range(0, 6),
  }));
  const lobes = 10;
  const cap = Array.from({ length: lobes }, (_unused, index): CapLobe => ({
    around: ((index + th.range(-0.3, 0.3)) / lobes) * Math.PI * 2,
    roll: th.range(0, Math.PI * 2),
    size: th.range(0.95, 1.35),
    variant: th.range(0, 6),
  }));
  return { stem, cap };
}

/** How much of the stem stands at a moment, from nothing as it shoots up to whole, and back to nothing as it breaks. */
function stemStanding(t: number): number {
  return Math.min(outCubic(within(t, 0, 0.5)), 1 - within(t, STEM_S * 0.7, STEM_S + 0.4));
}

/** The stem at a moment, as flames to be laid as one fire. */
export function stemAt(cloud: MushroomCloud, floor: Point, cell: number, t: number, seed: number): Flame[] {
  const standing = stemStanding(t);
  if (standing <= 0.02) return [];
  const breaking = within(t, STEM_S * 0.6, STEM_S + 0.4);
  const flicker = 0.93 + 0.05 * Math.sin(t * 19 + seed) + 0.03 * Math.sin(t * 41 + seed * 1.3);
  const heat = 0.85 - 0.6 * within(t, 0.2, STEM_S);
  return cloud.stem.map((tongue): Flame => {
    const sway = 0.06 * Math.sin(t * 3.1 + tongue.phase);
    const wide = cell * tongue.wide * (1 - 0.55 * breaking) * (0.6 + 0.4 * standing);
    return {
      shape: 'lick',
      at: {
        x: floor.x + Math.cos(tongue.angle) * tongue.out * cell,
        y: floor.y + Math.sin(tongue.angle) * tongue.out * cell,
        z: floor.z + cell * 0.02,
      },
      heading: {
        x: sway - Math.cos(tongue.angle) * tongue.out * 0.12,
        y: -Math.sin(tongue.angle) * tongue.out * 0.12,
        z: 1,
      },
      wide,
      long: Math.max(wide, cell * CAP_HEIGHT * tongue.tall * flicker * (0.3 + 0.7 * standing)),
      heat: heat * (tongue.out === 0 ? 1 : 0.85),
      flowed: t * 5.5 + tongue.variant * 7,
      variant: tongue.variant,
      alpha: Math.min(1, standing * 2),
    };
  });
}

/** The cap at a moment: its fire, and the smoke it turns to. */
export function capAt(
  cloud: MushroomCloud,
  floor: Point,
  cell: number,
  t: number
): { readonly flames: Flame[]; readonly billows: Billow[] } {
  const flames: Flame[] = [];
  const billows: Billow[] = [];
  const rolled = within(t, CAP_FROM_S, CAP_FROM_S + CAP_S);
  if (rolled <= 0 || rolled >= 1) return { flames, billows };
  const spread = outCubic(within(rolled, 0, 0.7));
  const ring = cell * (0.4 + spread * 1.35);
  const tube = cell * (0.42 + rolled * 0.4);
  const climbs = within(rolled, CAP_BURNS * 0.5, 1);
  const height = floor.z + cell * (CAP_HEIGHT * Math.min(1, rolled * 3.4) + rolled * 0.5 + SMOKE_CLIMBS * climbs);
  const burning = 1 - within(rolled, 0.015, CAP_BURNS);
  const smoked = within(rolled, CAP_BURNS * 0.45, 1);
  const smokeAlpha = Math.min(within(smoked, 0, 0.15), within(1 - smoked, 0, 0.45)) * 0.84;
  const warm = 1 - within(rolled, CAP_BURNS * 0.5, CAP_BURNS * 1.5);
  const add = (middle: Point, heading: Point, size: number, heat: number, variant: number, flows: number): void => {
    const wide = cell * size * (0.55 + 0.45 * Math.min(1, rolled * 6) + rolled * 0.7);
    if (heat > 0) {
      flames.push({
        shape: 'blaze',
        at: middle,
        heading,
        wide,
        long: wide * 1.15,
        heat,
        flowed: t * flows + variant * 7,
        variant,
      });
    }
    if (smokeAlpha > 0.01) {
      billows.push({
        at: middle,
        heading: { x: heading.x * 0.4, y: heading.y * 0.4, z: 1 },
        wide: wide * 1.08,
        long: wide * 1.2,
        alpha: smokeAlpha,
        flowed: t * 0.8 + variant * 3,
        variant: variant + 2.1,
        warm,
      });
    }
  };
  for (const lobe of cloud.cap) {
    const roll = lobe.roll - rolled * Math.PI * 2 * 1.3;
    const out = ring + Math.cos(roll) * tube * 0.5;
    const outward = { x: Math.cos(lobe.around), y: Math.sin(lobe.around) };
    const breaks = cell * SMOKE_BREAKS * climbs * (lobe.size - 1.15) * 3;
    const middle = {
      x: floor.x + outward.x * out,
      y: floor.y + outward.y * out,
      z: height + Math.sin(roll) * tube * 0.55 + breaks,
    };
    const heading = { x: outward.x * Math.sin(roll), y: outward.y * Math.sin(roll), z: -Math.cos(roll) + 0.35 };
    add(middle, heading, lobe.size, burning * (0.72 + 0.28 * Math.sin(roll)), lobe.variant, 2.6);
  }
  const crown = { x: floor.x, y: floor.y, z: height + tube * 0.45 };
  add(crown, { x: 0, y: 0, z: 1 }, 1.75, Math.min(1, burning * 1.15), 3.3, 2.2);
  return { flames, billows };
}

/**
 * The crown of the stem at a moment: flames broken off the tips of its tongues one after another, each
 * rising over the stem as it narrows and reddens until it is out, so that the stem ends in licking
 * tongues and never in an edge.
 */
export function crownAt(cloud: MushroomCloud, floor: Point, cell: number, t: number, seed: number): Flame[] {
  const standing = stemStanding(t);
  if (standing <= 0.1) return [];
  const flames: Flame[] = [];
  const heat = 0.85 - 0.6 * within(t, 0.2, STEM_S);
  for (let index = 0; index < CROWN_FLAMES; index++) {
    const tongue = cloud.stem[index % cloud.stem.length];
    const phase = (index * 0.618 + seed * 0.13) % 1;
    const age = ((t / CROWN_BURNS_S + phase) % 1) * CROWN_BURNS_S;
    const share = age / CROWN_BURNS_S;
    const tip = cell * CAP_HEIGHT * tongue.tall * (0.3 + 0.7 * standing) * 0.82;
    const wide = cell * tongue.wide * 0.42 * (1 - 0.6 * share) * standing;
    const sway = Math.sin(t * 4 + tongue.phase + index) * cell * 0.25 * share;
    flames.push({
      shape: 'lick',
      at: {
        x: floor.x + Math.cos(tongue.angle) * tongue.out * cell * (1 + share) + sway,
        y: floor.y + Math.sin(tongue.angle) * tongue.out * cell * (1 + share),
        z: floor.z + tip + cell * CROWN_RISES * age,
      },
      heading: { x: 0.2 * Math.sin(t * 6 + index), y: 0, z: 1 },
      wide,
      long: wide * (2.6 - share),
      heat: heat * (1 - 0.75 * share),
      flowed: t * 6 + index * 2.3,
      variant: tongue.variant + index,
      alpha: Math.min(1, share * 10) * (1 - share * share),
    });
  }
  return flames;
}
