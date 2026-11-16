/** What of a range its coverage is worked out from, in the units the range keeps. */
export interface RangeShapeInput {
  /** `CIRCLE`, `LINE` or `SQUARE`; any other shape is not worked out. */
  readonly type: string;
  /** How far it reaches, in cells. */
  readonly length: number;
  /** How wide a line is, in cells. */
  readonly width: number;
  /** How far it is turned, in degrees. */
  readonly rotate: number;
  /** Where it stands on the table, in pixels: the middle of a circle or square, the start of a line. */
  readonly origin: { readonly x: number; readonly y: number };
}

/** The shapes whose coverage is worked out. */
export const COVERED_RANGE_TYPES: readonly string[] = ['CIRCLE', 'LINE', 'SQUARE'];

/** The shapes that can be turned; a drawn shape says for itself whether it can. */
export const ROTATABLE_RANGE_TYPES: readonly string[] = [
  'LINE',
  'CORN',
  'SQUARE',
  'RHOMBUS',
  'TRIANGLE',
  'PENTAGON',
  'HEXAGON',
];

/** The shapes that can follow a character about, which are the ones spread round a point. */
export const FOLLOWABLE_RANGE_TYPES: readonly string[] = [
  'CIRCLE',
  'SQUARE',
  'RHOMBUS',
  'TRIANGLE',
  'PENTAGON',
  'HEXAGON',
];

/** The shapes turned by one handle held out past the shape, rather than by handles along it. */
export const SINGLE_GRAB_RANGE_TYPES: readonly string[] = [
  'SQUARE',
  'RHOMBUS',
  'TRIANGLE',
  'PENTAGON',
  'HEXAGON',
  'CUSTOM',
];

/** How far past an edge a point may stand and still be in, in pixels: the edge counts as in. */
const ON_EDGE_PX = 1e-6;

/**
 * Whether a point on the table lies in a range, its edge included; null for a shape this does not
 * work out. The range is measured as it is drawn: at least one cell long, and a line at least a tenth
 * of a cell wide.
 */
export function rangeCovers(range: RangeShapeInput, gridSize: number, point: { x: number; y: number }): boolean | null {
  if (!COVERED_RANGE_TYPES.includes(range.type)) return null;
  const reach = Math.max(1, range.length) * gridSize;
  const turn = (-range.rotate * Math.PI) / 180;
  const dx = point.x - range.origin.x;
  const dy = point.y - range.origin.y;
  const x = dx * Math.cos(turn) - dy * Math.sin(turn);
  const y = dx * Math.sin(turn) + dy * Math.cos(turn);
  if (range.type === 'CIRCLE') return Math.hypot(x, y) <= reach + ON_EDGE_PX;
  if (range.type === 'SQUARE') return Math.abs(x) <= reach + ON_EDGE_PX && Math.abs(y) <= reach + ON_EDGE_PX;
  const half = (Math.max(0.1, range.width) * gridSize) / 2;
  return x >= -ON_EDGE_PX && x <= reach + ON_EDGE_PX && Math.abs(y) <= half + ON_EDGE_PX;
}
