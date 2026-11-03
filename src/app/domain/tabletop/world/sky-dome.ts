/** A way of the board: x to the east, y to the south and z up, of unit length. */
export interface SkyWay {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The sky drawn over a table at an hour of the story's day: its colour overhead and at the horizon,
 * the warm glow round a sun near the horizon, the sun and the moon where they stand, the stars, and
 * the colour of the ground running out to the horizon beyond the board.
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
  readonly ground: string;
}

/** How high the sun climbs at noon, and the moon at midnight, in degrees, as the light of the sky has them. */
const SUN_HIGHEST_DEG = 60;
const MOON_HIGHEST_DEG = 45;

/** How far the sun is below or above the horizon at the ends of the twilight, in degrees. */
const TWILIGHT_DEG = 12;

/** The colours of the sky by night, at the sun's setting and by day: overhead, at the horizon and of the ground. */
const NIGHT = { zenith: '#060a18', horizon: '#18203a', ground: '#141a22' };
const DUSK = { zenith: '#3f527f', horizon: '#e9a06e', ground: '#4a4334' };
const DAY = { zenith: '#3b7bd0', horizon: '#b4d8f2', ground: '#6b7552' };
const GLOW = '#ffb070';

/**
 * The sky at a time of day, from 0 at midnight to 1: the sun rises in the east at six, stands in the
 * south at noon and sets in the west at six in the evening, and the moon crosses the other half of the
 * sky through the night, as the light of the sky has them. The sky turns from night through the warm
 * colours of dusk to day as the sun climbs out of the twilight, the stars fading as it does.
 */
export function skyDomeAt(dayFraction: number): SkyDome {
  const time = ((dayFraction % 1) + 1) % 1;
  const sunAlong = (time - 0.25) / 0.5;
  const sunHeight = Math.sin(Math.PI * sunAlong) * SUN_HIGHEST_DEG;
  const sun = wayOf(sunAlong, sunHeight);
  const moonAlong = ((time + 0.25) % 1) / 0.5;
  const moon = wayOf(moonAlong, Math.sin(Math.PI * moonAlong) * MOON_HIGHEST_DEG);
  const towardsDusk = clamp01((sunHeight + TWILIGHT_DEG) / TWILIGHT_DEG);
  const towardsDay = clamp01(sunHeight / TWILIGHT_DEG);
  const colour = (key: keyof typeof DAY) => mixHex(mixHex(NIGHT[key], DUSK[key], towardsDusk), DAY[key], towardsDay);
  return {
    zenith: colour('zenith'),
    horizon: colour('horizon'),
    glow: GLOW,
    glowStrength: round(towardsDusk * (1 - towardsDay)),
    sun,
    moon,
    stars: round(1 - towardsDusk),
    ground: colour('ground'),
  };
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

function mixHex(from: string, to: string, share: number): string {
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
  return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
