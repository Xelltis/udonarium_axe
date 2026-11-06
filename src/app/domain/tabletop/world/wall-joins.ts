import { hexSideStepsAt } from '@axe/domain/tabletop/cell-steps';
import { cellCenterOf, cellColRow, type CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/** A block a wall may be joined to: the cells it stands on, the model it is drawn as, and whether it is a door. */
export interface JoinableBlock {
  readonly owner: string;
  readonly model: string;
  readonly door: boolean;
  readonly cells: readonly number[];
}

/** One way a cell of wall reaches out from its middle: the way it turns to, in degrees clockwise from east, and how far, in table pixels. */
export interface WallArm {
  readonly deg: number;
  readonly lengthPx: number;
}

/** One cell of a block drawn as a joined wall: its middle, in table pixels, and the arms it reaches out with. */
export interface WallJoinCell {
  readonly x: number;
  readonly y: number;
  readonly arms: readonly WallArm[];
}

/** The four sides of a square, east first and on round clockwise. */
const SQUARE_SIDES: readonly (readonly [number, number])[] = [
  [1, 0],
  [0, 1],
  [-1, 0],
  [0, -1],
];

/** How finely the way an arm turns is kept, so that a scene worked out again compares the same. */
const DEG_PLACES = 1000;

/**
 * How each block drawn as a wall reaches out to the walls beside it: from the middle of every cell it
 * stands on, an arm to each side of the cell where a block drawn as the same model stands, or a door,
 * as far as the side, so that its runs meet at their corners and at their junctions and run on into
 * the doors hung in them, on squares and on hexes alike. A block that reaches out to nothing is left
 * out, as are the doors, which are drawn as they hang.
 */
export function wallJoinsOf(grid: CellGrid, blocks: readonly JoinableBlock[]): Map<string, WallJoinCell[]> {
  const joins = new Map<string, WallJoinCell[]>();
  if (!(grid.sizePx > 0)) return joins;
  const byCell = new Map<number, JoinableBlock[]>();
  for (const block of blocks) {
    for (const cell of block.cells) {
      const held = byCell.get(cell);
      if (held) held.push(block);
      else byCell.set(cell, [block]);
    }
  }
  const hex = isHexGrid(grid.type);
  const flatTop = isFlatTopGrid(grid.type);
  for (const block of blocks) {
    if (block.door) continue;
    let reaches = false;
    const cells = block.cells.map((index): WallJoinCell => {
      const middle = cellCenterOf(grid, index);
      const { col, row } = cellColRow(grid, index);
      const arms: WallArm[] = [];
      for (const [dx, dy] of hex ? hexSideStepsAt(flatTop, col, row) : SQUARE_SIDES) {
        const next = cellIndexOf(grid, col + dx, row + dy);
        if (next < 0) continue;
        if (!(byCell.get(next) ?? []).some((other) => other.door || other.model === block.model)) continue;
        const to = cellCenterOf(grid, next);
        const deg = (Math.atan2(to.y - middle.y, to.x - middle.x) * 180) / Math.PI;
        arms.push({
          deg: Math.round(((deg + 360) % 360) * DEG_PLACES) / DEG_PLACES,
          lengthPx: Math.hypot(to.x - middle.x, to.y - middle.y) / 2,
        });
      }
      reaches ||= arms.length > 0;
      return { x: middle.x, y: middle.y, arms };
    });
    if (reaches) joins.set(block.owner, cells);
  }
  return joins;
}
