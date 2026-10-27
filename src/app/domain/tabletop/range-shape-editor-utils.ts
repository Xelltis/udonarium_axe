import { CellCoord, cellKey, parseCellPattern } from '@axe/domain/tabletop/cell-pattern';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  hexVertices,
} from '@axe/domain/tabletop/hex-geometry';

export type EditorGridType = 'square' | 'hex-vertical' | 'hex-horizontal';

export interface EditorCellGeometry {
  key: string;
  gx: number;
  gy: number;
  /** CSS-pixel center of this cell in the editor SVG. */
  cx: number;
  cy: number;
  /** Polygon "points" attribute (used for hex cells). */
  hexPoints?: string;
}

export interface EditorBoardGeometry {
  cells: EditorCellGeometry[];
  viewWidth: number;
  viewHeight: number;
}

const DEFAULT_RADIUS = 6;

function squareGeometry(radius: number, gridSize: number): EditorBoardGeometry {
  const cells: EditorCellGeometry[] = [];
  const span = radius * 2 + 1;
  const padding = gridSize / 2;
  const viewWidth = span * gridSize + padding * 2;
  const viewHeight = span * gridSize + padding * 2;
  const originX = padding + radius * gridSize + gridSize / 2;
  const originY = padding + radius * gridSize + gridSize / 2;
  for (let gy = -radius; gy <= radius; gy++) {
    for (let gx = -radius; gx <= radius; gx++) {
      cells.push({
        key: cellKey(gx, gy),
        gx,
        gy,
        cx: originX + gx * gridSize,
        cy: originY + gy * gridSize,
      });
    }
  }
  return { cells, viewWidth, viewHeight };
}

function hexGeometry(radius: number, gridSize: number, isFlatTop: boolean): EditorBoardGeometry {
  const cells: EditorCellGeometry[] = [];
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const s = hexCircumradius(gridSize);
  const startAngle = hexStartAngle(isFlatTop);
  const padding = gridSize / 2;
  const span = radius * 2 + 1;
  const viewWidth = span * colSpacing + padding * 2 + s;
  const viewHeight = span * rowSpacing + padding * 2 + s;
  const originX = viewWidth / 2;
  const originY = viewHeight / 2;
  for (let gy = -radius; gy <= radius; gy++) {
    for (let gx = -radius; gx <= radius; gx++) {
      const { x, y } = hexCellCenter(gx, gy, colSpacing, rowSpacing, isFlatTop);
      const cx = originX + x;
      const cy = originY + y;
      const points = hexVertices(cx, cy, s, startAngle).map(
        (corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`
      );
      cells.push({ key: cellKey(gx, gy), gx, gy, cx, cy, hexPoints: points.join(' ') });
    }
  }
  return { cells, viewWidth, viewHeight };
}

/**
 * The cells of the shape editor's board, laid out for its SVG.
 *
 * The board spans `radius` cells each way from cell (0, 0) at its centre, as squares or as flat-top
 * or pointy-top hexagons, with half a cell of padding round the edge.
 */
export function buildEditorBoardGeometry(
  gridType: EditorGridType,
  radius: number = DEFAULT_RADIUS,
  gridSize: number = 50
): EditorBoardGeometry {
  switch (gridType) {
    case 'hex-vertical':
      return hexGeometry(radius, gridSize, true);
    case 'hex-horizontal':
      return hexGeometry(radius, gridSize, false);
    default:
      return squareGeometry(radius, gridSize);
  }
}

/** Reads `"gx,gy"` cell keys back into cell coordinates, skipping any key that is not two numbers. */
export function cellsFromKeys(keys: Iterable<string>): CellCoord[] {
  const result: CellCoord[] = [];
  for (const key of keys) {
    const parts = key.split(',');
    if (parts.length !== 2) continue;
    const gx = Number(parts[0]);
    const gy = Number(parts[1]);
    if (!Number.isFinite(gx) || !Number.isFinite(gy)) continue;
    result.push({ gx, gy });
  }
  return result;
}

export interface ThumbnailCell {
  /** SVG `points` attribute for hex thumbnails. */
  hexPoints?: string;
  /** Top-left x for square cells. */
  rectX?: number;
  /** Top-left y for square cells. */
  rectY?: number;
  /** Width / height for square cells. */
  rectSize?: number;
}

export interface RangeShapeThumbnail {
  viewBox: string;
  cells: ThumbnailCell[];
  hasCells: boolean;
}

/**
 * Build a small SVG-friendly geometry for a range shape pattern, sized to fit only the painted
 * cells (no empty grid). Suitable for inline character-sheet thumbnails.
 */
export function buildRangeShapeThumbnail(cellPattern: string, gridType: EditorGridType): RangeShapeThumbnail {
  const cells = parseCellPattern(cellPattern);
  if (cells.length === 0) return { viewBox: '0 0 1 1', cells: [], hasCells: false };

  const gridSize = 50;
  const padding = 2;

  if (gridType === 'square') {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const items: ThumbnailCell[] = [];
    for (const cell of cells) {
      const rectX = cell.gx * gridSize;
      const rectY = cell.gy * gridSize;
      items.push({ rectX, rectY, rectSize: gridSize });
      if (rectX < minX) minX = rectX;
      if (rectX + gridSize > maxX) maxX = rectX + gridSize;
      if (rectY < minY) minY = rectY;
      if (rectY + gridSize > maxY) maxY = rectY + gridSize;
    }
    return {
      viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
      cells: items,
      hasCells: true,
    };
  }

  const isFlatTop = gridType === 'hex-vertical';
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const s = hexCircumradius(gridSize);
  const startAngle = hexStartAngle(isFlatTop);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  const items: ThumbnailCell[] = [];
  for (const cell of cells) {
    const { x: cx, y: cy } = hexCellCenter(cell.gx, cell.gy, colSpacing, rowSpacing, isFlatTop);
    const verts = hexVertices(cx, cy, s, startAngle).map((corner) => `${corner.x.toFixed(2)},${corner.y.toFixed(2)}`);
    items.push({ hexPoints: verts.join(' ') });
    if (cx - s < minX) minX = cx - s;
    if (cx + s > maxX) maxX = cx + s;
    if (cy - s < minY) minY = cy - s;
    if (cy + s > maxY) maxY = cy + s;
  }
  return {
    viewBox: `${minX - padding} ${minY - padding} ${maxX - minX + padding * 2} ${maxY - minY + padding * 2}`,
    cells: items,
    hasCells: true,
  };
}
