import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import { cellCenterOf, CellGrid, cellIndexAt, CellPoint, cellPolygonOf } from '@axe/domain/tabletop/fog/cell-grid';

export interface OutlineSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

const EDGE_PROBE_OVERSHOOT = 1.2;

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
 * Each edge is checked by probing just past its midpoint, which serves square and hex cells alike.
 * Empty for a grid without a size.
 */
export function moveRangeOutline(grid: CellGrid, cells: CellBits): OutlineSegment[] {
  const edges: OutlineSegment[] = [];
  if (grid.sizePx <= 0) return edges;

  for (let index = 0; index < cells.count; index++) {
    if (!cells.get(index)) continue;
    const centre = cellCenterOf(grid, index);
    const corners = cellPolygonOf(grid, index);
    for (let corner = 0; corner < corners.length; corner++) {
      const a = corners[corner];
      const b = corners[(corner + 1) % corners.length];
      const midX = (a.x + b.x) / 2;
      const midY = (a.y + b.y) / 2;
      const beyond = cellIndexAt(
        grid,
        centre.x + (midX - centre.x) * EDGE_PROBE_OVERSHOOT,
        centre.y + (midY - centre.y) * EDGE_PROBE_OVERSHOOT
      );
      if (beyond >= 0 && beyond !== index && cells.get(beyond)) continue;
      edges.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y });
    }
  }
  return edges;
}
