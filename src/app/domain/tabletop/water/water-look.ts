import { clamp01 } from '@axe/core/util/clamp';
import { ambiencePalette } from '@axe/domain/effect/ambience/ambience-kind';

/** How dark the depths are against the colour of the water. */
const DEPTH_SHADE = 0.32;
/** The dull olive-brown dirty water turns towards: silt, rot and weed together. */
const DIRT_TONE = '#5b5636';
/** The yellowish green the scum floating on dirty water is drawn towards. */
const SCUM_TONE = '#b8ad6c';

/**
 * The colour of deep water: the colour given, darkened.
 *
 * A colour that cannot be read is handed back as it is, which draws the depths in the colour
 * of the water rather than in nothing.
 */
export function deepWaterColor(color: string): string {
  const rgb = rgbOf(color);
  if (!rgb) return color;
  return `#${rgb.map((channel) => hex2(Math.round(channel * DEPTH_SHADE))).join('')}`;
}

/**
 * The colour of the depths when the whole map is under water, from the colour chosen for its light.
 *
 * The colour chosen for that weather is the colour of the light coming down; darkened, the
 * default light would turn the depths grey, so the default keeps the blue of its own kind.
 */
export function underwaterDeepColor(lightColor: string): string {
  const palette = ambiencePalette('underwater');
  return lightColor.trim().toLowerCase() === palette.primary ? palette.secondary : deepWaterColor(lightColor);
}

/** How thick the colour of the depths is laid over the floor under water, thicker the thicker the water is drawn. */
export function floorWashAlpha(density: number): number {
  return round(0.22 + 0.38 * clamp01(density));
}

/**
 * The colour water is drawn in once its dirt is counted: the colour given, turned towards the
 * dull olive-brown of silt and rot as the water gets dirtier.
 */
export function dirtyWaterColor(color: string, dirt: number): string {
  return mixColors(color, DIRT_TONE, 0.55 * clamp01(dirt));
}

/** The colour of the scum floating on dirty water: the water's own colour, paled towards a yellowish green. */
export function scumColorOf(color: string): string {
  return mixColors(color, SCUM_TONE, 0.45);
}

/** The colour of the rim of the scum, where its film stands up and catches the light: the scum's colour, paled. */
export function scumRimColorOf(color: string): string {
  return mixColors(scumColorOf(color), '#ffffff', 0.45);
}

/** How thick the colour of the surface itself is laid: light enough to see the floor through. */
export function surfaceWashAlpha(density: number): number {
  return round(0.16 + 0.26 * clamp01(density));
}

/**
 * How much of what is under the surface murkiness hides by itself, before any depth is counted,
 * from 0 to 1. Water at the top of the scale is opaque: nothing under it shows at all.
 */
export function murkAlpha(turbidity: number): number {
  return round(Math.min(1, 1.05 * Math.pow(clamp01(turbidity), 1.3)));
}

/** The colour the murk is laid in: the water's own colour, darkened a little. */
export function murkColorOf(color: string): string {
  return mixColors(color, '#000000', 0.12);
}

/** How thick the scum floats on the surface: none on clean water. */
export function scumOpacity(dirt: number): number {
  return round(0.68 * clamp01(dirt));
}

/** The colour of the clouds of silt in murky water: the water's own colour, darkened. */
export function siltColorOf(color: string): string {
  return mixColors(color, '#000000', 0.38);
}

/** How strongly the clouds of silt show on the surface: not at all in water clearer than a quarter murky. */
export function siltOpacity(turbidity: number): number {
  return round((0.55 * Math.max(clamp01(turbidity) - 0.25, 0)) / 0.75);
}

/**
 * How strongly the streaks of a current show on water flowing as fast as given, from still to the
 * fastest: stronger the faster it runs, and fainter the murkier it is. Still water shows none.
 */
export function flowStreakOpacity(flowSpeed: number, turbidity: number): number {
  const speed = clamp01(flowSpeed);
  if (!(speed > 0)) return 0;
  return round((0.16 + 0.34 * speed) * (1 - 0.5 * clamp01(turbidity)));
}

/**
 * How opaque a side of the water is at the water's floor, in the colour of the depths, and at the
 * surface, in the water's own colour.
 */
export function waterSideAlphas(density: number, turbidity = 0): { bottom: number; top: number } {
  const level = clamp01(density);
  const murk = murkAlpha(turbidity);
  return {
    bottom: round(Math.max(Math.min(0.45 + 0.3 * level, 0.95), murk)),
    top: round(Math.max(0.18 + 0.22 * level, murk * 0.95)),
  };
}

/**
 * How strongly the net of light shows on the floor. The light that makes it has to come down
 * through the water: murk scatters it and depth spreads it thin, so it fades with both.
 */
export function causticOpacity(density: number, turbidity = 0, depthCells = 0): number {
  const through = (1 - 0.9 * clamp01(turbidity)) * Math.exp(-0.12 * Math.max(depthCells, 0));
  return round((0.22 + 0.33 * clamp01(density)) * through);
}

/** How strongly the glints show on the surface; murky water catches less of the sky, and scum dulls it further. */
export function glintOpacity(density: number, turbidity = 0, dirt = 0): number {
  return round((0.1 + 0.14 * clamp01(density)) * (1 - 0.6 * clamp01(turbidity)) * (1 - 0.85 * clamp01(dirt)));
}

/** Two colours mixed, `share` of the way from the first to the second. A colour that cannot be read is handed back as the first. */
function mixColors(from: string, to: string, share: number): string {
  const a = rgbOf(from);
  const b = rgbOf(to);
  if (!a || !b || share <= 0) return from;
  const t = clamp01(share);
  return `#${a.map((channel, at) => hex2(Math.round(channel + (b[at] - channel) * t))).join('')}`;
}

function rgbOf(color: string): [number, number, number] | null {
  const digits = color.trim().replace(/^#/, '');
  const expanded =
    digits.length === 3
      ? digits
          .split('')
          .map((digit) => digit + digit)
          .join('')
      : digits;
  if (!/^[0-9a-f]{6}$/i.test(expanded)) return null;
  return [0, 2, 4].map((at) => parseInt(expanded.slice(at, at + 2), 16)) as [number, number, number];
}

function hex2(value: number): string {
  return Math.min(Math.max(value, 0), 255).toString(16).padStart(2, '0');
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
