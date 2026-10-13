import { withAlpha } from '@axe/domain/effect/particles/shared';

/** How dark the depths are against the colour of the water. */
const DEPTH_SHADE = 0.32;

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
  const alpha = 0.22 + 0.38 * clamp01(density);
  return withAlpha(deepWaterColor(color), round(alpha));
}

/**
 * The colour of the surface itself: light enough to see the floor through, and brighter along one
 * side than the other as a sheet of water catches the sky.
 */
export function waterSurfaceWash(color: string, density: number): string {
  const alpha = 0.16 + 0.26 * clamp01(density);
  return (
    `linear-gradient(135deg, ${withAlpha(color, round(alpha * 1.25))} 0%,` +
    ` ${withAlpha(color, round(alpha * 0.8))} 55%, ${withAlpha(color, round(alpha))} 100%)`
  );
}

/** The colour of a side of the water: dark at the floor and lighter towards the surface. */
export function waterSideWash(color: string, density: number): string {
  const level = clamp01(density);
  return (
    `linear-gradient(to top, ${withAlpha(deepWaterColor(color), round(0.45 + 0.3 * level))} 0%,` +
    ` ${withAlpha(color, round(0.18 + 0.22 * level))} 100%)`
  );
}

/** How strongly the net of light shows on the floor. */
export function causticOpacity(density: number): number {
  return round(0.22 + 0.33 * clamp01(density));
}

/** How strongly the glints show on the surface. */
export function glintOpacity(density: number): number {
  return round(0.1 + 0.14 * clamp01(density));
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
