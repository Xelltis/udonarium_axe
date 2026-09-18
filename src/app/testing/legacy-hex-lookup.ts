import { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import { GridType } from '@axe/domain/tabletop/game-table';

/**
 * The hex lookups exactly as they stood before the hex geometry was reworked for speed.
 *
 * Cell numbers are written into saved rooms and synced between peers, so the reworked code must
 * answer every point the way this did, ties on a boundary included. Specs hold it to these copies,
 * which are deliberately independent of the code under test.
 */

/** How far apart neighbouring hex centres sit along the columns and along the rows. */
export function legacyHexSpacing(gridSize: number, isFlatTop: boolean): { colSpacing: number; rowSpacing: number } {
  const s = gridSize / Math.sqrt(3);
  return isFlatTop ? { colSpacing: 1.5 * s, rowSpacing: gridSize } : { colSpacing: gridSize, rowSpacing: 1.5 * s };
}

/** The centre of a hex cell, with odd columns or odd rows shifted by half a step. */
export function legacyHexCellCenter(
  col: number,
  row: number,
  colSpacing: number,
  rowSpacing: number,
  isFlatTop: boolean
): { x: number; y: number } {
  if (isFlatTop) {
    return {
      x: col * colSpacing,
      y: row * rowSpacing + (Math.abs(col % 2) === 1 ? rowSpacing / 2 : 0),
    };
  }
  return {
    x: col * colSpacing + (Math.abs(row % 2) === 1 ? colSpacing / 2 : 0),
    y: row * rowSpacing,
  };
}

/**
 * The hex whose centre is nearest a point, found by scanning the candidates around it.
 *
 * On an exact tie the first candidate found wins, which is the smallest column and then the
 * smallest row.
 */
export function legacyPixelToHexCell(
  px: number,
  py: number,
  gridSize: number,
  isFlatTop: boolean
): { col: number; row: number } {
  const { colSpacing, rowSpacing } = legacyHexSpacing(gridSize, isFlatTop);
  const colEst = px / colSpacing;
  const rowEst = py / rowSpacing;
  let bestCol = 0;
  let bestRow = 0;
  let bestDist = Infinity;
  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x, y } = legacyHexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      const dx = px - x;
      const dy = py - y;
      const dist = dx * dx + dy * dy;
      if (dist < bestDist) {
        bestDist = dist;
        bestCol = col;
        bestRow = row;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

function isHex(type: GridType): boolean {
  return type === GridType.HEX_VERTICAL || type === GridType.HEX_HORIZONTAL;
}

function legacyCellIndexOf(grid: CellGrid, col: number, row: number): number {
  if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) return -1;
  return row * grid.cols + col;
}

/** The index of the cell under a point, or -1 when the point is off the grid or the grid has no size. */
export function legacyCellIndexAt(grid: CellGrid, x: number, y: number): number {
  if (grid.sizePx <= 0) return -1;
  if (!isHex(grid.type)) {
    return legacyCellIndexOf(grid, Math.floor(x / grid.sizePx), Math.floor(y / grid.sizePx));
  }
  const { col, row } = legacyPixelToHexCell(x, y, grid.sizePx, grid.type === GridType.HEX_VERTICAL);
  return legacyCellIndexOf(grid, col, row);
}

/** The centre of a cell in table pixels, on square and hex grids alike. */
export function legacyCellCenterOf(grid: CellGrid, index: number): { x: number; y: number } {
  const col = index % grid.cols;
  const row = Math.floor(index / grid.cols);
  if (!isHex(grid.type)) return { x: (col + 0.5) * grid.sizePx, y: (row + 0.5) * grid.sizePx };
  const isFlatTop = grid.type === GridType.HEX_VERTICAL;
  const { colSpacing, rowSpacing } = legacyHexSpacing(grid.sizePx, isFlatTop);
  return legacyHexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
}

/** The corners of a cell: four on squares, six on hexes, each hex corner worked out with its own trigonometry. */
export function legacyCellPolygonOf(grid: CellGrid, index: number): { x: number; y: number }[] {
  const centre = legacyCellCenterOf(grid, index);
  if (!isHex(grid.type)) {
    const half = grid.sizePx / 2;
    return [
      { x: centre.x - half, y: centre.y - half },
      { x: centre.x + half, y: centre.y - half },
      { x: centre.x + half, y: centre.y + half },
      { x: centre.x - half, y: centre.y + half },
    ];
  }
  const s = grid.sizePx / Math.sqrt(3);
  const startAngle = grid.type === GridType.HEX_VERTICAL ? 0 : -Math.PI / 2;
  const corners: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    corners.push({ x: centre.x + s * Math.cos(angle), y: centre.y + s * Math.sin(angle) });
  }
  return corners;
}

/** The cells around one, found by probing a cell's width away in eight directions. */
export function legacyForEachNeighbourCell(grid: CellGrid, index: number, visit: (neighbour: number) => void): void {
  if (grid.sizePx <= 0) return;
  const centre = legacyCellCenterOf(grid, index);
  let last = -1;
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const neighbour = legacyCellIndexAt(
      grid,
      centre.x + Math.cos(angle) * grid.sizePx,
      centre.y + Math.sin(angle) * grid.sizePx
    );
    if (neighbour < 0 || neighbour === index || neighbour === last) continue;
    last = neighbour;
    visit(neighbour);
  }
}

/** The top-left corner that put a piece's anchor on the nearest hex centre, found by scanning. */
export function legacyCalcHexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const { colSpacing, rowSpacing } = legacyHexSpacing(gridSize, isFlatTop);
  const { col, row } = legacyPixelToHexCell(posX, posY, gridSize, isFlatTop);
  const { x, y } = legacyHexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
  return { x: x - halfWidth, y: y - halfHeight };
}

/** The top-left corner that put a piece's anchor on the nearest hex corner, each corner worked out afresh. */
export function legacyCalcHexVertexSnapPosition(
  posX: number,
  posY: number,
  gridSize: number,
  gridType: GridType,
  halfWidth: number = gridSize / 2,
  halfHeight: number = gridSize / 2
): { x: number; y: number } {
  const isFlatTop = gridType === GridType.HEX_VERTICAL;
  const s = gridSize / Math.sqrt(3);
  const startAngle = isFlatTop ? 0 : -Math.PI / 2;
  const { colSpacing, rowSpacing } = legacyHexSpacing(gridSize, isFlatTop);
  const colEst = posX / colSpacing;
  const rowEst = posY / rowSpacing;
  let bestX = 0;
  let bestY = 0;
  let bestDist = Infinity;
  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x: cx, y: cy } = legacyHexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      for (let k = 0; k < 6; k++) {
        const angle = startAngle + (k * Math.PI) / 3;
        const vx = cx + s * Math.cos(angle);
        const vy = cy + s * Math.sin(angle);
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
