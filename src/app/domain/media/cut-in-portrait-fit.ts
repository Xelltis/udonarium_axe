/**
 * How a character's portrait sits in a cut-in's portrait slot, set once on the sheet for each of
 * its portraits and used by every cut-in played for that character.
 *
 * A fit is read against the slot it is shown in, so the same fit serves a slot of any size: at a
 * scale of 1 and no offset the whole picture is shown, as large as the slot holds it and in its
 * middle. The offset is how far the picture's middle stands from the slot's, as a share of the
 * slot's width and height.
 */

/** How a portrait sits in a portrait slot. */
export interface CutInPortraitFit {
  readonly scale: number;
  readonly x: number;
  readonly y: number;
}

/** The whole picture, as large as the slot holds it and in its middle. */
export const WHOLE_PORTRAIT_FIT: CutInPortraitFit = { scale: 1, x: 0, y: 0 };

/** The bounds a fit is held to. */
export const PORTRAIT_FIT_SCALE_MIN = 0.25;
export const PORTRAIT_FIT_SCALE_MAX = 8;
export const PORTRAIT_FIT_OFFSET_MAX = 2;

/** The most portraits a character keeps a fit for. */
export const PORTRAIT_FIT_LIMIT = 32;

/** The size of the slot fits are set against on the sheet: a head and shoulders, as the samples use. */
export const PORTRAIT_FIT_FRAME = { width: 340, height: 400 } as const;

interface PortraitFitsRecord {
  readonly v: 1;
  readonly fits: Readonly<Record<string, readonly [number, number, number]>>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function rounded(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/**
 * A fit held to its bounds, or null where any of its numbers is not a finite number, which is how
 * a value written by something else reads.
 */
export function portraitFitOf(scale: unknown, x: unknown, y: unknown): CutInPortraitFit | null {
  if (typeof scale !== 'number' || typeof x !== 'number' || typeof y !== 'number') return null;
  if (!Number.isFinite(scale) || !Number.isFinite(x) || !Number.isFinite(y)) return null;
  return {
    scale: rounded(clamp(scale, PORTRAIT_FIT_SCALE_MIN, PORTRAIT_FIT_SCALE_MAX)),
    x: rounded(clamp(x, -PORTRAIT_FIT_OFFSET_MAX, PORTRAIT_FIT_OFFSET_MAX)),
    y: rounded(clamp(y, -PORTRAIT_FIT_OFFSET_MAX, PORTRAIT_FIT_OFFSET_MAX)),
  };
}

/** A fit as three numbers, the way it is written down. */
export function packPortraitFit(fit: CutInPortraitFit): [number, number, number] {
  return [fit.scale, fit.x, fit.y];
}

/** A fit from the three numbers it is written as, or null for anything else. */
export function unpackPortraitFit(packed: unknown): CutInPortraitFit | null {
  if (!Array.isArray(packed) || packed.length !== 3) return null;
  return portraitFitOf(packed[0], packed[1], packed[2]);
}

/**
 * The fits a character holds, by portrait picture, in the order they were last set. Empty for
 * nothing held and for anything unreadable; a fit that cannot be read is left out.
 */
export function readPortraitFits(held: unknown): ReadonlyMap<string, CutInPortraitFit> {
  const fits = new Map<string, CutInPortraitFit>();
  const text = `${held ?? ''}`;
  if (text.length < 1) return fits;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fits;
  }
  if (typeof parsed !== 'object' || parsed === null) return fits;
  const record = parsed as Partial<PortraitFitsRecord>;
  if (record.v !== 1 || typeof record.fits !== 'object' || record.fits === null) return fits;
  for (const [picture, packed] of Object.entries(record.fits)) {
    const fit = unpackPortraitFit(packed);
    if (picture.length > 0 && fit) fits.set(picture, fit);
  }
  return fits;
}

/** The fit a character holds for one of its portraits, or null where none was set. */
export function portraitFitFor(held: unknown, picture: string): CutInPortraitFit | null {
  if (!picture) return null;
  return readPortraitFits(held).get(picture) ?? null;
}

/**
 * The fits a character holds with these set, written down: a fit for each picture given, or none
 * for a picture given null. Only pictures in `kept`, the character's portraits now, stay, and the
 * ones set longest ago go first past {@link PORTRAIT_FIT_LIMIT}. Empty where none are left.
 */
export function withPortraitFits(
  held: unknown,
  changes: ReadonlyMap<string, CutInPortraitFit | null>,
  kept: readonly string[]
): string {
  const fits = new Map(readPortraitFits(held));
  for (const [picture, fit] of changes) {
    fits.delete(picture);
    const bounded = fit ? portraitFitOf(fit.scale, fit.x, fit.y) : null;
    if (picture && bounded) fits.set(picture, bounded);
  }
  const keep = new Set(kept);
  const left = [...fits].filter(([picture]) => keep.has(picture)).slice(-PORTRAIT_FIT_LIMIT);
  if (left.length < 1) return '';
  const record: PortraitFitsRecord = {
    v: 1,
    fits: Object.fromEntries(left.map(([picture, fit]) => [picture, packPortraitFit(fit)])),
  };
  return JSON.stringify(record);
}

/**
 * A fit moved by a share of the slot's width and height.
 */
export function movePortraitFit(fit: CutInPortraitFit, dx: number, dy: number): CutInPortraitFit {
  return portraitFitOf(fit.scale, fit.x + dx, fit.y + dy) ?? fit;
}

/**
 * A fit grown or shrunk by `factor` about a point of the slot, given as its distance from the
 * slot's middle in shares of the slot's width and height, so what is under that point stays there.
 */
export function zoomPortraitFit(
  fit: CutInPortraitFit,
  factor: number,
  at: { readonly x: number; readonly y: number } = { x: 0, y: 0 }
): CutInPortraitFit {
  const scale = clamp(fit.scale * factor, PORTRAIT_FIT_SCALE_MIN, PORTRAIT_FIT_SCALE_MAX);
  const ratio = scale / fit.scale;
  return portraitFitOf(scale, at.x - (at.x - fit.x) * ratio, at.y - (at.y - fit.y) * ratio) ?? fit;
}

/**
 * The CSS transform that sets a picture shown whole in the slot, scaled about its middle, where
 * the fit puts it.
 */
export function portraitFitTransform(fit: CutInPortraitFit): string {
  return `translate(${rounded(fit.x * 100)}%, ${rounded(fit.y * 100)}%) scale(${fit.scale})`;
}
