import { SurfaceDims, surfacePointTo3D } from '@axe/domain/tabletop/surface-space';
import { boardSurfaceOf, surfaceOf, TabletopLocation } from '@axe/domain/tabletop/tabletop-object';

interface Placed {
  location: TabletopLocation;
}

/**
 * The spot on the table's floor plan to bring into view so that an object on the table shows.
 *
 * An object on a wall is placed along that wall, so its own x and y name no spot on the floor: it
 * is shown at the foot of the wall below it. An object on a board is shown where the board stands,
 * since the board carries it wherever the board goes. Where a board cannot be found, or boards
 * stand on one another in a ring, the last object reached is taken at its own x and y.
 */
export function tableFocusPoint(
  object: Placed,
  dims: SurfaceDims,
  boardOf: (identifier: string) => Placed | null
): { x: number; y: number } {
  const passed = new Set<string>();
  let placed = object;
  for (let board = boardSurfaceOf(placed); board; board = boardSurfaceOf(placed)) {
    const carrier = passed.has(board) ? null : boardOf(board);
    if (!carrier) return { x: placed.location.x, y: placed.location.y };
    passed.add(board);
    placed = carrier;
  }
  const point = surfacePointTo3D(surfaceOf(placed), placed.location.x, placed.location.y, dims);
  return { x: point.x, y: point.y };
}
