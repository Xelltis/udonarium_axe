/**
 * The light the sky throws on the table at an hour of the story's day: the sun by day and the moon by
 * night, from where it stands, and the sky all round.
 *
 * It shades rather than darkens. A level surface takes as much light at every hour as it does now,
 * the light that comes straight from the sun or the moon and the light of the sky together, so a
 * table looks as bright at midnight as at noon; what the hour changes is which side of a block is
 * lit and in what colour. How dark a table is, is its darkness's to say.
 */
export interface SkyLight {
  /** Towards the sun or the moon from the table, of unit length: x to the east, y to the south, z up. */
  readonly direction: { readonly x: number; readonly y: number; readonly z: number };
  /** How strong the light straight from the sun or the moon is, beside the sky's, from 0 to 1. */
  readonly strength: number;
  /** What colour that light is, and the sky's. */
  readonly colour: string;
  readonly skyColour: string;
  /** How much light the sky gives a level surface, which with the straight light comes to 1. */
  readonly skyStrength: number;
}

/** How high the sun climbs at noon, and the moon at midnight, in degrees. */
const SUN_HIGHEST_DEG = 60;
const MOON_HIGHEST_DEG = 45;
/** How strong the light straight from each is, beside the sky's. */
const SUN_STRENGTH = 0.6;
const MOON_STRENGTH = 0.3;
/** How low the sun is before its light is the warm light of dawn or dusk, in degrees. */
const LOW_SUN_DEG = 15;

const SUN_COLOUR = '#fff4e2';
const LOW_SUN_COLOUR = '#ffb877';
const MOON_COLOUR = '#c3d0ff';
const DAY_SKY = '#ffffff';
const NIGHT_SKY = '#e4e9ff';

/**
 * The light of the sky at a time of day, from 0 at midnight to 1: the sun rises in the east at six,
 * stands in the south at noon and sets in the west at six in the evening, and the moon crosses the
 * other half of the sky through the night.
 */
export function skyLightAt(dayFraction: number): SkyLight {
  const time = ((dayFraction % 1) + 1) % 1;
  const day = time >= 0.25 && time < 0.75;
  const along = day ? (time - 0.25) / 0.5 : ((time + 0.25) % 1) / 0.5;
  const highest = ((day ? SUN_HIGHEST_DEG : MOON_HIGHEST_DEG) * Math.PI) / 180;
  const elevation = Math.max(0, Math.sin(Math.PI * along)) * highest;
  const azimuth = Math.PI * along;
  const direction = {
    x: Math.cos(elevation) * Math.cos(azimuth),
    y: Math.cos(elevation) * Math.sin(azimuth),
    z: Math.sin(elevation),
  };
  const strength = day ? SUN_STRENGTH : MOON_STRENGTH;
  const low = (elevation * 180) / Math.PI < LOW_SUN_DEG;
  return {
    direction,
    strength,
    colour: day ? (low ? LOW_SUN_COLOUR : SUN_COLOUR) : MOON_COLOUR,
    skyColour: day ? DAY_SKY : NIGHT_SKY,
    skyStrength: 1 - strength * direction.z,
  };
}
