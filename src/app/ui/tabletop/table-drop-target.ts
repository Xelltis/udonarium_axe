import type { PointerCoordinate } from '@axe/application/input/pointer-device.service';
import { clamp } from '@axe/core/util/clamp';

const TABLE_LAYER_SELECTOR = '#app-table-layer';

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
  position: PointerCoordinate,
  table: { readonly width: number; readonly height: number; readonly gridSize: number } | null | undefined
): PointerCoordinate {
  if (!table) return position;
  const halfGrid = table.gridSize / 2;
  return {
    x: clamp(position.x, halfGrid, Math.max(halfGrid, table.width * table.gridSize - halfGrid)),
    y: clamp(position.y, halfGrid, Math.max(halfGrid, table.height * table.gridSize - halfGrid)),
    z: Math.max(0, position.z ?? 0),
  };
}
