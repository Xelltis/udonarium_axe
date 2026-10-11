import { FirstPersonWorld } from '@axe/domain/tabletop/first-person/first-person-world';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellColRow, cellCount, CellGrid, forEachNeighbourCell } from '@axe/domain/tabletop/fog/cell-grid';
import { blockedByTerrain } from '@axe/domain/tabletop/move/blocked-cells';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain } from '@axe/domain/tabletop/terrain';

/** Where the first-person view is roofed over, and how high. */
export interface FirstPersonRoof {
  /** The cells under the roof. */
  readonly cells: CellBits;
  /** The height of the roof, in table pixels. */
  readonly heightPx: number;
  /**
   * Which room each cell under the roof belongs to: the open ground walls shut in together shares a
   * number, and the walls themselves and anything outside are -1.
   */
  readonly rooms?: Int32Array;
  /** How high the roof stands over a room raised for something tall in it, by the room's number. */
  readonly raised?: ReadonlyMap<number, number>;
}

const NOTHING_RAISED: ReadonlyMap<number, number> = new Map();

/** What stands under the roof: the cell under its middle, and how high its top reaches. */
export interface RoofedStanding {
  readonly cell: number;
  readonly topPx: number;
}

/**
 * The cells that walls shut in: every cell that cannot be reached from the edge of the board
 * without crossing a walled cell, the walls round them included. Ground open to the edge is out
 * under the sky, however many walls stand on it.
 */
export function enclosedCells(grid: CellGrid, walled: CellBits): CellBits {
  const count = cellCount(grid);
  const outside = new CellBits(count);
  const queue: number[] = [];
  for (let cell = 0; cell < count; cell++) {
    if (walled.get(cell)) continue;
    const { col, row } = cellColRow(grid, cell);
    if (col !== 0 && row !== 0 && col !== grid.cols - 1 && row !== grid.rows - 1) continue;
    outside.set(cell);
    queue.push(cell);
  }
  for (let next = 0; next < queue.length; next++) {
    forEachNeighbourCell(grid, queue[next], (neighbour) => {
      if (outside.get(neighbour) || walled.get(neighbour)) return;
      outside.set(neighbour);
      queue.push(neighbour);
    });
  }
  const enclosed = new CellBits(count);
  for (let cell = 0; cell < count; cell++) {
    if (!outside.get(cell)) enclosed.set(cell);
  }
  return enclosed;
}

/**
 * The roof over the ground the board's walls and doors shut in, at the height of the tallest wall
 * on the board, or none where nothing is shut in or there is no wall to rest a roof on.
 *
 * It is worked out from the board alone, not from what the eye happens to see, so turning to face a
 * tower out in the open does not put a roof over the field, and the roof does not rise and fall as
 * the eye turns. A door counts as a wall whether it stands open or shut.
 */
export function firstPersonRoofOf(
  grid: CellGrid,
  terrains: readonly Terrain[],
  world: FirstPersonWorld
): FirstPersonRoof | null {
  const heightPx = world.walls.reduce((top, wall) => (wall.terrain ? Math.max(top, wall.topPx) : top), 0);
  if (heightPx <= 0) return null;
  const walled = blockedByTerrain(
    grid,
    terrains,
    (terrain) => surfaceOf(terrain) === 'floor' && (terrain.hasWall || terrain.isDoor)
  );
  const cells = enclosedCells(grid, walled);
  return cells.isEmpty ? null : { cells, heightPx, rooms: roomsOf(grid, cells, walled) };
}

/**
 * Numbers the rooms the walls shut in: the open cells under the roof that join up without crossing
 * a walled cell share a number. Walled cells and cells outside are -1.
 */
export function roomsOf(grid: CellGrid, roofed: CellBits, walled: CellBits): Int32Array {
  const count = cellCount(grid);
  const rooms = new Int32Array(count).fill(-1);
  let next = 0;
  for (let cell = 0; cell < count; cell++) {
    if (!roofed.get(cell) || walled.get(cell) || rooms[cell] >= 0) continue;
    rooms[cell] = next;
    const queue = [cell];
    for (let index = 0; index < queue.length; index++) {
      forEachNeighbourCell(grid, queue[index], (neighbour) => {
        if (!roofed.get(neighbour) || walled.get(neighbour) || rooms[neighbour] >= 0) return;
        rooms[neighbour] = next;
        queue.push(neighbour);
      });
    }
    next++;
  }
  return rooms;
}

/**
 * The roof with each room's raised clear over the tallest thing standing in it, where that would
 * reach past the roof: `clearancePx` above its top. Other rooms, and the walls, keep the roof as it was.
 */
export function roofRaisedFor(
  roof: FirstPersonRoof | null,
  standing: readonly RoofedStanding[],
  clearancePx: number
): FirstPersonRoof | null {
  if (!roof?.rooms) return roof;
  const raised = new Map<number, number>();
  for (const piece of standing) {
    const room = piece.cell >= 0 ? roof.rooms[piece.cell] : -1;
    if (room < 0) continue;
    const height = piece.topPx + clearancePx;
    if (height > (raised.get(room) ?? roof.heightPx)) raised.set(room, height);
  }
  return raised.size === 0 ? roof : { ...roof, raised };
}

/** How high the roof stands over a cell, raised where the cell's room has been raised. */
export function roofHeightAt(roof: FirstPersonRoof, cell: number): number {
  const room = roof.rooms && cell >= 0 ? roof.rooms[cell] : -1;
  return (room >= 0 ? roof.raised?.get(room) : undefined) ?? roof.heightPx;
}

/**
 * Whether two roofs stand over the same cells at the same heights, room for room, so a roof raised
 * afresh for the same pieces can be taken for the one already drawn.
 */
export function sameRoof(a: FirstPersonRoof | null, b: FirstPersonRoof | null): boolean {
  if (a === b) return true;
  if (!a || !b || a.cells !== b.cells || a.heightPx !== b.heightPx || a.rooms !== b.rooms) return false;
  const raisedA = a.raised ?? NOTHING_RAISED;
  const raisedB = b.raised ?? NOTHING_RAISED;
  if (raisedA.size !== raisedB.size) return false;
  for (const [room, height] of raisedA) {
    if (raisedB.get(room) !== height) return false;
  }
  return true;
}
