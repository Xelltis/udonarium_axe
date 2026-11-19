import { clamp } from '@axe/core/util/clamp';
/** A way of the board: x to the east, y to the south and z up, of unit length. */
export interface SkyWay {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The sky drawn over a table at an hour of the story's day: its colour overhead and at the horizon,
 * the warm glow round a sun near the horizon, the sun and the moon where they stand, and the stars.
 */
export interface SkyDome {
  readonly zenith: string;
  readonly horizon: string;
  readonly glow: string;
  /** How strongly the glow shows round the sun, from 0 to 1. */
  readonly glowStrength: number;
  readonly sun: SkyWay;
  readonly moon: SkyWay;
  /** How brightly the stars show, from 0 by day to 1 at night. */
  readonly stars: number;
}

/** How high the sun climbs at noon, and the moon at midnight, in degrees, for the sky drawn and its light alike. */
export const SUN_HIGHEST_DEG = 60;
export const MOON_HIGHEST_DEG = 45;

/** How far the sun is below or above the horizon at the ends of the twilight, in degrees. */
const TWILIGHT_DEG = 12;

/**
 * How far through its twilight the sky is at a time of day, from 0 at midnight to 1: how far it has
 * come from the night towards the twilight, as the sun climbs to the horizon from the depth the
 * twilight starts at, and how far from the twilight towards the day, as the sun climbs as high again
 * above it. Each runs from 0 to 1, and both fall back the same way as the sun sets. The sky's colours
 * and stars and the moonlight on the table all go by it.
 */
export interface SkyTwilight {
  readonly fromNight: number;
  readonly toDay: number;
}

/** How far through its twilight the sky is at a time of day, from 0 at midnight to 1. */
export function skyTwilightAt(dayFraction: number): SkyTwilight {
  const sunHeight = Math.sin(Math.PI * sunAlongAt(dayFraction)) * SUN_HIGHEST_DEG;
  return {
    fromNight: clamp01((sunHeight + TWILIGHT_DEG) / TWILIGHT_DEG),
    toDay: clamp01(sunHeight / TWILIGHT_DEG),
  };
}

/**
 * The colours of the sky by night, at the sun's rising, at its setting and by day: overhead, at the
 * horizon, and of the glow round the sun. The morning is the paler of the two
 * twilights, gold under a clearing blue, and the evening the redder.
 */
const NIGHT = { zenith: '#060a18', horizon: '#18203a' };
const DAWN = { zenith: '#5d82c2', horizon: '#f1d6b0', glow: '#ffd796' };
const DUSK = { zenith: '#3f527f', horizon: '#e9a06e', glow: '#ffb070' };
const DAY = { zenith: '#3b7bd0', horizon: '#b4d8f2' };

/**
 * The sky at a time of day, from 0 at midnight to 1: the sun rises in the east at six, stands in the
 * south at noon and sets in the west at six in the evening, and the moon crosses the other half of the
 * sky through the night, as the light of the sky has them. The sky turns from night through the
 * colours of the dawn to day as the sun climbs out of the twilight, the stars fading as it does, and
 * back through the warmer colours of dusk as it sets.
 */
export function skyDomeAt(dayFraction: number): SkyDome {
  const time = ((dayFraction % 1) + 1) % 1;
  const sunAlong = sunAlongAt(time);
  const sun = wayOf(sunAlong, Math.sin(Math.PI * sunAlong) * SUN_HIGHEST_DEG);
  const moonAlong = ((time + 0.25) % 1) / 0.5;
  const moon = wayOf(moonAlong, Math.sin(Math.PI * moonAlong) * MOON_HIGHEST_DEG);
  const { fromNight: towardsDusk, toDay: towardsDay } = skyTwilightAt(time);
  const twilight = time < 0.5 ? DAWN : DUSK;
  const colour = (key: keyof typeof DAY) =>
    mixHex(mixHex(NIGHT[key], twilight[key], towardsDusk), DAY[key], towardsDay);
  return {
    zenith: colour('zenith'),
    horizon: colour('horizon'),
    glow: twilight.glow,
    glowStrength: round(towardsDusk * (1 - towardsDay)),
    sun,
    moon,
    stars: round(1 - towardsDusk),
  };
}

/** How far the sun is along its crossing of the sky at a time of day: 0 as it rises, 1 as it sets. */
function sunAlongAt(dayFraction: number): number {
  const time = ((dayFraction % 1) + 1) % 1;
  return (time - 0.25) / 0.5;
}

/** The way to a body of the sky some way along its crossing, from the east, at a height in degrees, below the horizon where negative. */
function wayOf(along: number, heightDeg: number): SkyWay {
  const height = (heightDeg * Math.PI) / 180;
  const azimuth = Math.PI * along;
  return {
    x: round(Math.cos(height) * Math.cos(azimuth)),
    y: round(Math.cos(height) * Math.sin(azimuth)),
    z: round(Math.sin(height)),
  };
}

/** A colour some share of the way from one to another, both written as `#rrggbb`. */
export function mixHex(from: string, to: string, share: number): string {
  const a = channels(from);
  const b = channels(to);
  const t = clamp01(share);
  return `#${a
    .map((value, index) =>
      Math.round(value + (b[index] - value) * t)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

function channels(colour: string): number[] {
  return [1, 3, 5].map((at) => parseInt(colour.slice(at, at + 2), 16));
}

function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
