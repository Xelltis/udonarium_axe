import { clamp } from '@axe/core/util/clamp';
import { isRockShot } from '@axe/domain/effect/earth-looks';
import { type ProjectileStyle } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';
import { isSpiritShot, SPIRIT_GATHERS_MS } from '@axe/domain/effect/magic-looks';

/**
 * When the things an effect throws are let go and land, as shares of its playback: what the sound
 * of an effect is timed by as well as its picture, kept apart from the drawing so that what plays
 * the sound need not load the drawing.
 */

/**
 * How long a shot is in the air, in real time rather than as a share of the playback.
 * As a share, a longer effect such as a burst would fly its shots more slowly.
 */
const PROJECTILE_TRAVEL_MS: Record<ProjectileStyle, number> = {
  bullet: 130,
  arrow: 260,
  bolt: 340,
  crescent: 300,
  blaster: 110,
  tracer: 70,
  missile: 420,
  cruise: 1400,
  meteor: 1050,
};

/** How long a shot of rock is in the air: a boulder thrown, slower than the bolt of light it is written as. */
const ROCK_TRAVEL_MS = 460;

/** How long a sniper's shot is aimed before it is fired, and the most of the effect that may be, as a share of it. */
const AIMED_MS = 300;
const AIMED_AT_MOST = 0.45;

/** The latest a shot of a look lands, as a share of the effect; see {@link latestLandingOf}. */
const LANDS_BY = 0.6;
/** The latest a meteor lands: it falls for most of the effect, which leaves only its landing to play out after it. */
const METEOR_LANDS_BY = 0.875;

/**
 * The latest a shot of a look may land, as a share of the effect, however short the effect is: a
 * meteor is seen falling for most of it, and anything else leaves the rest of it to its landing.
 */
function latestLandingOf(look: ProjectileStyle): number {
  return look === 'meteor' ? METEOR_LANDS_BY : LANDS_BY;
}

export interface ProjectileShot {
  /** Where through the effect it is fired. */
  launch: number;
  /** Where it lands. */
  land: number;
}

/**
 * When each shot of a projectile effect is fired and lands, as shares of the effect's duration.
 *
 * The travel time comes from the projectile's look, or from its being a shot of rock, held between 5% and 60% of the effect, or as far
 * as 87.5% of it for a meteor, whose travel is its omen in the sky and its fall together. Several
 * shots are spaced by the preset's shot interval, but never so far apart that the last one would
 * land after the effect ends.
 */
export function projectileTiming(preset: EffectPreset): { travel: number; shots: ProjectileShot[] } {
  const look = preset.projectileLook;
  const travelMs = isRockShot(preset) ? ROCK_TRAVEL_MS : PROJECTILE_TRAVEL_MS[look];
  const travel = clamp(travelMs / preset.duration, 0.05, latestLandingOf(look));
  const count = preset.shotCount;
  if (look === 'tracer') return aimedTiming(preset, travelMs, AIMED_MS);
  if (isSpiritShot(preset)) return aimedTiming(preset, travelMs, SPIRIT_GATHERS_MS);
  if (count === 1) return { travel, shots: [{ launch: 0, land: travel }] };

  // A burst is set by shots a second; spread evenly through the effect it would keep firing
  // long after the sound of the shots has ended.
  const even = (1 - travel) / (count - 1);
  const wanted = preset.shotIntervalMs > 0 ? preset.shotIntervalMs / preset.duration : even;
  const gap = Math.min(wanted, even);

  return {
    travel,
    shots: Array.from({ length: count }, (_unused, index) => ({
      launch: gap * index,
      land: gap * index + travel,
    })),
  };
}

/**
 * When the shots of a cast that is made ready before it is let go are fired and land, a sniper's that
 * is aimed and a shot of spirit that is gathered: the first is held for `leadMs`, or for as much of
 * the effect as may be given to it, and the others follow it at the preset's interval, the last
 * landing before the effect ends.
 */
function aimedTiming(
  preset: EffectPreset,
  travelMs: number,
  leadMs: number
): { travel: number; shots: ProjectileShot[] } {
  const aimed = Math.min(leadMs / preset.duration, AIMED_AT_MOST);
  const travel = clamp(travelMs / preset.duration, 0.02, 1 - aimed);
  const count = preset.shotCount;
  const even = count > 1 ? (1 - aimed - travel) / (count - 1) : 0;
  const gap = preset.shotIntervalMs > 0 ? Math.min(preset.shotIntervalMs / preset.duration, even) : even;
  return {
    travel,
    shots: Array.from({ length: count }, (_unused, index) => ({
      launch: aimed + gap * index,
      land: aimed + gap * index + travel,
    })),
  };
}

/** How many arrows fall. Too few and it is no rain. */
export const ARROW_RAIN_COUNT = 36;
/** How long the archer takes to loose them all. */
const ARROW_RAIN_LOOSE_END = 0.26;
/** How long one takes to fall. */
export const ARROW_RAIN_FALL = 0.18;
/** The stretch the falls are scattered over, which fits the last of them striking inside the effect. */
const ARROW_RAIN_SPREAD = 0.5;

/** One arrow of a rain of them, as shares of the playback. */
export interface ArrowRainShot {
  /** Where it leaves the bow. */
  loose: number;
  /** Where it begins to fall. */
  fall: number;
  /** Where it strikes. */
  land: number;
}

/**
 * For each arrow: the loosing, the falling and the striking.
 *
 * Both the picture and the sound read this table, so it returns the same order whatever the seed.
 */
export function arrowRainShots(): ArrowRainShot[] {
  const shots: ArrowRainShot[] = [];
  for (let index = 0; index < ARROW_RAIN_COUNT; index += 1) {
    // Evenly spaced they sound machined, so a waver worked out from the count is mixed in.
    const wobble = (((index * 37) % 13) / 13 - 0.5) * 0.04;
    const fall = ARROW_RAIN_LOOSE_END + (index / ARROW_RAIN_COUNT) * ARROW_RAIN_SPREAD + wobble;
    shots.push({
      loose: (index / ARROW_RAIN_COUNT) * ARROW_RAIN_LOOSE_END,
      fall,
      land: fall + ARROW_RAIN_FALL,
    });
  }
  return shots;
}
