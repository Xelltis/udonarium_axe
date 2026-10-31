/** A colour, as red, green and blue from 0 to 255. */
type Rgb = readonly [number, number, number];

/**
 * The colours of the sky through the day, at the top and down at the horizon, from midnight round
 * to midnight: night, the grey before dawn, dawn, morning, noon, afternoon, dusk and twilight.
 */
const SKY_THROUGH_THE_DAY: readonly { at: number; top: Rgb; horizon: Rgb }[] = [
  { at: 0, top: [7, 11, 31], horizon: [26, 37, 80] },
  { at: 0.2, top: [20, 27, 61], horizon: [59, 63, 115] },
  { at: 0.27, top: [61, 79, 143], horizon: [242, 160, 123] },
  { at: 0.35, top: [79, 143, 214], horizon: [191, 224, 245] },
  { at: 0.5, top: [47, 127, 216], horizon: [159, 210, 247] },
  { at: 0.68, top: [74, 124, 196], horizon: [242, 196, 141] },
  { at: 0.75, top: [58, 44, 102], horizon: [239, 127, 90] },
  { at: 0.82, top: [27, 29, 74], horizon: [91, 63, 122] },
  { at: 1, top: [7, 11, 31], horizon: [26, 37, 80] },
];

/** The width and height of the sky drawn, in its own units, as wide against tall as the sky on the page. */
export const SKY_WIDTH = 240;
export const SKY_HEIGHT = 96;
/** How far down the horizon lies, where the sun and the moon rise and set. */
export const SKY_HORIZON = 62;
/** How far the sun and the moon reach from the middle of the horizon, across and up. */
const ARC_ACROSS = 100;
const ARC_UP = 50;

/**
 * The arc the sun and the moon travel over the sky, from the horizon in the east, on the right as
 * on a map, over the south at the top, to the west on the left.
 */
export const SKY_ARC = `M${SKY_WIDTH / 2 + ARC_ACROSS} ${SKY_HORIZON} A${ARC_ACROSS} ${ARC_UP} 0 0 0 ${SKY_WIDTH / 2 - ARC_ACROSS} ${SKY_HORIZON}`;

/** Where something stands in the sky, in its own units. */
export interface SkyPoint {
  readonly x: number;
  readonly y: number;
}

/** The sky at one moment of the day, as the clock draws it. */
export interface ClockSky {
  /** The colour at the top of the sky, and down at the horizon. */
  readonly top: string;
  readonly horizon: string;
  /** How brightly the stars show, from 0 by day to 1 at night. */
  readonly stars: number;
  /** Which is up: the sun from dawn to dusk, the moon from dusk to dawn. */
  readonly body: 'sun' | 'moon';
  /** Where the sun and the moon stand, the one down going on under the horizon, out of sight. */
  readonly sun: SkyPoint;
  readonly moon: SkyPoint;
}

function blend(from: Rgb, to: Rgb, share: number): string {
  const mixed = from.map((value, index) => Math.round(value + (to[index] - value) * share));
  return `rgb(${mixed.join(', ')})`;
}

/** How dark the sky is for the stars: none in the day, coming out at dusk and going in at dawn. */
function starsAt(fraction: number): number {
  if (fraction >= 0.3 && fraction <= 0.7) return 0;
  if (fraction > 0.18 && fraction < 0.3) return (0.3 - fraction) / 0.12;
  if (fraction > 0.7 && fraction < 0.82) return (fraction - 0.7) / 0.12;
  return 1;
}

/**
 * Where a body stands a share of its round on: rising in the east, on the right, at 0, at the top
 * over the south at a quarter, setting in the west, on the left, at a half, and at the bottom,
 * under the horizon, at three quarters. Going round the whole way, it always crosses the sky from
 * east to west and comes back round under it.
 */
function onRound(share: number): SkyPoint {
  const angle = 2 * Math.PI * (((share % 1) + 1) % 1);
  return { x: SKY_WIDTH / 2 + ARC_ACROSS * Math.cos(angle), y: SKY_HORIZON - ARC_UP * Math.sin(angle) };
}

/**
 * The sky at a share of the day gone, 0 at midnight: its colours blended between the ones either
 * side, the stars, and the sun and the moon on their rounds, the sun rising at six and setting at
 * eighteen, and the moon half a day apart from it.
 */
export function clockSky(fraction: number): ClockSky {
  const at = ((fraction % 1) + 1) % 1;
  const next = SKY_THROUGH_THE_DAY.findIndex((point) => point.at > at);
  const after = SKY_THROUGH_THE_DAY[next];
  const before = SKY_THROUGH_THE_DAY[next - 1];
  const share = (at - before.at) / (after.at - before.at);
  return {
    top: blend(before.top, after.top, share),
    horizon: blend(before.horizon, after.horizon, share),
    stars: starsAt(at),
    body: at >= 0.25 && at < 0.75 ? 'sun' : 'moon',
    sun: onRound(at - 0.25),
    moon: onRound(at + 0.25),
  };
}

/** The stars of the sky, where each stands and how big it is, scattered over its upper part. */
export const SKY_STARS: readonly { x: number; y: number; r: number }[] = [
  { x: 17, y: 12, r: 0.9 },
  { x: 40, y: 30, r: 0.6 },
  { x: 58, y: 9, r: 1.1 },
  { x: 79, y: 22, r: 0.7 },
  { x: 101, y: 6, r: 0.6 },
  { x: 116, y: 34, r: 0.8 },
  { x: 142, y: 14, r: 1 },
  { x: 163, y: 28, r: 0.6 },
  { x: 180, y: 8, r: 0.8 },
  { x: 199, y: 24, r: 1.1 },
  { x: 218, y: 12, r: 0.7 },
  { x: 228, y: 38, r: 0.6 },
];
