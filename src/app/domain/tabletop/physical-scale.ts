/**
 * Turning a screen into a real tabletop.
 *
 * A miniature stands on a one inch base, so a square has to measure 25.4mm on the glass.
 * How many pixels that is depends on the panel, which nothing in the browser will tell us,
 * so it is measured once by holding a card against the screen. Everything here is the
 * arithmetic between that measurement and the zoom the table is already drawn at.
 */

/** ISO/IEC 7810 ID-1: the shape every credit card is cut to. */
export const ID1_CARD_WIDTH_MM = 85.6;
export const ID1_CARD_HEIGHT_MM = 53.98;

/** The perspective the table is drawn under. The zoom follows from it. */
export const TABLE_PERSPECTIVE_PX = 3000;

/** One inch, the base a miniature stands on. */
export const DEFAULT_CELL_MM = 25.4;

/** What one press of the fine adjustment moves the scale by. */
export const SCALE_NUDGE_RATIO = 0.002;

const MIN_PX_PER_MM = 0.5;
const MAX_PX_PER_MM = 40;
const MIN_CELL_MM = 5;
const MAX_CELL_MM = 200;
const MIN_ZOOM = 0.05;
const MAX_ZOOM = 20;
const MM_PER_INCH = 25.4;

function clamp(value: number, low: number, high: number): number {
  return value < low ? low : value > high ? high : value;
}

/** How wide a run of cards laid edge to edge measures. */
export function cardRunWidthMm(cards: number): number {
  return Math.max(1, Math.round(cards)) * ID1_CARD_WIDTH_MM;
}

/** What the measurement says about the panel: the frame matched a known width. */
export function pxPerMmFromCardRun(framePx: number, cards: number): number {
  return clampPxPerMm(framePx / cardRunWidthMm(cards));
}

export function isPxPerMm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && MIN_PX_PER_MM <= value && value <= MAX_PX_PER_MM;
}

export function clampPxPerMm(value: number): number {
  return Number.isFinite(value) ? clamp(value, MIN_PX_PER_MM, MAX_PX_PER_MM) : MIN_PX_PER_MM;
}

export function clampCellMm(value: number): number {
  return Number.isFinite(value) ? clamp(value, MIN_CELL_MM, MAX_CELL_MM) : DEFAULT_CELL_MM;
}

/** The familiar number to show back, since panels are sold by dpi rather than by px/mm. */
export function dotsPerInch(pxPerMm: number): number {
  return clampPxPerMm(pxPerMm) * MM_PER_INCH;
}

/** How wide one square comes out on the glass, in CSS pixels. */
export function cellWidthPx(cellMm: number, pxPerMm: number): number {
  return clampCellMm(cellMm) * clampPxPerMm(pxPerMm);
}

/**
 * The same width in inches, which is the unit a miniature's base is sold in.
 *
 * Reading "25.4mm" tells you nothing about whether a D&D base will sit on the square;
 * reading "1.00 inch" tells you at once.
 */
export function cellWidthInches(cellMm: number): number {
  return clampCellMm(cellMm) / MM_PER_INCH;
}

/**
 * The zoom at which a square measures its real width.
 *
 * The grid keeps its own size in table space, so the scale is carried entirely by the zoom.
 */
export function realSizeZoom(cellMm: number, pxPerMm: number, gridSize: number): number {
  if (!Number.isFinite(gridSize) || gridSize <= 0) return 1;
  return clampZoom(cellWidthPx(cellMm, pxPerMm) / gridSize);
}

export function clampZoom(value: number): number {
  return Number.isFinite(value) ? clamp(value, MIN_ZOOM, MAX_ZOOM) : 1;
}

/** The camera is moved rather than scaled, so the zoom is asked for as a depth. */
export function zoomToViewPositionZ(zoom: number): number {
  return TABLE_PERSPECTIVE_PX * (1 - 1 / clampZoom(zoom));
}

export function viewPositionZToZoom(viewPositionZ: number): number {
  if (!Number.isFinite(viewPositionZ) || TABLE_PERSPECTIVE_PX <= viewPositionZ) return MAX_ZOOM;
  return clampZoom(TABLE_PERSPECTIVE_PX / (TABLE_PERSPECTIVE_PX - viewPositionZ));
}

/** Whether the view is close enough to real size that snapping again would do nothing. */
export function isAtRealSize(viewPositionZ: number, cellMm: number, pxPerMm: number, gridSize: number): boolean {
  const wanted = realSizeZoom(cellMm, pxPerMm, gridSize);
  return Math.abs(viewPositionZToZoom(viewPositionZ) - wanted) < wanted * 0.001;
}

/** The last of the accuracy is settled by eye, against a base sitting on a square. */
export function nudgePxPerMm(pxPerMm: number, steps: number): number {
  if (!Number.isFinite(steps)) return clampPxPerMm(pxPerMm);
  return clampPxPerMm(clampPxPerMm(pxPerMm) * (1 + SCALE_NUDGE_RATIO) ** steps);
}
