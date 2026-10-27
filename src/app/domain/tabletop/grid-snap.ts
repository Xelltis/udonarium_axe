import { GridSnapStyle, GridType } from '@axe/domain/tabletop/game-table';
import { isFlatTopGrid, isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import {
  hexCellCenter,
  hexCornerOffsets,
  hexLayoutOf,
  hexSpacing,
  hexStartAngle,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';

/**
 * Rounds a coordinate to the nearest multiple of `interval`, halves going away from zero.
 *
 * A zero or negative interval leaves the number as it is.
 */
export function calcSnapNum(num: number, interval: number): number {
  if (interval <= 0) return num;
  const adjusted = num < 0 ? num - interval / 2 : num + interval / 2;
  return adjusted - (adjusted % interval);
}

/**
 * The top-left corner that puts a piece's anchor on the centre of the nearest hex cell.
 *
 * The anchor lies `halfWidth` / `halfHeight` in from the corner, the piece's middle by default.
 * `HEX_VERTICAL` lays the hexes flat-topped.
 */
export function calcHexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = isFlatTopGrid(gridType);
  const { colSpacing, rowSpacing } = hexLayoutOf(gridSize, isFlatTop);
  const { col, row } = pixelToHexCell(posX, posY, gridSize, isFlatTop);
  const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);

  return { x: x - halfWidth, y: y - halfHeight };
}

/** The top-left corner that puts a piece's anchor on the nearest corner of a hex cell. */
export function calcHexVertexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = isFlatTopGrid(gridType);
  const { circumradius, colSpacing, rowSpacing } = hexLayoutOf(gridSize, isFlatTop);
  const corners = hexCornerOffsets(circumradius, isFlatTop);

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (const corner of corners) {
        const vx = cx + corner.x;
        const vy = cy + corner.y;
        const dx = posX - vx;
        const dy = posY - vy;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = vx;
          bestY = vy;
        }
      }
    }
  }

  return { x: bestX - halfWidth, y: bestY - halfHeight };
}

/**
 * The top-left corner that puts a piece's anchor on the nearer of a hex cell's centre and corner.
 *
 * When both are equally near, the centre wins.
 */
export function calcHexBothSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const center = calcHexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const vertex = calcHexVertexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);

  const dcx = posX - (center.x + halfWidth);
  const dcy = posY - (center.y + halfHeight);
  const dvx = posX - (vertex.x + halfWidth);
  const dvy = posY - (vertex.y + halfHeight);

  return dcx * dcx + dcy * dcy <= dvx * dvx + dvy * dvy ? center : vertex;
}

/** The top-left corner that puts a piece's anchor on the middle of the nearest hex edge. */
export function calcHexEdgeMidpointSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = isFlatTopGrid(gridType);
  const startAngle = hexStartAngle(isFlatTop);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  // inradius = gridSize / 2
  const edgeDist = gridSize / 2;

  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;

  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;

  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (let k = 0; k < 6; k++) {
        const angle = startAngle + (k + 0.5) * (Math.PI / 3);
        const mx = cx + edgeDist * Math.cos(angle);
        const my = cy + edgeDist * Math.sin(angle);
        const dx = posX - mx;
        const dy = posY - my;
        const dist = dx * dx + dy * dy;
        if (dist < bestDist) {
          bestDist = dist;
          bestX = mx;
          bestY = my;
        }
      }
    }
  }

  return { x: bestX - halfWidth, y: bestY - halfHeight };
}

/**
 * The top-left corner that puts a piece's anchor on the nearest hex centre, corner or edge middle.
 *
 * Ties go to the centre first, then the corner.
 */
export function calcHexAllSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const center = calcHexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const vertex = calcHexVertexSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);
  const edge = calcHexEdgeMidpointSnapPosition(posX, posY, gridSize, gridType, halfWidth, halfHeight);

  const dcx = posX - (center.x + halfWidth);
  const dcy = posY - (center.y + halfHeight);
  const dvx = posX - (vertex.x + halfWidth);
  const dvy = posY - (vertex.y + halfHeight);
  const dex = posX - (edge.x + halfWidth);
  const dey = posY - (edge.y + halfHeight);

  const dc = dcx * dcx + dcy * dcy;
  const dv = dvx * dvx + dvy * dvy;
  const de = dex * dex + dey * dey;

  if (dc <= dv && dc <= de) return center;
  if (dv <= de) return vertex;
  return edge;
}

/** What snapping a piece to the grid goes by: where it is, how big it is and how the grid is laid. */
export interface GridSnapInput {
  /** Where the piece's corner is now, in px. */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly gridSize: number;
  readonly gridType: GridType;
  readonly snapStyle: GridSnapStyle;
  /**
   * The point of the piece put on the grid, from its corner: its middle on hexes, and its corner
   * on squares snapped to their middles, where none is given.
   */
  readonly origin?: { readonly x: number; readonly y: number };
}

/**
 * Where a piece's corner goes, snapped to the grid as its snap style asks: the middle of a cell, a
 * corner where cells meet, either of them, or on squares the middle of an edge as well, whichever
 * is nearest.
 */
export function gridSnapPosition(input: GridSnapInput): { x: number; y: number } {
  const { x, y, width, height, gridSize, gridType, snapStyle, origin } = input;
  if (isHexGrid(gridType)) {
    const originX = origin?.x ?? width / 2;
    const originY = origin?.y ?? height / 2;
    const hexSnap =
      snapStyle === GridSnapStyle.VERTEX
        ? calcHexVertexSnapPosition
        : snapStyle === GridSnapStyle.BOTH
          ? calcHexBothSnapPosition
          : snapStyle === GridSnapStyle.ALL
            ? calcHexAllSnapPosition
            : calcHexSnapPosition;
    return hexSnap(x + originX, y + originY, gridSize, gridType, originX, originY);
  }
  if (snapStyle === GridSnapStyle.ALL) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    const half = gridSize / 2;
    const candidates = [
      // The cell: its corner on the grid.
      { x: calcSnapNum(x, gridSize), y: calcSnapNum(y, gridSize) },
      // A corner where cells meet: its middle on a grid intersection.
      { x: calcSnapNum(centerX, gridSize) - width / 2, y: calcSnapNum(centerY, gridSize) - height / 2 },
      // The middle of an edge across: its middle half a cell along and on a line.
      {
        x: calcSnapNum(centerX - half, gridSize) + half - width / 2,
        y: calcSnapNum(centerY, gridSize) - height / 2,
      },
      // The middle of an edge down.
      {
        x: calcSnapNum(centerX, gridSize) - width / 2,
        y: calcSnapNum(centerY - half, gridSize) + half - height / 2,
      },
    ];
    let best = candidates[0];
    let bestDist = Infinity;
    for (const candidate of candidates) {
      const dist = (x - candidate.x) ** 2 + (y - candidate.y) ** 2;
      if (dist < bestDist) {
        bestDist = dist;
        best = candidate;
      }
    }
    return best;
  }
  if (snapStyle === GridSnapStyle.VERTEX || snapStyle === GridSnapStyle.BOTH) {
    const vertex = {
      x: calcSnapNum(x + width / 2, gridSize) - width / 2,
      y: calcSnapNum(y + height / 2, gridSize) - height / 2,
    };
    if (snapStyle === GridSnapStyle.VERTEX) return vertex;
    const cell = { x: calcSnapNum(x, gridSize), y: calcSnapNum(y, gridSize) };
    return (x - cell.x) ** 2 + (y - cell.y) ** 2 <= (x - vertex.x) ** 2 + (y - vertex.y) ** 2 ? cell : vertex;
  }
  const originX = origin?.x ?? 0;
  const originY = origin?.y ?? 0;
  return { x: calcSnapNum(x + originX, gridSize) - originX, y: calcSnapNum(y + originY, gridSize) - originY };
}
