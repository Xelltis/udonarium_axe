/**
 * Colour in the terms Material's tonal palettes are built on: a hue, how much of it, and
 * how light it is. Tone is CIE L*, which is spaced the way an eye spaces lightness, so
 * moving a colour along it changes how light it reads and nothing else about it.
 */
export interface Lch {
  /** CIE L*, from black at nothing to white at a hundred. */
  tone: number;
  /** How much colour there is in it. Zero is a grey. */
  chroma: number;
  /** Where it sits on the wheel, in degrees. */
  hue: number;
}

const WHITE_X = 95.047;
const WHITE_Y = 100;
const WHITE_Z = 108.883;

function toLinear(channel: number): number {
  return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
}

function fromLinear(channel: number): number {
  return channel <= 0.0031308 ? channel * 12.92 : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (841 / 108) * t + 4 / 29;
}

function labFInverse(t: number): number {
  const cubed = t * t * t;
  return cubed > 216 / 24389 ? cubed : (108 / 841) * (t - 4 / 29);
}

/**
 * Reads a `#rgb` or `#rrggbb` colour, with or without the `#`, into channels from 0 to
 * 1, or null when it is not one.
 */
export function parseHexColor(hex: string): [number, number, number] | null {
  const clean = hex.replace(/^#/, '');
  if (clean.length !== 3 && clean.length !== 6) return null;
  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [
    parseInt(full.slice(0, 2), 16) / 255,
    parseInt(full.slice(2, 4), 16) / 255,
    parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** The WCAG relative luminance of a colour given as channels from 0 to 1. */
export function relativeLuminance([r, g, b]: [number, number, number]): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** The WCAG contrast ratio between two relative luminances, taken in either order, from 1 to 21. */
export function contrastRatio(a: number, b: number): number {
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

/** Converts channels from 0 to 1 into tone, chroma and hue against a D65 white, the reverse of `lchToRgb`. */
export function rgbToLch([r, g, b]: [number, number, number]): Lch {
  const lr = toLinear(r) * 100;
  const lg = toLinear(g) * 100;
  const lb = toLinear(b) * 100;

  const x = labF((0.4124 * lr + 0.3576 * lg + 0.1805 * lb) / WHITE_X);
  const y = labF((0.2126 * lr + 0.7152 * lg + 0.0722 * lb) / WHITE_Y);
  const z = labF((0.0193 * lr + 0.1192 * lg + 0.9505 * lb) / WHITE_Z);

  const tone = 116 * y - 16;
  const aStar = 500 * (x - y);
  const bStar = 200 * (y - z);
  const hue = (Math.atan2(bStar, aStar) * 180) / Math.PI;

  return { tone, chroma: Math.hypot(aStar, bStar), hue: hue < 0 ? hue + 360 : hue };
}

function lchToRawRgb({ tone, chroma, hue }: Lch): [number, number, number] {
  const radians = (hue * Math.PI) / 180;
  const aStar = Math.cos(radians) * chroma;
  const bStar = Math.sin(radians) * chroma;

  const fy = (tone + 16) / 116;
  const fx = fy + aStar / 500;
  const fz = fy - bStar / 200;

  const x = (labFInverse(fx) * WHITE_X) / 100;
  const y = (labFInverse(fy) * WHITE_Y) / 100;
  const z = (labFInverse(fz) * WHITE_Z) / 100;

  return [
    fromLinear(3.2406 * x - 1.5372 * y - 0.4986 * z),
    fromLinear(-0.9689 * x + 1.8758 * y + 0.0415 * z),
    fromLinear(0.0557 * x - 0.204 * y + 1.057 * z),
  ];
}

function inGamut([r, g, b]: [number, number, number]): boolean {
  return [r, g, b].every((c) => -0.0001 <= c && c <= 1.0001);
}

/**
 * The colour at this tone and hue, with as much of the chroma as the screen can show.
 *
 * A hue at a given lightness can only hold so much colour, and asking for more gives a
 * channel outside the range a screen has. Chroma is what gives way, so that the tone the
 * contrast rests on and the hue that says who is speaking both come through untouched.
 */
export function lchToRgb(lch: Lch): [number, number, number] {
  if (inGamut(lchToRawRgb(lch))) return clamp(lchToRawRgb(lch));

  let low = 0;
  let high = lch.chroma;
  for (let i = 0; i < 20; i++) {
    const mid = (low + high) / 2;
    if (inGamut(lchToRawRgb({ ...lch, chroma: mid }))) low = mid;
    else high = mid;
  }
  return clamp(lchToRawRgb({ ...lch, chroma: low }));
}

function clamp([r, g, b]: [number, number, number]): [number, number, number] {
  return [r, g, b].map((c) => Math.min(1, Math.max(0, c))) as [number, number, number];
}

/** Writes channels from 0 to 1 as a CSS `rgb()` colour, clamping each into range first. */
export function rgbToCss([r, g, b]: [number, number, number]): string {
  const byte = (c: number) => Math.round(Math.min(1, Math.max(0, c)) * 255);
  return `rgb(${byte(r)},${byte(g)},${byte(b)})`;
}
