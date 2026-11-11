import {
  cellCenterOf,
  cellColRow,
  type CellGrid,
  forEachCellInBox,
  forEachNeighbourCell,
} from '@axe/domain/tabletop/fog/cell-grid';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';

/** A body of water laid on the table, in table pixels. */
export interface WaterArea {
  readonly identifier: string;
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** How high its own floor stands. */
  readonly floorPx: number;
  /** How high its surface stands, never lower than its floor. */
  readonly surfacePx: number;
  readonly color: string;
  /** How thick the water is drawn, from 0 to 1. */
  readonly density: number;
  /** How murky it is, from 0 for clear to 1 for water nothing can be seen through. */
  readonly turbidity: number;
  /** How dirty it is, from 0 for clean to 1 for water thick with scum. */
  readonly dirt: number;
  /** How much of it floating leaves cover, from 0 to 1. */
  readonly leaves: number;
  /** How fast it flows, from 0 for still to 1, and which way, in degrees clockwise from the top. */
  readonly flowSpeed: number;
  readonly flowDirection: number;
  /** How much of its surface is frozen, from 0 for open water to 1 for ice. */
  readonly ice: number;
}

/** One cell under water. */
export interface WaterCell {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
  /** How high the bottom of the water stands here: its own floor, or the ground risen under it. */
  readonly floorPx: number;
  readonly surfacePx: number;
  /** Whether the bottom here is the water's own level floor rather than ground risen under it. */
  readonly flat: boolean;
  /** How high the water's own floor stands, under whatever ground has risen over it. */
  readonly areaFloorPx: number;
  readonly color: string;
  readonly density: number;
  readonly turbidity: number;
  readonly dirt: number;
  readonly leaves: number;
  readonly flowSpeed: number;
  readonly flowDirection: number;
  readonly ice: number;
  /** The area it belongs to. */
  readonly area: string;
}

/**
 * How far in from the edge of an area a cell's centre has to lie to count, in pixels.
 *
 * An area laid on a hex board by the map editor is a square a cell wide around one hex, and
 * the centres of the hexes beside it lie on its very edge; without the margin they would be
 * counted too, and every pond would spill a cell over its banks.
 */
const EDGE_MARGIN_PX = 0.5;

/** How much ground under the water may differ from its floor and still be the floor, in pixels. */
const LEVEL_PX = 0.5;

/**
 * The cells under water, by index.
 *
 * A cell is under an area when its centre lies inside the area, which on a square board is
 * every cell the area covers and on a hex board every hex whose middle it covers. Where two
 * areas overlap, the cell takes the higher surface: a deep pool cut into a shallow one is deep.
 *
 * The bottom of the water is the ground: where something stands under the water, such as a
 * slope running down from the shore, the water there is only as deep as the surface stands over
 * it, and where the ground rises to the surface or above, the cell is dry land. `groundOf` gives
 * how high the ground stands in a cell, and is left out where the water lies on its own floor.
 * Where the raised ground of the table has been dug below the board and below the water's floor,
 * as a river bed or a pond, the water reaches down to the ground.
 */
export function waterCellsOf(
  grid: CellGrid,
  areas: readonly WaterArea[],
  groundOf: (index: number) => number = () => 0
): Map<number, WaterCell> {
  const cells = new Map<number, WaterCell>();
  for (const area of areas) {
    const surfacePx = Math.max(area.surfacePx, area.floorPx);
    forEachCellInBox(
      grid,
      area.left + EDGE_MARGIN_PX,
      area.top + EDGE_MARGIN_PX,
      area.left + area.width - EDGE_MARGIN_PX,
      area.top + area.height - EDGE_MARGIN_PX,
      (index, cx, cy) => {
        const ground = groundOf(index);
        const risen = ground > area.floorPx + LEVEL_PX;
        const dug = ground < Math.min(0, area.floorPx) - LEVEL_PX;
        if (risen && ground >= surfacePx - LEVEL_PX) return;
        const held = cells.get(index);
        if (held && held.surfacePx >= surfacePx) return;
        cells.set(index, {
          index,
          cx,
          cy,
          floorPx: risen || dug ? ground : area.floorPx,
          surfacePx,
          flat: !risen && !dug,
          areaFloorPx: area.floorPx,
          color: area.color,
          density: area.density,
          turbidity: area.turbidity,
          dirt: area.dirt,
          leaves: area.leaves,
          flowSpeed: area.flowSpeed,
          flowDirection: area.flowDirection,
          ice: area.ice,
          area: area.identifier,
        });
      }
    );
  }
  spillIntoDugGround(grid, cells, groundOf);
  return cells;
}

/**
 * Lets the water run out of its areas into the ground dug below its surface that it touches, cell by
 * cell along their sides, as far as the dug ground runs on: a ditch or a pit dug from a pond fills
 * from it, whether the pond stands on the ground or is sunk into it. The water stands there at the
 * surface of the water it ran from, which the dug ground takes none away from, and is drawn as that
 * water is. Ground not dug, or not below that surface, stays dry, as does a pit the water does not
 * reach. Water an area is laid over stays that area's, its ice and its look with it, though a higher
 * water runs up to it. Corners are not run through on a grid of squares; the sides of a hex are all
 * sides.
 */
function spillIntoDugGround(grid: CellGrid, cells: Map<number, WaterCell>, groundOf: (index: number) => number): void {
  const running = [...cells.values()];
  const laid = new Set(cells.keys());
  const hex = isHexGrid(grid.type);
  for (let at = 0; at < running.length; at++) {
    const from = running[at];
    const here = cellColRow(grid, from.index);
    forEachNeighbourCell(grid, from.index, (index) => {
      if (!hex) {
        const there = cellColRow(grid, index);
        if (there.col !== here.col && there.row !== here.row) return;
      }
      const ground = groundOf(index);
      if (ground >= Math.min(0, from.surfacePx) - LEVEL_PX) return;
      const held = cells.get(index);
      if (held && (laid.has(index) || held.surfacePx >= from.surfacePx)) return;
      const centre = cellCenterOf(grid, index);
      const spilt: WaterCell = { ...from, index, cx: centre.x, cy: centre.y, floorPx: ground, flat: false };
      cells.set(index, spilt);
      running.push(spilt);
    });
  }
}
