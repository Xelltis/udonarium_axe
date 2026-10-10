import { boardSurfaceOf, surfaceOf, TABLE_SURFACES, TableSurface } from '@axe/domain/tabletop/tabletop-object';

/** The faces the table is drawing at the moment: the walls it shows, and the boards laid on it. */
export interface DrawnSurfaces {
  readonly walls: ReadonlySet<TableSurface>;
  readonly boards: ReadonlySet<string>;
}

export type SurfaceBuckets<T> = Record<TableSurface, T[]>;

/**
 * What stands on each face of the table, with anything nothing would draw put back on the floor.
 *
 * A piece carries the name of the face it was put on, and a face can stop being drawn after it
 * was named: a wall turned off or left without a picture, a board taken off the table, a room
 * loaded from a save whose walls came back differently. The piece is still there either way, so
 * it comes back to the floor rather than being drawn nowhere at all - the floor is always drawn.
 * Nothing is written to the piece: put the wall back and the piece is on it again.
 */
export function bucketBySurface<T extends { location: { surface?: string } }>(
  list: readonly T[],
  drawn: DrawnSurfaces
): SurfaceBuckets<T> {
  const buckets = TABLE_SURFACES.reduce((acc, surface) => {
    acc[surface] = [];
    return acc;
  }, {} as SurfaceBuckets<T>);

  for (const item of list) {
    const board = boardSurfaceOf(item);
    if (board && drawn.boards.has(board)) continue;
    const surface = surfaceOf(item);
    buckets[surface === 'floor' || drawn.walls.has(surface) ? surface : 'floor'].push(item);
  }
  return buckets;
}
