import { contrastRatio, parseHexColor, relativeLuminance } from '@axe/core/util/tonal-color';

export const REPLAY_MIN_CONTRAST = 4.5;

/**
 * A text colour that reads against the background, with channels from 0 to 1, at a contrast of at least 4.5 to 1.
 *
 * The colour is kept when it already does; otherwise its hue and saturation are kept and its
 * lightness moved away from the background. The fallback is used when the colour is not a hex
 * colour or no lightness reaches the contrast.
 */
export function readableOn(color: string, background: [number, number, number], fallback: string): string {
  const rgb = parseHexColor(color.trim());
  if (!rgb) return fallback;

  const backdrop = relativeLuminance(background);
  if (contrastRatio(relativeLuminance(rgb), backdrop) >= REPLAY_MIN_CONTRAST) return toHex(rgb);

  const [hue, saturation] = rgbToHsl(rgb);
  const wantsLighter = backdrop < 0.5;
  for (let step = 1; step <= 20; step += 1) {
    const lightness = wantsLighter ? 0.5 + step * 0.025 : 0.5 - step * 0.025;
    const lifted = hslToRgb(hue, saturation, Math.max(0, Math.min(1, lightness)));
    if (contrastRatio(relativeLuminance(lifted), backdrop) >= REPLAY_MIN_CONTRAST) return toHex(lifted);
  }
  return fallback;
}

function toHex([r, g, b]: [number, number, number]): string {
  const part = (value: number): string =>
    Math.round(Math.max(0, Math.min(1, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`;
}

function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const lightness = (max + min) / 2;
  if (max === min) return [0, 0, lightness];

  const delta = max - min;
  const saturation = lightness > 0.5 ? delta / (2 - max - min) : delta / (max + min);
  const hue =
    max === r
      ? ((g - b) / delta + (g < b ? 6 : 0)) / 6
      : max === g
        ? ((b - r) / delta + 2) / 6
        : ((r - g) / delta + 4) / 6;
  return [hue * 360, saturation, lightness];
}

function hslToRgb(hue: number, saturation: number, lightness: number): [number, number, number] {
  const h = hue / 360;
  if (saturation === 0) return [lightness, lightness, lightness];

  const q = lightness < 0.5 ? lightness * (1 + saturation) : lightness + saturation - lightness * saturation;
  const p = 2 * lightness - q;
  const toChannel = (t: number): number => {
    let shifted = t;
    if (shifted < 0) shifted += 1;
    if (shifted > 1) shifted -= 1;
    if (shifted < 1 / 6) return p + (q - p) * 6 * shifted;
    if (shifted < 1 / 2) return q;
    if (shifted < 2 / 3) return p + (q - p) * (2 / 3 - shifted) * 6;
    return p;
  };
  return [toChannel(h + 1 / 3), toChannel(h), toChannel(h - 1 / 3)];
}
