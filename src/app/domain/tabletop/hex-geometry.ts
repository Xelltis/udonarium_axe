/**
 * The geometry shared by the hex grids.
 *
 * Terms:
 *   the circumradius is the distance from the centre of a hex to a corner
 *   the cell size is the distance between opposite sides
 *   flat-topped hexes line their columns up vertically
 *   pointy-topped hexes line their rows up horizontally
 */

import { PERF_HEX_CELL_SCAN, perfCounters } from '@axe/core/util/perf-counters';
import { GridType } from '@axe/domain/tabletop/grid-type';

/**
 * The distance from a hex's centre to a corner, for a grid whose cell size is measured across the
 * flats.
 */
export function hexCircumradius(gridSize: number): number {
  return gridSize / Math.sqrt(3);
}

/** Whether the grid is the flat-topped hex grid, whose columns line up vertically. */
export function isFlatTopGrid(gridType: GridType): boolean {
  return gridType === GridType.HEX_VERTICAL;
}

/** Whether the grid is one of the two hex grids rather than squares. */
export function isHexGrid(gridType: GridType): boolean {
  return gridType === GridType.HEX_VERTICAL || gridType === GridType.HEX_HORIZONTAL;
}

export interface HexSpacing {
  colSpacing: number;
  rowSpacing: number;
}

/** How far apart neighbouring hex centres sit along the columns and along the rows. */
export function hexSpacing(gridSize: number, isFlatTop: boolean): HexSpacing {
  const s = hexCircumradius(gridSize);
  return isFlatTop ? { colSpacing: 1.5 * s, rowSpacing: gridSize } : { colSpacing: gridSize, rowSpacing: 1.5 * s };
}

/**
 * The angle of a hex's first corner, in radians: 0 for flat-topped hexes, a quarter turn back for
 * pointy-topped ones.
 */
export function hexStartAngle(isFlatTop: boolean): number {
  return isFlatTop ? 0 : -Math.PI / 2;
}

/** The measurements every cell of one hex grid shares. */
export interface HexLayout {
  readonly gridSize: number;
  readonly isFlatTop: boolean;
  readonly circumradius: number;
  readonly colSpacing: number;
  readonly rowSpacing: number;
  readonly startAngle: number;
}

const LAYOUT_CACHE_LIMIT = 32;
const flatTopLayouts = new Map<number, HexLayout>();
const pointyTopLayouts = new Map<number, HexLayout>();

/**
 * The spacing, circumradius and first corner of a hex grid, worked out once for each cell size.
 *
 * The values are exactly what {@link hexSpacing}, {@link hexCircumradius} and {@link hexStartAngle}
 * give. Only a size a table can have is remembered; zero, a negative size or one that is not a
 * number is worked out afresh on every call, so a size read before its real value arrived is never
 * kept.
 */
export function hexLayoutOf(gridSize: number, isFlatTop: boolean): HexLayout {
  const layouts = isFlatTop ? flatTopLayouts : pointyTopLayouts;
  const held = layouts.get(gridSize);
  if (held) return held;
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const layout: HexLayout = {
    gridSize,
    isFlatTop,
    circumradius: hexCircumradius(gridSize),
    colSpacing,
    rowSpacing,
    startAngle: hexStartAngle(isFlatTop),
  };
  if (gridSize > 0 && Number.isFinite(gridSize)) {
    if (layouts.size >= LAYOUT_CACHE_LIMIT) layouts.clear();
    layouts.set(gridSize, layout);
  }
  return layout;
}

interface CornerTable {
  readonly cos: readonly number[];
  readonly sin: readonly number[];
}

function cornersFrom(startAngle: number): CornerTable {
  const cos: number[] = [];
  const sin: number[] = [];
  for (let i = 0; i < 6; i++) {
    const angle = startAngle + (i * Math.PI) / 3;
    cos.push(Math.cos(angle));
    sin.push(Math.sin(angle));
  }
  return { cos, sin };
}

const FLAT_TOP_CORNERS = cornersFrom(hexStartAngle(true));
const POINTY_TOP_CORNERS = cornersFrom(hexStartAngle(false));

/** The unit offsets of a hex's six corners, kept for the two ways up and worked out for any other turn. */
function cornersOf(startAngle: number): CornerTable {
  if (startAngle === hexStartAngle(true)) return FLAT_TOP_CORNERS;
  if (startAngle === hexStartAngle(false)) return POINTY_TOP_CORNERS;
  return cornersFrom(startAngle);
}

/**
 * The centre of a hex cell in table pixels, with odd columns (flat-topped) or odd rows
 * (pointy-topped) shifted by half a step.
 */
export function hexCellCenter(
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
 * The offsets of a hex's six corners from its centre, clockwise, for a cell of this circumradius.
 *
 * The same corners `hexVertices` lays around a centre, for a drawing that wants them on their own.
 */
export function hexCornerOffsets(s: number, isFlatTop: boolean): { x: number; y: number }[] {
  const { cos, sin } = cornersOf(hexStartAngle(isFlatTop));
  const offsets: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    offsets.push({ x: s * cos[i], y: s * sin[i] });
  }
  return offsets;
}

/** The corners come back clockwise. */
export function hexVertices(cx: number, cy: number, s: number, startAngle: number): { x: number; y: number }[] {
  const { cos, sin } = cornersOf(startAngle);
  const verts: { x: number; y: number }[] = [];
  for (let i = 0; i < 6; i++) {
    verts.push({ x: cx + s * cos[i], y: cy + s * sin[i] });
  }
  return verts;
}

/**
 * How near a cell boundary a point may be, as a share of half a cell, before rounding alone is not
 * trusted to name its cell. Far above what rounding can get wrong, and far below a pixel.
 */
const HEX_ROUND_TOLERANCE = 1e-9;

/**
 * The column and row of the hex whose centre is nearest a point in table pixels.
 *
 * The answer is not held to the table, so it can be negative or past the last cell.
 *
 * The point is rounded to the nearest hex directly. Only a point that lies on or within a hair of
 * a boundary between cells is settled by comparing the centres around it, which is also what decides
 * a tie: the cell with the smallest column, then the smallest row, wins it.
 */
export function pixelToHexCell(
  px: number,
  py: number,
  gridSize: number,
  isFlatTop: boolean
): { col: number; row: number } {
  const { colSpacing, rowSpacing } = hexLayoutOf(gridSize, isFlatTop);
  const colEst = px / colSpacing;
  const rowEst = py / rowSpacing;

  const x = isFlatTop ? colEst : colEst - rowEst / 2;
  const z = isFlatTop ? rowEst - colEst / 2 : rowEst;
  const y = -x - z;
  let rx = Math.round(x);
  let ry = Math.round(y);
  let rz = Math.round(z);
  const dx = Math.abs(rx - x);
  const dy = Math.abs(ry - y);
  const dz = Math.abs(rz - z);
  if (dx > dy && dx > dz) rx = -ry - rz;
  else if (dy > dz) ry = -rx - rz;
  else rz = -rx - ry;

  // How far inside its cell the point lies, where 1 is the centre and 0 a boundary. NaN, which
  // anything not a number comes out as, fails the comparison and goes to the scan.
  const ex = x - rx;
  const ey = y - ry;
  const ez = z - rz;
  const inside = 1 - Math.max(Math.abs(ex - ey), Math.abs(ey - ez), Math.abs(ez - ex));
  if (inside > HEX_ROUND_TOLERANCE * (1 + Math.abs(colEst) + Math.abs(rowEst))) {
    const col = isFlatTop ? rx : rx + Math.floor(rz / 2);
    const row = isFlatTop ? rz + Math.floor(rx / 2) : rz;
    return { col: col + 0, row: row + 0 };
  }

  perfCounters.bump(PERF_HEX_CELL_SCAN);
  return scanNearestHexCell(px, py, colSpacing, rowSpacing, colEst, rowEst, isFlatTop);
}

/** The nearest hex centre to a point, found by comparing the candidates around its estimated cell. */
function scanNearestHexCell(
  px: number,
  py: number,
  colSpacing: number,
  rowSpacing: number,
  colEst: number,
  rowEst: number,
  isFlatTop: boolean
): { col: number; row: number } {
  let bestCol = 0;
  let bestRow = 0;
  let bestDist = Infinity;
  for (let col = Math.floor(colEst) - 1; col <= Math.ceil(colEst) + 1; col++) {
    for (let row = Math.floor(rowEst) - 1; row <= Math.ceil(rowEst) + 1; row++) {
      const { x, y } = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
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

/** Anything a hex outline can be traced onto: a canvas context, or a Path2D kept to draw later. */
export interface HexPathSink {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  closePath(): void;
}

/** Traces one hex outline from its first corner round to its last, and closes it. */
export function traceHexPath(sink: HexPathSink, cx: number, cy: number, s: number, startAngle: number): void {
  const { cos, sin } = cornersOf(startAngle);
  sink.moveTo(cx + s * cos[0], cy + s * sin[0]);
  for (let i = 1; i < 6; i++) {
    sink.lineTo(cx + s * cos[i], cy + s * sin[i]);
  }
  sink.closePath();
}

/** Outlines one hex on a canvas with the context's current stroke style. */
export function strokeHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  traceHexPath(context, cx, cy, s, startAngle);
  context.stroke();
}

/** Fills one hex on a canvas with the context's current fill style. */
export function fillHexPath(
  context: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  s: number,
  startAngle: number
): void {
  context.beginPath();
  traceHexPath(context, cx, cy, s, startAngle);
  context.fill();
}
