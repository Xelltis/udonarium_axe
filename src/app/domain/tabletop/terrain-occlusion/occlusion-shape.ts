import { CellStep, hexSideStepsAt, hexStepsAt } from '@axe/domain/tabletop/cell-steps';
import { CellGrid, cellIndexOf } from '@axe/domain/tabletop/fog/cell-grid';
import {
  hexCellCenter,
  hexCornerOffsets,
  hexLayoutOf,
  isFlatTopGrid,
  isHexGrid,
  pixelToHexCell,
} from '@axe/domain/tabletop/hex-geometry';
import { surfaceOf } from '@axe/domain/tabletop/tabletop-object';
import { Terrain, TerrainFace } from '@axe/domain/tabletop/terrain';
import { terrainBoxOf } from '@axe/domain/tabletop/terrain-box';

/** One upright face of a block, and the cells right outside it that would have to be filled to hide it. */
export interface OcclusionFace {
  /** `north`, `south`, `west` or `east` on a square block; the key of a side from {@link hexFaceKey} on a hex. */
  readonly key: string;
  /** Every cell the face looks out on, as indices on the board; -1 for a cell off the board. */
  readonly outside: readonly number[];
}

/** What of a block matters for telling which sides of it, or of its neighbours, nobody can see. */
export interface OcclusionShape {
  readonly identifier: string;
  /** The cells the block stands on, as indices on the board. */
  readonly cells: readonly number[];
  /** How high its sides start above the floor, in pixels. */
  readonly basePx: number;
  /** How high its sides reach above the floor, in pixels. */
  readonly topPx: number;
  /** Whether it is solid enough, and still enough, to hide the side of a block pressed against it. */
  readonly occludes: boolean;
  /** Whether sides of its own may be left undrawn when something hides them. */
  readonly cullable: boolean;
  readonly faces: readonly OcclusionFace[];
}

/** How far a stored number may sit from a whole number of cells and still be counted as on the grid. */
const GRID_TOLERANCE = 1e-6;

/** A hex side is named by where its middle lies, to a tenth of a pixel, from the middle of the block before it turns. */
export function hexFaceKey(localX: number, localY: number): string {
  const tenth = (value: number) => (Math.round(value * 10) / 10 + 0).toFixed(1);
  return `hex:${tenth(localX)},${tenth(localY)}`;
}

/**
 * Where the middle of a hex side lies, read back from its name; null for a name that is not a hex
 * side's.
 *
 * Two ways of working a side out can land either side of a tenth of a pixel and name it
 * differently, so a side is best matched to a name by how near its middle is rather than by the name.
 */
export function hexFaceMidpointOf(key: string): { x: number; y: number } | null {
  const match = /^hex:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/.exec(key);
  return match ? { x: Number(match[1]), y: Number(match[2]) } : null;
}

function wholeCells(value: number): number | null {
  const rounded = Math.round(value);
  return Number.isFinite(value) && Math.abs(value - rounded) < GRID_TOLERANCE ? rounded : null;
}

function finite(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

/** A turn in whole degrees within one circle, or null when it is not a multiple of the given step. */
function turnIn(rotate: number, step: number): number | null {
  const turn = ((Math.round(rotate) % 360) + 360) % 360;
  return Math.abs(rotate - Math.round(rotate)) < GRID_TOLERANCE && turn % step === 0 ? turn : null;
}

/** Whether a picture has been chosen for a face, directly or through the picture its faces share. */
function drawn(terrain: Terrain, face: TerrainFace | 'wall' | 'floor', shared: 'wall' | 'floor'): boolean {
  return terrain.faceImageIdentifier(face).length > 0 || terrain.faceImageIdentifier(shared).length > 0;
}

/**
 * Works out a block's footprint, the height its sides span and the cells each side looks out on.
 *
 * Only a block that lies square on the grid of the table it stands on gets a shape: its corners
 * on cell corners on a square board, its middle on a cell's middle on a hex board, turned only by
 * whole steps of the grid. Anything else, or anything with a size that is not a whole number of
 * cells, answers null and is left drawn as it is, with every side.
 *
 * @param shownWhole whether the fog leaves the whole block drawn for whoever is looking. A block
 *   cut back by the fog shows its neighbours' sides through the gap, so it hides nothing.
 */
export function occlusionShapeOf(terrain: Terrain, grid: CellGrid, shownWhole: boolean): OcclusionShape | null {
  if (surfaceOf(terrain) !== 'floor' || grid.sizePx <= 0) return null;
  const g = grid.sizePx;
  const width = wholeCells(finite(terrain.width) ?? NaN);
  const depth = wholeCells(finite(terrain.depth) ?? NaN);
  const height = finite(terrain.height);
  const altitude = finite(terrain.altitude);
  const posZ = finite(terrain.posZ) ?? 0;
  const rotate = finite(terrain.rotate);
  if (width === null || depth === null || width < 1 || depth < 1) return null;
  if (height === null || height <= 0 || altitude === null || altitude < 0 || rotate === null) return null;

  const still = terrain.isLocked && !terrain.isDoor && !terrain.isSlope;
  const basePx = altitude * g + posZ;
  const topPx = basePx + height * g;
  const walled = terrain.hasWall;

  if (isHexGrid(grid.type)) {
    const turn = turnIn(rotate, 60);
    if (turn === null) return null;
    const opaque =
      walled && terrain.hasFloor && drawn(terrain, 'top', 'floor') && terrain.faceImageIdentifier('wall').length > 0;
    return hexShape(terrain, grid, width, depth, turn, {
      basePx,
      topPx,
      occludes: still && opaque && shownWhole,
      cullable: still && walled,
    });
  }

  if (turnIn(rotate, 90) === null) return null;
  const box = terrainBoxOf(terrain, g);
  const left = wholeCells(box.minX / g);
  const top = wholeCells(box.minY / g);
  const right = wholeCells(box.maxX / g);
  const bottom = wholeCells(box.maxY / g);
  if (left === null || top === null || right === null || bottom === null) return null;

  const sides = ['north', 'south', 'west', 'east'] as const;
  const opaque =
    walled && terrain.hasFloor && drawn(terrain, 'top', 'floor') && sides.every((side) => drawn(terrain, side, 'wall'));
  const cells: number[] = [];
  for (let row = top; row < bottom; row++) {
    for (let col = left; col < right; col++) {
      const index = cellIndexOf(grid, col, row);
      if (index >= 0) cells.push(index);
    }
  }
  const outsideOf = (normalX: number, normalY: number): number[] => {
    const out: number[] = [];
    if (normalY !== 0) {
      const row = normalY < 0 ? top - 1 : bottom;
      for (let col = left; col < right; col++) out.push(cellIndexOf(grid, col, row));
    } else {
      const col = normalX < 0 ? left - 1 : right;
      for (let row = top; row < bottom; row++) out.push(cellIndexOf(grid, col, row));
    }
    return out;
  };
  const radians = (rotate * Math.PI) / 180;
  const faces = sides.map((side) => {
    const [x, y] = side === 'north' ? [0, -1] : side === 'south' ? [0, 1] : side === 'west' ? [-1, 0] : [1, 0];
    const worldX = Math.round(x * Math.cos(radians) - y * Math.sin(radians));
    const worldY = Math.round(x * Math.sin(radians) + y * Math.cos(radians));
    return { key: side, outside: outsideOf(worldX, worldY) };
  });
  return {
    identifier: terrain.identifier,
    cells,
    basePx,
    topPx,
    occludes: still && opaque && shownWhole,
    cullable: still && walled,
    faces,
  };
}

function hexShape(
  terrain: Terrain,
  grid: CellGrid,
  width: number,
  depth: number,
  turn: number,
  heights: Pick<OcclusionShape, 'basePx' | 'topPx' | 'occludes' | 'cullable'>
): OcclusionShape | null {
  const g = grid.sizePx;
  const isFlatTop = isFlatTopGrid(grid.type);
  const layout = hexLayoutOf(g, isFlatTop);
  const centreX = terrain.location.x + (width * g) / 2;
  const centreY = terrain.location.y + (depth * g) / 2;
  const middle = pixelToHexCell(centreX, centreY, g, isFlatTop);
  const onCell = hexCellCenter(middle.col, middle.row, layout.colSpacing, layout.rowSpacing, isFlatTop);
  if (Math.abs(onCell.x - centreX) > 0.5 || Math.abs(onCell.y - centreY) > 0.5) return null;

  const reach = Math.min(width, depth) - 1;
  const covered = new Map<string, [number, number]>([[`${middle.col},${middle.row}`, [middle.col, middle.row]]]);
  let ring: [number, number][] = [[middle.col, middle.row]];
  for (let step = 0; step < reach; step++) {
    const next: [number, number][] = [];
    for (const [col, row] of ring) {
      for (const [dx, dy] of hexStepsAt(isFlatTop, col, row) as readonly CellStep[]) {
        const key = `${col + dx},${row + dy}`;
        if (covered.has(key)) continue;
        covered.set(key, [col + dx, row + dy]);
        next.push([col + dx, row + dy]);
      }
    }
    ring = next;
  }

  const corners = hexCornerOffsets(layout.circumradius, isFlatTop);
  const back = (-turn * Math.PI) / 180;
  const cos = Math.cos(back);
  const sin = Math.sin(back);
  const cells: number[] = [];
  const faces: OcclusionFace[] = [];
  for (const [col, row] of covered.values()) {
    const index = cellIndexOf(grid, col, row);
    if (index >= 0) cells.push(index);
    const centre = hexCellCenter(col, row, layout.colSpacing, layout.rowSpacing, isFlatTop);
    const sides = hexSideStepsAt(isFlatTop, col, row);
    for (let i = 0; i < 6; i++) {
      const [dx, dy] = sides[i];
      if (covered.has(`${col + dx},${row + dy}`)) continue;
      const midX = centre.x + (corners[i].x + corners[(i + 1) % 6].x) / 2 - centreX;
      const midY = centre.y + (corners[i].y + corners[(i + 1) % 6].y) / 2 - centreY;
      faces.push({
        key: hexFaceKey(midX * cos - midY * sin, midX * sin + midY * cos),
        outside: [cellIndexOf(grid, col + dx, row + dy)],
      });
    }
  }
  return { identifier: terrain.identifier, cells, ...heights, faces };
}
