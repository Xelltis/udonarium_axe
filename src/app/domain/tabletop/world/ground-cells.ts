import type { GridType } from '@axe/domain/tabletop/grid-type';
import type { GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import {
  HEX_CUT_OVERLAP_PX,
  hexCellCenter,
  hexCircumradius,
  hexCornerOffsets,
  hexSpacing,
  isFlatTopGrid,
  isHexGrid,
} from '@axe/domain/tabletop/hex-geometry';
import { bareHexGroundMesh, bareSquareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';

/** A box of the floor, in table pixels. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A corner of an outline on the floor, in table pixels. */
interface Corner {
  readonly x: number;
  readonly y: number;
}

/**
 * A part of the floor's mesh: its points across, down and up in table pixels, three to a point, and
 * its triangles, three points to a triangle.
 */
export interface FloorMesh {
  readonly points: Float32Array;
  readonly triangles: Uint32Array;
}

/** A cell of the ground's mesh as it is kept, with the box round it. */
interface Cell extends FloorMesh {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** A point of a mesh: across, down and up, in table pixels. */
type MeshPoint = readonly [number, number, number];

/** The side of a line on the floor a point is kept on: where `nx * x + ny * y` is at least `c`. */
interface HalfPlane {
  readonly nx: number;
  readonly ny: number;
  readonly c: number;
}

/** How a hex table's cells are laid, and the corners of a cell as the board cuts it and as it is. */
interface HexCellLayout {
  readonly colSpacing: number;
  readonly rowSpacing: number;
  readonly isFlatTop: boolean;
  readonly cut: readonly Corner[];
  readonly own: readonly Corner[];
  readonly reachX: number;
  readonly reachY: number;
}

/** How many cells are kept past those the sheets laid since the last settling reached. */
const SPARE_CELLS = 512;

/** How far past a line a point may lie and still count as on its side, in table pixels. */
const ON_LINE_PX = 1e-9;

/**
 * The ground's mesh under the sheets lying over it, as a range does, cell by cell: each cell made once
 * from the ground as it is, and kept while it is used, so that a sheet moved over the ground is laid
 * again without the ground being read anew. On a square table a cell holds the squares of the samples
 * in it, laid as the board's are; on a hex table it is the cell as the board cuts it, a little larger
 * than the cell, cut back to the cell itself, so it lies on the board's ground exactly and no two cells
 * lie over each other. Off the board the cells run on over the ground, which lies flat there.
 */
export class GroundCells {
  private readonly cells = new Map<string, Cell>();
  /** The cells a sheet has been laid over since the last settling. */
  private readonly used = new Set<string>();
  private readonly hex: HexCellLayout | null;

  constructor(
    private readonly ground: GroundSurface,
    private readonly gridSize: number,
    gridType: GridType
  ) {
    this.hex = isHexGrid(gridType) ? hexCellLayoutOf(gridSize, isFlatTopGrid(gridType)) : null;
  }

  /** The ground's mesh over a box of the floor, on the board and off it alike, cut to the box. */
  meshOver(box: Box): FloorMesh {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const planes = boxPlanes(box);
    const parts: FloorMesh[] = [];
    for (const cell of this.cellsOver(box)) {
      if (cell.right <= box.x || cell.left >= right || cell.bottom <= box.y || cell.top >= bottom) continue;
      const whole = cell.left >= box.x && cell.right <= right && cell.top >= box.y && cell.bottom <= bottom;
      parts.push(whole ? cell : clipped(cell, planes));
    }
    return joined(parts);
  }

  /**
   * Lets go of the cells used longest ago past a few more than the sheets laid since the last settling
   * reached, so that the cells kept do not grow with every place a sheet has been moved over.
   */
  settle(): void {
    for (const key of this.cells.keys()) {
      if (this.cells.size <= this.used.size + SPARE_CELLS) break;
      if (!this.used.has(key)) this.cells.delete(key);
    }
    this.used.clear();
  }

  /** The cells a box reaches, made where they are not kept yet. */
  private cellsOver(box: Box): Cell[] {
    const right = box.x + box.width;
    const bottom = box.y + box.height;
    const cells: Cell[] = [];
    const hex = this.hex;
    if (!hex) {
      const size = this.gridSize;
      for (let row = Math.floor(box.y / size); row * size < bottom; row++) {
        for (let col = Math.floor(box.x / size); col * size < right; col++) {
          cells.push(this.cell(col, row, () => this.squareCell(col, row)));
        }
      }
      return cells;
    }
    const { colSpacing, rowSpacing, isFlatTop, reachX, reachY } = hex;
    const lastCol = Math.ceil((right + reachX) / colSpacing) + 1;
    const lastRow = Math.ceil((bottom + reachY) / rowSpacing) + 1;
    for (let col = Math.floor((box.x - reachX) / colSpacing) - 1; col <= lastCol; col++) {
      for (let row = Math.floor((box.y - reachY) / rowSpacing) - 1; row <= lastRow; row++) {
        const middle = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
        if (middle.x + reachX <= box.x || middle.x - reachX >= right) continue;
        if (middle.y + reachY <= box.y || middle.y - reachY >= bottom) continue;
        cells.push(this.cell(col, row, () => this.hexCell(hex, middle)));
      }
    }
    return cells;
  }

  /** A cell, as it is kept or newly made, kept as the one used last. */
  private cell(col: number, row: number, make: () => Cell): Cell {
    const key = `${col},${row}`;
    const kept = this.cells.get(key);
    const cell = kept ?? make();
    if (kept) this.cells.delete(key);
    this.cells.set(key, cell);
    this.used.add(key);
    return cell;
  }

  /** A cell of a square table: its squares of samples over the ground, laid as the board's are. */
  private squareCell(col: number, row: number): Cell {
    const size = this.gridSize;
    const box = { x: col * size, y: row * size, width: size, height: size };
    const mesh = bareSquareGroundMesh(box, this.ground, size);
    return {
      points: mesh.points,
      triangles: mesh.triangles,
      left: box.x,
      top: box.y,
      right: box.x + size,
      bottom: box.y + size,
    };
  }

  /** A cell of a hex table: the cell as the board cuts it over the ground, cut back to the cell itself. */
  private hexCell(hex: HexCellLayout, middle: Corner): Cell {
    const cut = hex.cut.map((corner) => ({ x: middle.x + corner.x, y: middle.y + corner.y }));
    const own = hex.own.map((corner) => ({ x: middle.x + corner.x, y: middle.y + corner.y }));
    const mesh = bareHexGroundMesh(
      [cut],
      { x: middle.x, y: middle.y, width: 1, height: 1 },
      this.ground,
      this.gridSize
    );
    return {
      ...clipped(mesh, planesOf(own)),
      left: middle.x - hex.reachX,
      top: middle.y - hex.reachY,
      right: middle.x + hex.reachX,
      bottom: middle.y + hex.reachY,
    };
  }
}

/** How a hex table's cells of this size are laid. */
function hexCellLayoutOf(gridSize: number, isFlatTop: boolean): HexCellLayout {
  const own = hexCornerOffsets(hexCircumradius(gridSize), isFlatTop);
  return {
    ...hexSpacing(gridSize, isFlatTop),
    isFlatTop,
    cut: hexCornerOffsets(hexCircumradius(gridSize) + HEX_CUT_OVERLAP_PX, isFlatTop),
    own,
    reachX: Math.max(...own.map((corner) => Math.abs(corner.x))),
    reachY: Math.max(...own.map((corner) => Math.abs(corner.y))),
  };
}

/** The sides of a box's edges the box lies on. */
function boxPlanes(box: Box): HalfPlane[] {
  return [
    { nx: 1, ny: 0, c: box.x },
    { nx: -1, ny: 0, c: -(box.x + box.width) },
    { nx: 0, ny: 1, c: box.y },
    { nx: 0, ny: -1, c: -(box.y + box.height) },
  ];
}

/** The sides of a convex outline's edges the outline lies on, whichever way round its corners run. */
function planesOf(outline: readonly Corner[]): HalfPlane[] {
  let twiceArea = 0;
  outline.forEach((a, k) => {
    const b = outline[(k + 1) % outline.length];
    twiceArea += a.x * b.y - b.x * a.y;
  });
  const turn = Math.sign(twiceArea);
  return outline.map((a, k) => {
    const b = outline[(k + 1) % outline.length];
    const nx = -(b.y - a.y) * turn;
    const ny = (b.x - a.x) * turn;
    return { nx, ny, c: nx * a.x + ny * a.y };
  });
}

/** Meshes laid one after another as one. */
function joined(parts: readonly FloorMesh[]): FloorMesh {
  let pointValues = 0;
  let indices = 0;
  for (const part of parts) {
    pointValues += part.points.length;
    indices += part.triangles.length;
  }
  const points = new Float32Array(pointValues);
  const triangles = new Uint32Array(indices);
  let pointAt = 0;
  let indexAt = 0;
  for (const part of parts) {
    points.set(part.points, pointAt);
    const base = pointAt / 3;
    for (let k = 0; k < part.triangles.length; k++) triangles[indexAt + k] = part.triangles[k] + base;
    pointAt += part.points.length;
    indexAt += part.triangles.length;
  }
  return { points, triangles };
}

/**
 * What of a mesh lies on the kept side of every one of the lines given: its triangles wholly there as
 * they are, those across a line cut along the lines they cross, as flat as they were, and the rest
 * left out, with only the points its triangles use.
 */
function clipped(mesh: FloorMesh, planes: readonly HalfPlane[]): FloorMesh {
  const source = mesh.points;
  const kept = new Int32Array(source.length / 3).fill(-1);
  const points: number[] = [];
  const triangles: number[] = [];
  const keep = (at: number): number => {
    if (kept[at] < 0) {
      kept[at] = points.length / 3;
      points.push(source[at * 3], source[at * 3 + 1], source[at * 3 + 2]);
    }
    return kept[at];
  };
  const sideOf = (plane: HalfPlane, at: number) => plane.nx * source[at * 3] + plane.ny * source[at * 3 + 1] - plane.c;
  const crossed: HalfPlane[] = [];
  for (let at = 0; at + 2 < mesh.triangles.length; at += 3) {
    const a = mesh.triangles[at];
    const b = mesh.triangles[at + 1];
    const c = mesh.triangles[at + 2];
    let outside = false;
    crossed.length = 0;
    for (const plane of planes) {
      const outA = sideOf(plane, a) < -ON_LINE_PX;
      const outB = sideOf(plane, b) < -ON_LINE_PX;
      const outC = sideOf(plane, c) < -ON_LINE_PX;
      if (outA && outB && outC) {
        outside = true;
        break;
      }
      if (outA || outB || outC) crossed.push(plane);
    }
    if (outside) continue;
    if (crossed.length === 0) {
      triangles.push(keep(a), keep(b), keep(c));
      continue;
    }
    let polygon: MeshPoint[] = [a, b, c].map((index) => [
      source[index * 3],
      source[index * 3 + 1],
      source[index * 3 + 2],
    ]);
    for (const plane of crossed) polygon = clipAlong(polygon, plane);
    if (polygon.length < 3) continue;
    const first = points.length / 3;
    for (const point of polygon) points.push(...point);
    for (let k = 2; k < polygon.length; k++) triangles.push(first, first + k - 1, first + k);
  }
  return { points: new Float32Array(points), triangles: new Uint32Array(triangles) };
}

/** What of a flat polygon lies on the kept side of a line, the points where its edges cross the line put in. */
function clipAlong(polygon: readonly MeshPoint[], plane: HalfPlane): MeshPoint[] {
  const out: MeshPoint[] = [];
  const sideOf = (point: MeshPoint) => plane.nx * point[0] + plane.ny * point[1] - plane.c;
  for (let k = 0; k < polygon.length; k++) {
    const from = polygon[k];
    const to = polygon[(k + 1) % polygon.length];
    const fromSide = sideOf(from);
    const toSide = sideOf(to);
    if (fromSide >= 0) out.push(from);
    if (fromSide >= 0 === toSide >= 0) continue;
    const t = fromSide / (fromSide - toSide);
    out.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t]);
  }
  return out;
}
