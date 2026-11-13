/**
 * How many of the screen's pixels a canvas is drawn with for each CSS pixel at the most: any finer
 * costs four times the pixels of the step before for little more to see.
 */
export const MOST_PIXEL_RATIO = 2;

/** The screen's pixel ratio, held to the most a canvas is drawn at, and 1 where the page has none. */
export function cappedPixelRatio(): number {
  return Math.min(MOST_PIXEL_RATIO, globalThis.devicePixelRatio || 1);
}
