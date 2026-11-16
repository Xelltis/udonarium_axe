import { GridType } from '@axe/domain/tabletop/grid-type';
import { hexCellCenter, hexSpacing, isFlatTopGrid, isHexGrid, pixelToHexCell } from '@axe/domain/tabletop/hex-geometry';
import { isLengthUnit, MoveUnit } from '@axe/domain/tabletop/move/move-units';
import type { RulerMeasurement } from '@axe/domain/tabletop/ruler/ruler-measure';
import type { Vec3 } from '@axe/domain/tabletop/surface-space';

/**
 * One end of a ruler, in table pixels: x east, y south and z up off the table. An end held to a piece
 * names it, and stands at the middle of its feet; how far it is lifted off them is kept apart, so it
 * keeps that height as the piece moves.
 */
export interface RulerEnd {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** The piece the end is held to, or none for an end on a point of the table. */
  readonly piece?: string;
  /** For an end held to a piece, how far over its feet it stands, in table pixels. */
  readonly lift?: number;
}

/** A ruler laid between two ends. */
export interface RulerLine {
  readonly from: RulerEnd;
  readonly to: RulerEnd;
}

/** What a ruler's lengths are said in: squares, or the room's unit of length where it has one. */
export type RulerUnit = 'square' | 'metre' | 'foot';

/**
 * A ruler as it is said on the screen: its straight length, its length along the table and how far
 * up its far end is, each to a tenth of the unit they are said in, and the squares it steps over.
 */
export interface RulerReading {
  readonly unit: RulerUnit;
  readonly straight: string;
  readonly level: string;
  /** How far up the far end is, with its sign: `+4.0`, `-1.5`, or `0.0` level. */
  readonly rise: string;
  readonly steps: number | null;
}

/**
 * The middle of the square a point of the table lies in, as a ruler's end keeps to on a table that
 * snaps: of the squares movement and range are counted in, or of the hexagons; the point itself on a
 * table with no grid.
 */
export function squareMiddleOf(
  point: { readonly x: number; readonly y: number },
  squarePx: number,
  gridType: GridType
): { x: number; y: number } {
  if (gridType === GridType.NONE || !(squarePx > 0)) return { x: point.x, y: point.y };
  if (isHexGrid(gridType)) {
    const flatTop = isFlatTopGrid(gridType);
    const { col, row } = pixelToHexCell(point.x, point.y, squarePx, flatTop);
    const { colSpacing, rowSpacing } = hexSpacing(squarePx, flatTop);
    return hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
  }
  return {
    x: Math.floor(point.x / squarePx) * squarePx + squarePx / 2,
    y: Math.floor(point.y / squarePx) * squarePx + squarePx / 2,
  };
}

/**
 * How a measurement is said: in metres or feet where the room counts its squares in one of them,
 * each square as long as the room says, and in squares otherwise, or where the room gives a square
 * no length.
 */
export function rulerReadingOf(measured: RulerMeasurement, cellDistance: number, unit: MoveUnit | null): RulerReading {
  const inLength = isLengthUnit(unit) && Number.isFinite(cellDistance) && cellDistance > 0;
  const scale = inLength ? cellDistance : 1;
  const tenth = (value: number) => (Math.round(value * scale * 10) / 10).toFixed(1);
  const rise = Math.round(measured.rise * scale * 10) / 10;
  return {
    unit: inLength ? unit : 'square',
    straight: tenth(measured.straight),
    level: tenth(measured.level),
    rise: rise > 0 ? `+${rise.toFixed(1)}` : rise < 0 ? rise.toFixed(1) : '0.0',
    steps: measured.steps,
  };
}

/** Where an end of a ruler stands, as a point. */
export function rulerPoint(end: RulerEnd): Vec3 {
  return { x: end.x, y: end.y, z: end.z };
}

/**
 * A ruler written as text for passing on to the rest of the table: each end as its three places and
 * the piece it is held to and how far over it, the places to a tenth of a pixel.
 */
export function encodeRulerLine(line: RulerLine | null): string {
  if (!line) return '';
  const end = (at: RulerEnd) => [
    round(at.x),
    round(at.y),
    round(at.z),
    ...(at.piece ? [at.piece, round(at.lift ?? 0)] : []),
  ];
  return JSON.stringify([end(line.from), end(line.to)]);
}

/** A ruler read back from the text {@link encodeRulerLine} writes, or null for none or for text that is not one. */
export function decodeRulerLine(text: string | null | undefined): RulerLine | null {
  if (!text) return null;
  let read: unknown;
  try {
    read = JSON.parse(text);
  } catch {
    return null;
  }
  if (!Array.isArray(read) || read.length !== 2) return null;
  const from = endOf(read[0]);
  const to = endOf(read[1]);
  return from && to ? { from, to } : null;
}

function endOf(value: unknown): RulerEnd | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const [x, y, z, piece, lift] = value as unknown[];
  if (![x, y, z].every((place) => typeof place === 'number' && Number.isFinite(place))) return null;
  const at = { x: x as number, y: y as number, z: z as number };
  if (typeof piece !== 'string' || !piece) return at;
  return { ...at, piece, lift: typeof lift === 'number' && Number.isFinite(lift) ? lift : 0 };
}

/** A place to a tenth of a pixel, with no negative nought. */
function round(value: number): number {
  const rounded = Math.round(value * 10) / 10;
  return rounded === 0 ? 0 : rounded;
}
