import { type ProjectileStyle } from '@axe/domain/effect/effect-kind';
import { type EffectPreset } from '@axe/domain/effect/effect-preset';

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
};

export interface ProjectileShot {
  /** Where through the effect it is fired. */
  launch: number;
  /** Where it lands. */
  land: number;
}

/**
 * When each shot of a projectile effect is fired and lands, as shares of the effect's duration.
 *
 * The travel time comes from the projectile's look, held between 5% and 60% of the effect. Several
 * shots are spaced by the preset's shot interval, but never so far apart that the last one would
 * land after the effect ends.
 */
export function projectileTiming(preset: EffectPreset): { travel: number; shots: ProjectileShot[] } {
  const travel = Math.min(Math.max(PROJECTILE_TRAVEL_MS[preset.projectileLook] / preset.duration, 0.05), 0.6);
  const count = preset.shotCount;
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
