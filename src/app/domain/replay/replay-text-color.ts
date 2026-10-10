export const REPLAY_MIN_CONTRAST = 4.5;

/**
 * A text colour that reads against the background, with channels from 0 to 1, at a contrast of at least 4.5 to 1.
 *
 * The colour is kept when it already does; otherwise its hue and saturation are kept and its
 * lightness moved away from the background. The fallback is used when the colour is not a hex
 * colour or no lightness reaches the contrast.
 */
export function readableOn(color: string, background: [number, number, number], fallback: string): string {
  const rgb = parseHex(color);
  if (!rgb) return fallback;

  const backdrop = luminanceOf(background);
  if (contrastOf(luminanceOf(rgb), backdrop) >= REPLAY_MIN_CONTRAST) return toHex(rgb);

  const [hue, saturation] = rgbToHsl(rgb);
  const wantsLighter = backdrop < 0.5;
  for (let step = 1; step <= 20; step += 1) {
    const lightness = wantsLighter ? 0.5 + step * 0.025 : 0.5 - step * 0.025;
    const lifted = hslToRgb(hue, saturation, Math.max(0, Math.min(1, lightness)));
    if (contrastOf(luminanceOf(lifted), backdrop) >= REPLAY_MIN_CONTRAST) return toHex(lifted);
  }
  return fallback;
}

function contrastOf(a: number, b: number): number {
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);
  return (lighter + 0.05) / (darker + 0.05);
}

function luminanceOf([r, g, b]: [number, number, number]): number {
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function parseHex(hex: string): [number, number, number] | null {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length !== 6 && clean.length !== 3) return null;
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((one) => one + one)
          .join('')
      : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
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
