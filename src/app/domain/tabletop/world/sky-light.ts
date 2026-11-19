import { mixHex, MOON_HIGHEST_DEG, skyTwilightAt, SUN_HIGHEST_DEG } from '@axe/domain/tabletop/world/sky-dome';

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
  /**
   * How far what it lights is drawn as by moonlight, the dimmer colours greyed and blued, from 0 by day
   * to 1; only under the sky drawn over a table.
   */
  readonly moonlit: number;
}

/** How strong the light straight from the sun and from the moon is, beside the sky's. */
const SUN_STRENGTH = 0.6;
const MOON_STRENGTH = 0.3;
/** How low the sun is before its light is the warm light of dawn or dusk, in degrees. */
const LOW_SUN_DEG = 15;

/** How far the night under the sky drawn over a table is drawn as by moonlight. */
const MOONLIT = 0.6;

/** The colours of the light of the sky: the sun's, by day, rising and setting, the moon's, and the sky's at each. */
interface SkyLightColours {
  readonly sun: string;
  readonly risingSun: string;
  readonly settingSun: string;
  readonly moon: string;
  readonly daySky: string;
  readonly risingSky: string;
  readonly settingSky: string;
  readonly nightSky: string;
}

/** The colours a table lit by the clock without a sky drawn over it has always been lit in. */
const PLAIN: SkyLightColours = {
  sun: '#fff4e2',
  risingSun: '#ffb877',
  settingSun: '#ffb877',
  moon: '#c3d0ff',
  daySky: '#ffffff',
  risingSky: '#ffffff',
  settingSky: '#ffffff',
  nightSky: '#e4e9ff',
};

/**
 * The colours of the light under the sky drawn over a table: a warm sun under a cool sky by day, so
 * that the sides the sun turns from read a little blue against the warm ones it lights; a golden sun
 * under a pale sky as it rises, and an orange one under a violet sky as it sets; and by night the
 * moonlight, blue and dimmer than the day, which the lamps stand out against.
 */
const UNDER_SKY: SkyLightColours = {
  sun: '#fff2dc',
  risingSun: '#ffd9a2',
  settingSun: '#ffb877',
  moon: '#98ade6',
  daySky: '#e8efff',
  risingSky: '#e6e8f6',
  settingSky: '#ead6f2',
  nightSky: '#7386bd',
};

/**
 * The light of the sky at a time of day, from 0 at midnight to 1: the sun rises in the east at six,
 * stands in the south at noon and sets in the west at six in the evening, and the moon crosses the
 * other half of the sky through the night.
 *
 * Under the sky drawn over a table, the light takes its colours from the hour as the sky does: the
 * sun's lasts until it has set, the twilight after it fading into the moonlight. Through the first
 * half of the twilight the light comes from where the sun went down, ever weaker, and through the
 * second from the moon, ever stronger, so it never lights a wall from the side the sun is not, and
 * never jumps from one to the other. A table with no sky drawn is lit in the colours it always was.
 */
export function skyLightAt(dayFraction: number, underSky = false): SkyLight {
  const time = ((dayFraction % 1) + 1) % 1;
  const day = time >= 0.25 && (underSky ? time <= 0.75 : time < 0.75);
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
  const colours = underSky ? UNDER_SKY : PLAIN;
  const rising = time < 0.5;
  const twilight = {
    sun: rising ? colours.risingSun : colours.settingSun,
    sky: rising ? colours.risingSky : colours.settingSky,
  };
  if (day) {
    return {
      direction,
      strength,
      colour: low ? twilight.sun : colours.sun,
      skyColour: low ? twilight.sky : colours.daySky,
      skyStrength: 1 - strength * direction.z,
      moonlit: 0,
    };
  }
  const night = underSky ? 1 - skyTwilightAt(time).fromNight : 1;
  const bySun = night < 0.5;
  const sunWay = Math.PI * ((time - 0.25) / 0.5);
  const from = bySun ? { x: Math.cos(sunWay), y: Math.sin(sunWay), z: 0 } : direction;
  const share = night < 1 ? Math.abs(1 - night * 2) : 1;
  const straight = (bySun ? SUN_STRENGTH : MOON_STRENGTH) * share;
  return {
    direction: from,
    strength: straight,
    colour: mixHex(twilight.sun, colours.moon, night),
    skyColour: mixHex(twilight.sky, colours.nightSky, night),
    skyStrength: 1 - straight * from.z,
    moonlit: underSky ? Math.round(night * MOONLIT * 1000) / 1000 : 0,
  };
}
