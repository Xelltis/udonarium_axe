const TABLE_LAYER_SELECTOR = '#app-table-layer';

/** A point dropped on the table, in the board's space. */
export interface DroppedPoint {
  readonly x: number;
  readonly y: number;
  readonly z?: number;
}

/** Whether a drop landed on the table layer, the only place something dropped is put on the table. */
export function isTabletopDropTarget(element: Element | null): boolean {
  return element?.closest(TABLE_LAYER_SELECTOR) != null;
}

/**
 * Where a piece made from a drop is put: the point it landed on, pulled in to lie on the table half a
 * cell in from its edges and never below the floor, so it is not made where it cannot be seen or
 * grabbed. With no table in view, the point as it is.
 */
export function clampToTable(
  position: DroppedPoint,
  table: { readonly width: number; readonly height: number; readonly gridSize: number } | null | undefined
): { x: number; y: number; z: number } {
  if (!table) return { x: position.x, y: position.y, z: position.z ?? 0 };
  const halfGrid = table.gridSize / 2;
  return {
    x: clamp(position.x, halfGrid, table.width * table.gridSize - halfGrid),
    y: clamp(position.y, halfGrid, table.height * table.gridSize - halfGrid),
    z: Math.max(0, position.z ?? 0),
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), Math.max(min, max));
}
