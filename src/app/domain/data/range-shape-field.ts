export type RangeShapeGridType = 'square' | 'hex-vertical' | 'hex-horizontal';

export interface RangeShapeFieldValue {
  name: string;
  cellPattern: string;
  gridType: RangeShapeGridType;
  gridColor: string;
  rangeColor: string;
  isRotatable: boolean;
}

const DEFAULT_GRID_COLOR = '#FFFF00';
const DEFAULT_RANGE_COLOR = '#000000';
const VALID_GRID_TYPES: ReadonlySet<RangeShapeGridType> = new Set(['square', 'hex-vertical', 'hex-horizontal']);

/** Whether a value names one of the grids a range shape can be drawn on: square, or hex in either orientation. */
export function isRangeShapeGridType(value: unknown): value is RangeShapeGridType {
  return typeof value === 'string' && VALID_GRID_TYPES.has(value as RangeShapeGridType);
}

/** Writes a range shape as the JSON text stored in a range-shape field, filling missing colours with defaults. */
export function encodeRangeShapeField(value: RangeShapeFieldValue): string {
  return JSON.stringify({
    name: value.name ?? '',
    cellPattern: value.cellPattern ?? '',
    gridType: value.gridType,
    gridColor: value.gridColor ?? DEFAULT_GRID_COLOR,
    rangeColor: value.rangeColor ?? DEFAULT_RANGE_COLOR,
    isRotatable: value.isRotatable === true,
  });
}

/**
 * Reads a range shape back from a range-shape field's stored text.
 *
 * Returns null for an empty field, text that is not JSON, or a missing or unknown grid type. Other missing
 * or mistyped properties fall back to their defaults.
 */
export function decodeRangeShapeField(raw: unknown): RangeShapeFieldValue | null {
  if (raw == null) return null;
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const obj = parsed as Record<string, unknown>;
  const gridType = obj.gridType;
  if (!isRangeShapeGridType(gridType)) return null;
  return {
    name: typeof obj.name === 'string' ? obj.name : '',
    cellPattern: typeof obj.cellPattern === 'string' ? obj.cellPattern : '',
    gridType,
    gridColor: typeof obj.gridColor === 'string' ? obj.gridColor : DEFAULT_GRID_COLOR,
    rangeColor: typeof obj.rangeColor === 'string' ? obj.rangeColor : DEFAULT_RANGE_COLOR,
    isRotatable: obj.isRotatable === true,
  };
}

/** A blank, non-rotatable range shape on a square grid, used when a field has no shape yet. */
export function defaultRangeShapeFieldValue(): RangeShapeFieldValue {
  return {
    name: '',
    cellPattern: '',
    gridType: 'square',
    gridColor: DEFAULT_GRID_COLOR,
    rangeColor: DEFAULT_RANGE_COLOR,
    isRotatable: false,
  };
}
