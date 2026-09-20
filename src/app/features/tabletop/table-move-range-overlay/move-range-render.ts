import { hexSideStepsAt, ORTHOGONAL_STEPS } from '@axe/domain/tabletop/cell-steps';
import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellColRow,
  CellGrid,
  cellIndexOf,
  CellPoint,
  cellPolygonOf,
  sameCellGrid,
} from '@axe/domain/tabletop/fog/cell-grid';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';

export interface OutlineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The outline of every marked cell, one polygon per cell, for filling in the area on an overlay.
 */
export function moveRangePolygons(grid: CellGrid, cells: CellBits): CellPoint[][] {
  const polygons: CellPoint[][] = [];
  for (let index = 0; index < cells.count; index++) {
    if (cells.get(index)) polygons.push(cellPolygonOf(grid, index));
  }
  return polygons;
}

/**
 * The edges round the outside of the marked cells, leaving out every edge two marked cells share.
 *
 * Side `i` of a cell runs from corner `i` to corner `i + 1`, and the step tables say which cell
 * lies across it, on squares and on hexes of either bearing. Empty for a grid without a size.
 */
export function moveRangeOutline(grid: CellGrid, cells: CellBits): OutlineSegment[] {
  const edges: OutlineSegment[] = [];
  if (grid.sizePx <= 0) return edges;
  const hex = isHexGrid(grid.type);
  const flatTop = hex && isFlatTopGrid(grid.type);

  for (let index = 0; index < cells.count; index++) {
    if (!cells.get(index)) continue;
    const { col, row } = cellColRow(grid, index);
    const corners = cellPolygonOf(grid, index);
    const steps = hex ? hexSideStepsAt(flatTop, col, row) : ORTHOGONAL_STEPS;
    for (let side = 0; side < corners.length; side++) {
      const [acrossCol, acrossRow] = steps[side];
      const beyond = cellIndexOf(grid, col + acrossCol, row + acrossRow);
      if (beyond >= 0 && cells.get(beyond)) continue;
      const a = corners[side];
      const b = corners[(side + 1) % corners.length];
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return edges;
}

/**
 * A way broken into the runs of it that lie on one layer of the board.
 *
 * The step between two layers belongs to both, so a line drawn a layer at a time climbs the
 * ledge rather than breaking off at the foot of it and picking up again on top.
 */
export function wayRunsOn(way: readonly number[], onLayer: (cell: number) => boolean): number[][] {
  const runs: number[][] = [];
  let run: number[] = [];
  for (let step = 0; step + 1 < way.length; step++) {
    const from = way[step];
    const to = way[step + 1];
    if (onLayer(from) || onLayer(to)) {
      if (run.length < 1) run.push(from);
      run.push(to);
      continue;
    }
    if (run.length > 0) runs.push(run);
    run = [];
  }
  if (run.length > 0) runs.push(run);
  return runs;
}

interface CellPaths {
  grid: CellGrid;
  sizePx: number;
  area: Path2D;
  border: Path2D;
}

const drawn = new WeakMap<CellBits, CellPaths>();

/**
 * The area and the outline of a set of cells, as paths kept against the cells themselves.
 *
 * A reach is drawn again on every repaint - a peer moving their pointer repaints the whole
 * overlay - while the cells behind it hold still, so the paths are traced once and handed back
 * for as long as the same cells are drawn on the same grid.
 *
 * The cells drawn from are taken to stand still: a caller that rewrites a `CellBits` it has
 * already drawn must hand over a new one rather than change that one in place.
 */
export function cellPathsFor(grid: CellGrid, cells: CellBits): { area: Path2D; border: Path2D } {
  const held = drawn.get(cells);
  if (held && sameCellGrid(held.grid, grid) && held.sizePx === grid.sizePx) return held;

  const area = new Path2D();
  for (const polygon of moveRangePolygons(grid, cells)) {
    area.moveTo(polygon[0].x, polygon[0].y);
    for (let corner = 1; corner < polygon.length; corner++) area.lineTo(polygon[corner].x, polygon[corner].y);
    area.closePath();
  }

  const border = new Path2D();
  for (const edge of moveRangeOutline(grid, cells)) {
    border.moveTo(edge.x1, edge.y1);
    border.lineTo(edge.x2, edge.y2);
  }

  const paths: CellPaths = { grid, sizePx: grid.sizePx, area, border };
  drawn.set(cells, paths);
  return paths;
}
