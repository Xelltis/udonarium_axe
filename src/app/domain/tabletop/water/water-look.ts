import { ambiencePalette } from '@axe/domain/effect/ambience/ambience-kind';
import { withAlpha } from '@axe/domain/effect/particles/shared';

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

/** A colour as the red, green and blue a CSS `rgba()` takes, or null where it cannot be read. */
export function rgbTripletOf(color: string): string | null {
  const rgb = rgbOf(color);
  return rgb ? rgb.join(', ') : null;
}

/**
 * The colour given, darkened to how lit it is.
 *
 * Water standing above the floor stands above the dark painted on it too, and faded alone it
 * stays the colour of daylight water seen through a veil; it has to darken as well.
 */
export function shadedWaterColor(color: string, light: number): string {
  const rgb = rgbOf(color);
  const level = Number.isFinite(light) ? Math.min(Math.max(light, 0), 1) : 1;
  if (!rgb || level >= 1) return color;
  return `#${rgb.map((channel) => hex2(Math.round(channel * level))).join('')}`;
}

/** The colour laid over the floor under water: the depths, thicker the thicker the water is drawn. */
export function waterFloorWash(color: string, density: number): string {
  return depthsWash(deepWaterColor(color), density);
}

/** The colour of the depths laid over the floor, given the colour of the depths itself. */
export function depthsWash(deepColor: string, density: number): string {
  const alpha = 0.22 + 0.38 * clamp01(density);
  return withAlpha(deepColor, round(alpha));
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

/** The colour of the clouds of silt in murky water: the water's own colour, darkened. */
export function siltColorOf(color: string): string {
  return mixColors(color, '#000000', 0.38);
}

/**
 * The colour of the surface itself: light enough to see the floor through.
 *
 * It is one colour all over. A pond is drawn in pieces, and a shading laid across each piece
 * would show every join; the light moving on the water is the glints laid over it.
 */
export function waterSurfaceWash(color: string, density: number): string {
  const paint = withAlpha(color, round(0.16 + 0.26 * clamp01(density)));
  return `linear-gradient(${paint}, ${paint})`;
}

/**
 * How much of what is under the surface murkiness hides by itself, before any depth is counted,
 * from 0 to 1. Water at the top of the scale is opaque: nothing under it shows at all.
 */
export function murkAlpha(turbidity: number): number {
  return round(Math.min(1, 1.05 * Math.pow(clamp01(turbidity), 1.3)));
}

/**
 * The murk laid over the surface in the water's own colour, as a CSS image, or empty for water
 * too clear to need one. Opaque water is its colour all the way down.
 */
export function waterMurkLayer(color: string, turbidity: number): string {
  const alpha = murkAlpha(turbidity);
  if (alpha < 0.005) return '';
  const paint = withAlpha(mixColors(color, '#000000', 0.12), alpha);
  return `linear-gradient(${paint}, ${paint})`;
}

/** How strongly the clouds of silt show on the surface: not at all in water clearer than a quarter murky. */
export function siltOpacity(turbidity: number): number {
  return round((0.55 * Math.max(clamp01(turbidity) - 0.25, 0)) / 0.75);
}

/** How thick the scum floats on the surface: none on clean water. */
export function scumOpacity(dirt: number): number {
  return round(0.68 * clamp01(dirt));
}

/**
 * The colour of a side of the water: dark at the floor and lighter towards the surface, and as
 * opaque as the water is murky, so murky water is a solid wall of its colour from the side too.
 */
export function waterSideWash(color: string, density: number, turbidity = 0): string {
  const level = clamp01(density);
  const murk = murkAlpha(turbidity);
  const bottom = Math.max(Math.min(0.45 + 0.3 * level, 0.95), murk);
  const top = Math.max(0.18 + 0.22 * level, murk * 0.95);
  return (
    `linear-gradient(to top, ${withAlpha(deepWaterColor(color), round(bottom))} 0%,` +
    ` ${withAlpha(color, round(top))} 100%)`
  );
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(Math.max(value, 0), 1);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
