import { parseCellPattern, patternCellToWorld, rotateCellPattern } from '@axe/domain/tabletop/cell-pattern';
import { GridType } from '@axe/domain/tabletop/grid-type';
import {
  hexCellCenter,
  hexCircumradius,
  hexSpacing,
  hexStartAngle,
  hexVertices,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';

/** A point on the table, in table pixels: east along x and south along y. */
export interface FlatPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * One convex piece of the ground a range covers, in table pixels: a polygon whose corners run round
 * it, or a circle. A shape that is not convex, as a range of its own cells is, comes in several.
 */
export type FootprintPart =
  | { readonly kind: 'polygon'; readonly corners: readonly FlatPoint[] }
  | { readonly kind: 'circle'; readonly centre: FlatPoint; readonly radius: number };

/** What of a range its ground is worked out from. */
export interface FootprintInput {
  /** The flat shape: see {@link RangeArea.type}. Anything not known is a fan, as it is drawn. */
  readonly type: string;
  /** How far it reaches, in the range's squares. */
  readonly length: number;
  /** How wide a line or a fan is, in the range's squares. */
  readonly width: number;
  /** How far it is turned, in degrees clockwise as the table is seen from above. */
  readonly rotate: number;
  /** Where it stands: the middle of a shape spread round a point, the start of a line or a fan. */
  readonly origin: FlatPoint;
  /** The cells of a range of its own cells, as {@link parseCellPattern} reads them. */
  readonly cellPattern: string;
  readonly gridType: GridType;
  /** How wide one of the range's squares is, in table pixels. */
  readonly squarePx: number;
}

/** The shortest a range is drawn, and the narrowest a line or fan, in squares. */
const SHORTEST = 1;
const NARROWEST = 0.1;

/**
 * The ground a range covers, as it is drawn on the table: at least a square long, and a line or fan
 * at least a tenth of a square wide. A range of its own cells covers its cells, turned by quarter
 * turns and lined up with the table's grid as they are painted.
 */
export function rangeFootprint(input: FootprintInput): FootprintPart[] {
  const sq = input.squarePx;
  const far = atLeast(input.length, SHORTEST) * sq;
  const half = (atLeast(input.width, NARROWEST) * sq) / 2;
  const turned = (points: readonly FlatPoint[]): FootprintPart => ({
    kind: 'polygon',
    corners: points.map((point) => placed(point, input.rotate, input.origin)),
  });
  switch (input.type) {
    case 'CIRCLE':
      return [{ kind: 'circle', centre: input.origin, radius: far }];
    case 'LINE':
      return [
        turned([
          { x: 0, y: -half },
          { x: far, y: -half },
          { x: far, y: half },
          { x: 0, y: half },
        ]),
      ];
    case 'SQUARE':
      return [
        turned([
          { x: -far, y: -far },
          { x: far, y: -far },
          { x: far, y: far },
          { x: -far, y: far },
        ]),
      ];
    case 'RHOMBUS':
      return [
        turned([
          { x: 0, y: -far },
          { x: far, y: 0 },
          { x: 0, y: far },
          { x: -far, y: 0 },
        ]),
      ];
    case 'TRIANGLE':
      return [turned(regularCorners(3, far))];
    case 'PENTAGON':
      return [turned(regularCorners(5, far))];
    case 'HEXAGON':
      return [turned(regularCorners(6, far))];
    case 'CUSTOM':
      return cellsFootprint(input);
    case 'CORN':
    default:
      return [
        turned([
          { x: 0, y: 0 },
          { x: far, y: -half },
          { x: far, y: half },
        ]),
      ];
  }
}

/** How far from its origin the furthest of a range's ground lies, in table pixels. */
export function footprintReach(parts: readonly FootprintPart[], origin: FlatPoint): number {
  let reach = 0;
  for (const part of parts) {
    if (part.kind === 'circle') {
      reach = Math.max(reach, Math.hypot(part.centre.x - origin.x, part.centre.y - origin.y) + part.radius);
      continue;
    }
    for (const corner of part.corners) reach = Math.max(reach, Math.hypot(corner.x - origin.x, corner.y - origin.y));
  }
  return reach;
}

/** The value where it is a number at least as large as the least, and the least otherwise. */
function atLeast(value: number, least: number): number {
  return Number.isFinite(value) && value >= least ? value : least;
}

/** A point of a shape turned clockwise about its origin and set where the origin stands. */
function placed(point: FlatPoint, degrees: number, origin: FlatPoint): FlatPoint {
  const rad = (degrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return { x: origin.x + point.x * cos - point.y * sin, y: origin.y + point.x * sin + point.y * cos };
}

/** The corners of a regular polygon round its middle, the first straight up, as a range draws them. */
function regularCorners(n: number, radius: number): FlatPoint[] {
  const corners: FlatPoint[] = [];
  for (let i = 0; i < n; i++) {
    const angle = (((360 / n) * i - 90) * Math.PI) / 180;
    corners.push({ x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
  }
  return corners;
}

/**
 * The cells of a range of its own cells, each a square or a hexagon of the table's grid, from the
 * cell its origin stands in, turned by the quarter turns nearest its turn.
 */
function cellsFootprint(input: FootprintInput): FootprintPart[] {
  const quarters = Math.round((((input.rotate % 360) + 360) % 360) / 90) % 4;
  const cells = rotateCellPattern(parseCellPattern(input.cellPattern), quarters);
  const sq = input.squarePx;
  if (isHexGrid(input.gridType)) {
    const flatTop = isFlatTopGrid(input.gridType);
    const { colSpacing, rowSpacing } = hexSpacing(sq, flatTop);
    const radius = hexCircumradius(sq);
    const start = hexStartAngle(flatTop);
    const base = pixelToHexCell(input.origin.x, input.origin.y, sq, flatTop);
    return cells.map((cell) => {
      const { col, row } = patternCellToWorld(base.col, base.row, cell.gx, cell.gy, flatTop);
      const centre = hexCellCenter(col, row, colSpacing, rowSpacing, flatTop);
      return { kind: 'polygon', corners: hexVertices(centre.x, centre.y, radius, start) };
    });
  }
  const baseCol = Math.floor(input.origin.x / sq);
  const baseRow = Math.floor(input.origin.y / sq);
  return cells.map((cell) => {
    const left = (baseCol + cell.gx) * sq;
    const top = (baseRow + cell.gy) * sq;
    return {
      kind: 'polygon',
      corners: [
        { x: left, y: top },
        { x: left + sq, y: top },
        { x: left + sq, y: top + sq },
        { x: left, y: top + sq },
      ],
    };
  });
}
