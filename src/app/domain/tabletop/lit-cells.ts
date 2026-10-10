import { GridType } from '@axe/domain/tabletop/grid-type';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  hexVertices,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';

export interface LitCellPoint {
  x: number;
  y: number;
}

export interface LitCellShape {
  x: number;
  y: number;
  dimPx: number;
  angle: number;
  direction: number;
  clipPolygon?: LitCellPoint[];
}

export interface LitCellBounds {
  widthPx: number;
  heightPx: number;
}

/**
 * Whether a point lies within a light's reach, inside its cone, and inside its clip polygon when it
 * has one.
 */
export function isPointInLitShape(shape: LitCellShape, x: number, y: number): boolean {
  const dx = x - shape.x;
  const dy = y - shape.y;
  const radius = Math.max(shape.dimPx, 0);
  if (dx * dx + dy * dy > radius * radius) return false;

  if (shape.angle < 360) {
    const bearing = (Math.atan2(dy, dx) * 180) / Math.PI;
    let delta = ((((bearing - shape.direction) % 360) + 540) % 360) - 180;
    delta = Math.abs(delta);
    if (delta > shape.angle / 2) return false;
  }

  const polygon = shape.clipPolygon;
  if (polygon && polygon.length >= 3) return isPointInPolygon(polygon, x, y);

  return true;
}

/** Whether a point lies inside a polygon, by the even-odd rule. */
export function isPointInPolygon(polygon: readonly LitCellPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i];
    const b = polygon[j];
    const straddles = a.y > y !== b.y > y;
    if (!straddles) continue;
    const crossX = ((b.x - a.x) * (y - a.y)) / (b.y - a.y) + a.x;
    if (x < crossX) inside = !inside;
  }
  return inside;
}

/**
 * The outlines of the grid cells whose centres a set of lights reaches, for drawing light snapped
 * to the grid.
 *
 * Each cell comes back once however many lights reach it, and cells off the table are left out.
 */
export function computeLitCells(
  shapes: readonly LitCellShape[],
  gridSize: number,
  gridType: GridType,
  bounds: LitCellBounds
): LitCellPoint[][] {
  if (shapes.length === 0 || gridSize <= 0) return [];
  return isHexGrid(gridType)
    ? hexLitCells(shapes, gridSize, isFlatTopGrid(gridType), bounds)
    : squareLitCells(shapes, gridSize, bounds);
}

function squareLitCells(shapes: readonly LitCellShape[], gridSize: number, bounds: LitCellBounds): LitCellPoint[][] {
  const maxCol = Math.ceil(bounds.widthPx / gridSize) - 1;
  const maxRow = Math.ceil(bounds.heightPx / gridSize) - 1;
  const stride = maxCol + 1;
  const taken = new Set<number>();
  const cells: LitCellPoint[][] = [];

  for (const shape of shapes) {
    const fromCol = Math.max(0, Math.floor((shape.x - shape.dimPx) / gridSize));
    const toCol = Math.min(maxCol, Math.floor((shape.x + shape.dimPx) / gridSize));
    const fromRow = Math.max(0, Math.floor((shape.y - shape.dimPx) / gridSize));
    const toRow = Math.min(maxRow, Math.floor((shape.y + shape.dimPx) / gridSize));

    for (let col = fromCol; col <= toCol; col++) {
      for (let row = fromRow; row <= toRow; row++) {
        const key = row * stride + col;
        if (taken.has(key)) continue;
        const cx = (col + 0.5) * gridSize;
        const cy = (row + 0.5) * gridSize;
        if (!isPointInLitShape(shape, cx, cy)) continue;
        taken.add(key);
        const left = col * gridSize;
        const top = row * gridSize;
        cells.push([
          { x: left, y: top },
          { x: left + gridSize, y: top },
          { x: left + gridSize, y: top + gridSize },
          { x: left, y: top + gridSize },
        ]);
      }
    }
  }

  return cells;
}

function hexLitCells(
  shapes: readonly LitCellShape[],
  gridSize: number,
  isFlatTop: boolean,
  bounds: LitCellBounds
): LitCellPoint[][] {
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const circumradius = hexCircumradius(gridSize);
  const startAngle = hexStartAngle(isFlatTop);
  // A cell whose centre falls off the table is left out below, and a column or row beyond these
  // puts every centre off it: holding the walk to them drops only cells that were being walked
  // over to be thrown away, and keeps the columns and rows within a count that numbers them.
  const maxCol = Math.floor(bounds.widthPx / colSpacing);
  const maxRow = Math.floor(bounds.heightPx / rowSpacing);
  const stride = maxCol + 1;
  const taken = new Set<number>();
  const cells: LitCellPoint[][] = [];

  for (const shape of shapes) {
    const fromCol = Math.max(0, Math.floor((shape.x - shape.dimPx - circumradius) / colSpacing));
    const toCol = Math.min(maxCol, Math.ceil((shape.x + shape.dimPx + circumradius) / colSpacing));
    const fromRow = Math.max(0, Math.floor((shape.y - shape.dimPx - circumradius) / rowSpacing));
    const toRow = Math.min(maxRow, Math.ceil((shape.y + shape.dimPx + circumradius) / rowSpacing));

    for (let col = fromCol; col <= toCol; col++) {
      for (let row = fromRow; row <= toRow; row++) {
        const key = row * stride + col;
        if (taken.has(key)) continue;
        const center = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
        if (center.x < 0 || center.y < 0 || center.x > bounds.widthPx || center.y > bounds.heightPx) continue;
        if (!isPointInLitShape(shape, center.x, center.y)) continue;
        taken.add(key);
        cells.push(hexVertices(center.x, center.y, circumradius, startAngle));
      }
    }
  }

  return cells;
}
