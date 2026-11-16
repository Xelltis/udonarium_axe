import { type Staged } from '@axe/domain/effect/scene/choreography';
import { mixColor } from '@axe/domain/effect/scene/effect-ramp';
import { type EffectMote } from '@axe/domain/effect/scene/effect-scene';
import { moteAt } from '@axe/domain/effect/scene/effect-sim';
import { type Cloud, type FireBall, SMOKE } from '@axe/domain/effect/scene/fire/fire-parts';
import { hueOf, type Point } from '@axe/domain/effect/scene/parts';

/*
 * The body of a fire, as every look of fire draws it: flames laid in sheets, the widest and deepest
 * red first and the hottest last, every flame's rim before any flame's body, so that many flames run
 * together into one fire edged in red, orange within, gold further in, pale at its heart and white
 * there only while it is at its hottest, rather than each standing out ringed in its own colours.
 * A flame is a lick, torn into shreds towards its tip, or a blaze, a ball of fire whose edge rolls.
 * As a flame cools it loses its sheets from the heart out, until only its rim is left, darkening;
 * what it leaves is smoke, drawn behind the fire as billows.
 *
 * Every length here is in table pixels.
 */

/** One flame at a moment. */
export interface Flame {
  readonly shape: 'lick' | 'blaze';
  /** The root of a lick, or the middle of a blaze. */
  readonly at: Point;
  /** The way a lick reaches from its root, or the way the pattern of a blaze rolls. */
  readonly heading: Point;
  readonly wide: number;
  /** How far a lick reaches from its root, or how long a blaze is drawn out; no shorter than it is wide. */
  readonly long: number;
  /** How hot it is, from 1 at its hottest, white at the heart, to 0 as the last of its rim goes out. */
  readonly heat: number;
  /** How far its pattern has run. */
  readonly flowed: number;
  readonly variant: number;
  /** How much of it is seen, all of it without. */
  readonly alpha?: number;
}

/** A billow of smoke at a moment. */
export interface Billow {
  readonly at: Point;
  readonly heading: Point;
  readonly wide: number;
  readonly long: number;
  readonly alpha: number;
  readonly flowed: number;
  readonly variant: number;
  /** How much of the fire's glow is still in it, from 1 just out of the fire to 0 gone cold. */
  readonly warm?: number;
}

/** How what is drawn of a fire is set in depth: how far nearer the eye, and whether held to that and no more. */
export interface FireDepth {
  readonly forward: number;
  /** Whether a piece standing before a flame hides it: for a fire that stands about a piece, on every side of it. */
  readonly exact?: boolean;
}

/**
 * The sheets a flame is laid in, the coolest and widest first: how hot a flame must be to have the
 * sheet, how wide and how long the sheet is as shares of the flame, the step of the ramp it is and
 * the step its middle is taken to.
 */
const SHEETS = [
  { needs: 0, wide: 1, long: 1, step: 1, core: 1 },
  { needs: 0.18, wide: 0.82, long: 0.9, step: 2, core: 3 },
  { needs: 0.5, wide: 0.54, long: 0.72, step: 3, core: 4 },
] as const;
/** The grey of ash, which soot is taken towards so that the light on a billow of it can be seen. */
const ASH = '#7d6c6a';
/** How far the rim of a flame is taken from the fire's dark colour towards its deepest. */
const RIM_DEEPER = 0.3;
/** How hot a flame must be for its heart to be white. */
const WHITE_HOT = 0.82;
/** How far the hotter sheets of a blaze are set on the way it rolls, as a share of its width, a sheet. */
const BLAZE_LEADS = 0.07;

/** How many sheets a fire is laid in. */
export const FIRE_SHEETS = SHEETS.length;

function unit(way: Point): Point {
  const length = Math.hypot(way.x, way.y, way.z) || 1;
  return { x: way.x / length, y: way.y / length, z: way.z / length };
}

/**
 * A round shape that flows, a blaze or a billow, its middle at a point, `wide` across and `long`
 * the way it is headed, its pattern run along it as far as `flowed`.
 */
export function roundMote(
  shape: 'blaze' | 'billow',
  middle: Point,
  heading: Point,
  wide: number,
  long: number,
  flowed: number,
  paint: { readonly color: string; readonly core?: string; readonly alpha: number; readonly variant: number },
  depth: FireDepth
): EffectMote {
  const way = unit(heading);
  const reach = Math.max(long, wide + 0.5);
  return {
    x: middle.x + way.x * reach * 0.5,
    y: middle.y + way.y * reach * 0.5,
    z: middle.z + way.z * reach * 0.5,
    size: wide,
    color: paint.color,
    core: paint.core,
    alpha: Math.max(0, paint.alpha),
    blend: 'color',
    shape,
    velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
    trail: (reach - wide) / 100,
    spin: flowed,
    variant: paint.variant,
    forward: depth.forward,
    exactDepth: depth.exact,
  };
}

/** A lick of flame from its root, `wide` at its widest and reaching `long` the way it is headed. */
function lickMote(
  root: Point,
  heading: Point,
  wide: number,
  long: number,
  flowed: number,
  paint: { readonly color: string; readonly core?: string; readonly alpha: number; readonly variant: number },
  depth: FireDepth
): EffectMote {
  const way = unit(heading);
  const reach = Math.max(long, wide + 0.5);
  return {
    x: root.x + way.x * reach,
    y: root.y + way.y * reach,
    z: root.z + way.z * reach,
    size: wide,
    color: paint.color,
    core: paint.core,
    alpha: Math.max(0, paint.alpha),
    blend: 'color',
    shape: 'lick',
    velocity: { x: way.x * 100, y: way.y * 100, z: way.z * 100 },
    trail: (reach - wide) / 100,
    spin: flowed,
    variant: paint.variant,
    forward: depth.forward,
    exactDepth: depth.exact,
  };
}

/**
 * Lays flames as one fire, a sheet at a time over all of them. A flame's rim darkens towards soot as
 * the last of its heat goes, and its heart is white only while it is at its hottest.
 */
export function layFlames(drawn: Staged, flames: readonly Flame[], ramp: readonly string[], depth: FireDepth): void {
  SHEETS.forEach((sheet, order) => {
    for (const flame of flames) {
      if (flame.heat <= 0 || flame.heat < sheet.needs || flame.wide <= 0.5) continue;
      const alpha = flame.alpha ?? 1;
      const cold = order === 0 ? 1 - Math.min(1, flame.heat / 0.3) : 0;
      const rim = order === 0 ? mixColor(ramp[1], ramp[0], RIM_DEEPER) : ramp[sheet.step];
      const color = cold > 0 ? mixColor(rim, mixColor(ramp[0], SMOKE, 0.5), cold) : rim;
      const hottest = order === SHEETS.length - 1;
      const core = order === 0 ? undefined : hottest && flame.heat >= WHITE_HOT ? '#ffffff' : ramp[sheet.core];
      const paint = { color, core, alpha: cold > 0 ? alpha * (1 - 0.5 * cold) : alpha, variant: flame.variant };
      const wide = flame.wide * sheet.wide;
      const long = Math.max(flame.long * sheet.long, wide);
      if (flame.shape === 'lick') {
        drawn.motes.push(lickMote(flame.at, flame.heading, wide, long, flame.flowed, paint, depth));
        continue;
      }
      const way = unit(flame.heading);
      const led = flame.wide * BLAZE_LEADS * order;
      const middle = { x: flame.at.x + way.x * led, y: flame.at.y + way.y * led, z: flame.at.z + way.z * led };
      drawn.motes.push(roundMote('blaze', middle, way, wide, long, flame.flowed, paint, depth));
    }
  });
}

/**
 * The colour of what a fire leaves as it cools: soot for a fire of flame, still red while the fire's
 * glow is in it; for a blast that is no flame, of light or of force, a haze of its own colour.
 */
export function smokeColorOf(ramp: readonly string[], fiery: boolean, warm = 0): string {
  if (!fiery) return mixColor(hueOf(ramp), ramp[4], 0.55);
  return mixColor(mixColor(mixColor(SMOKE, ASH, 0.3), ramp[0], 0.2), ramp[1], 0.45 * warm);
}

/** Lays billows of smoke, to be drawn behind the fire they rise from. */
export function layBillows(
  drawn: Staged,
  billows: readonly Billow[],
  ramp: readonly string[],
  fiery: boolean,
  depth: FireDepth
): void {
  for (const billow of billows) {
    if (billow.alpha <= 0.01) continue;
    const tone = Math.abs(Math.sin(billow.variant * 12.9898)) * 0.22;
    const paint = {
      color: mixColor(smokeColorOf(ramp, fiery, billow.warm ?? 0), ASH, tone),
      alpha: billow.alpha,
      variant: billow.variant,
    };
    drawn.motes.push(
      roundMote('billow', billow.at, billow.heading, billow.wide, billow.long, billow.flowed, paint, depth)
    );
  }
}

/**
 * Balls of flame that were thrown, at a moment, as flames and the smoke they turn to: each a blaze
 * rolling the way it flies, narrowing and cooling as it burns, and one that turns to smoke left as a
 * billow that swells as it rises and thins away.
 */
export function thrownFireAt(
  balls: readonly FireBall[],
  t: number,
  cell: number
): { readonly flames: Flame[]; readonly billows: Billow[] } {
  const flames: Flame[] = [];
  const billows: Billow[] = [];
  for (const ball of balls) {
    const now = moteAt(ball.mote, t);
    if (!now) continue;
    const speed = Math.hypot(now.vx, now.vy, now.vz);
    const heading = speed > 1 ? { x: now.vx, y: now.vy, z: now.vz + speed * 0.5 } : { x: 0, y: 0, z: 1 };
    const flowed = (t - ball.mote.bornAt) * 3 + ball.variant * 7;
    if (now.age < ball.burns) {
      const burnt = now.age / ball.burns;
      const wide = cell * ball.size * (1 - (ball.taper ?? 0.4) * burnt);
      flames.push({
        shape: 'blaze',
        at: { x: now.x, y: now.y, z: Math.max(now.z, ball.mote.floorZ + wide * 0.3) },
        heading,
        wide,
        long: wide * 1.2,
        heat: Math.pow(1 - burnt, 0.8),
        flowed,
        variant: ball.variant,
      });
    }
    if (ball.burns >= 1 || now.age < ball.burns * 0.6) continue;
    const smoked = (now.age - ball.burns * 0.6) / (1 - ball.burns * 0.6);
    const wide = cell * ball.size * (0.9 + 1.1 * smoked);
    billows.push({
      at: { x: now.x, y: now.y, z: Math.max(now.z, ball.mote.floorZ + wide * 0.3) },
      heading: { x: 0, y: 0, z: 1 },
      wide,
      long: wide * 1.1,
      alpha: Math.min(Math.min(1, smoked / 0.2), 1 - smoked) * 0.8,
      flowed: flowed * 0.3,
      variant: ball.variant + 2.1,
      warm: 1 - Math.min(1, smoked / 0.4),
    });
  }
  return { flames, billows };
}

/** A cloud of smoke or dust at a moment as a billow, swelling as it drifts and thinning away; nothing once it is gone. */
export function billowOf(cloud: Cloud, t: number, cell: number): (Billow & { readonly color: string }) | null {
  const at = moteAt(cloud.mote, t);
  if (!at) return null;
  const wide = cell * cloud.size * (0.8 + at.age * 1.1);
  const speed = Math.hypot(at.vx, at.vy, at.vz);
  return {
    at: { x: at.x, y: at.y, z: Math.max(at.z, cloud.mote.floorZ + wide * 0.3) },
    heading: speed > 1 ? { x: at.vx, y: at.vy, z: at.vz + speed * 0.6 } : { x: 0, y: 0, z: 1 },
    wide,
    long: wide * (1 + (cloud.plume ?? 0) * 0.4),
    alpha: Math.min(Math.min(1, at.age / 0.12), 1 - at.age) * cloud.alpha * 1.25,
    flowed: (t - cloud.mote.bornAt) * 0.7 + cloud.size * 9,
    variant: cloud.size * 13,
    color: cloud.color,
  };
}

/** Draws clouds of smoke and dust as billows, each of its own colour. */
export function drawBillowClouds(
  drawn: Staged,
  clouds: readonly Cloud[],
  t: number,
  cell: number,
  depth: FireDepth
): void {
  for (const cloud of clouds) {
    const billow = billowOf(cloud, t, cell);
    if (!billow || billow.alpha <= 0.01) continue;
    const paint = { color: billow.color, alpha: billow.alpha, variant: billow.variant };
    drawn.motes.push(
      roundMote('billow', billow.at, billow.heading, billow.wide, billow.long, billow.flowed, paint, depth)
    );
  }
}

/** The earth of a brand, charred. */
const CHARRED = '#2a1d1c';

/**
 * Burning brands at a moment: each a charred chunk, trailing a streak of light while it flies and
 * giving light where it lies; the little flames that stand on those that have landed are returned,
 * to be laid with the fire they were thrown from.
 */
export function drawBrands(
  drawn: Staged,
  brands: readonly { readonly mote: Cloud['mote']; readonly power: number }[],
  t: number,
  cell: number,
  ramp: readonly string[],
  forward: number
): Flame[] {
  const flames: Flame[] = [];
  brands.forEach((brand, index) => {
    const now = moteAt(brand.mote, t);
    if (!now) return;
    const burning = (1 - now.age * now.age) * brand.power;
    if (now.landed) {
      const flicker = 0.75 + 0.25 * Math.sin(t * 21 + index * 2.3);
      drawn.motes.push({
        x: now.x,
        y: now.y,
        z: now.z,
        size: cell * 0.7,
        color: ramp[3],
        alpha: 0.3 * burning,
        blend: 'light',
        shape: 'glow',
        forward,
      });
      flames.push({
        shape: 'lick',
        at: { x: now.x, y: now.y, z: now.z },
        heading: { x: 0.12 * Math.sin(t * 5 + index), y: 0, z: 1 },
        wide: cell * 0.2 * (0.5 + 0.5 * burning),
        long: cell * 0.5 * burning * flicker,
        heat: 0.3 + 0.6 * burning,
        flowed: t * 4 + index * 3.7,
        variant: index * 1.3,
      });
    } else {
      drawn.motes.push({
        x: now.x,
        y: now.y,
        z: now.z,
        size: cell * 0.13,
        color: ramp[4],
        alpha: Math.max(0, burning + 0.2),
        blend: 'light',
        shape: 'spark',
        velocity: { x: now.vx, y: now.vy, z: now.vz },
        trail: 0.07,
        forward,
      });
    }
    drawn.motes.push({
      x: now.x,
      y: now.y,
      z: now.z + cell * 0.04,
      size: cell * 0.11,
      color: CHARRED,
      alpha: Math.min(1, (1 - now.age) * 4),
      blend: 'color',
      shape: 'chunk',
      spin: now.landed ? index : t * 9 + index,
      variant: index % 6,
      forward,
    });
  });
  return flames;
}
