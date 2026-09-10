import { CellBits } from '@axe/domain/tabletop/fog/cell-bits';
import {
  cellCenterOf,
  cellCount,
  CellGrid,
  forEachCell,
  forEachCellInBox,
  forEachNeighbourCell,
} from '@axe/domain/tabletop/fog/cell-grid';
import { SegmentIndexes } from '@axe/domain/tabletop/los/segment-index';
import {
  EYE_HEIGHT_CELLS,
  isLit,
  lightFloorPool,
  SceneVisionSource,
  seesInDark,
  VisionScene,
} from '@axe/domain/tabletop/vision-scene';
import { maxLobeScale, visionLobeScale } from '@axe/domain/tabletop/vision-shape';
import { VisionType } from '@axe/domain/tabletop/vision-types';

export interface VisibleCellsOptions {
  scene: VisionScene;
  grid: CellGrid;
  indexes: SegmentIndexes;
  /** The cells a wall stands on, so that one is asked about at its face and not its middle. */
  blocking?: CellBits;
  /** How high each of those walls stands, so an eye above one is answered on its roof. */
  blockingTops?: Float32Array;
  /** How low each of them hangs, so an eye under an arch is answered on the ground beneath it. */
  blockingBases?: Float32Array;
  /** A guard against a board so large that one pass would stall the display. */
  maxCells?: number;
}

const DEFAULT_MAX_CELLS = 60_000;
/** How far towards an open neighbour a wall's face is read, as a share of the way to it. */
const FACE_STEP = 0.6;

export function computeVisibleCellsFor(source: SceneVisionSource, options: VisibleCellsOptions): CellBits {
  const { scene, grid } = options;
  const bits = new CellBits(cellCount(grid));
  if (source.type === VisionType.BLIND) return bits;
  const widest = maxLobeScale(source.lobes);
  if (widest <= 0) return bits;

  const index = options.indexes.above(source.z);
  const visited = new CellBits(cellCount(grid));
  const budget = options.maxCells ?? DEFAULT_MAX_CELLS;
  let spent = 0;

  const blocking = options.blocking;

  const reaches = (x: number, y: number, z = 0): boolean => {
    const scale = visionLobeScale(source.lobes, source.direction, source.x, source.y, x, y);
    if (scale <= 0) return false;
    const withinRange = source.rangePx > 0 && Math.hypot(x - source.x, y - source.y) <= source.rangePx * scale;
    if (!scene.darknessEnabled && source.rangePx > 0 && !withinRange) return false;
    if (source.type === VisionType.TRUESIGHT && withinRange) return true;
    if (!index.clearBetween(source.x, source.y, source.z, x, y, z)) return false;
    if (!scene.darknessEnabled || isLit(scene, x, y, true, z)) return true;
    return seesInDark(source.type) && withinRange;
  };

  const tops = options.blockingTops;
  const bases = options.blockingBases;

  const consider = (cell: number, cx: number, cy: number): void => {
    if (spent >= budget) return;
    if (visited.get(cell)) return;
    visited.set(cell);
    spent++;

    if (!blocking?.get(cell)) {
      if (reaches(cx, cy)) bits.set(cell);
      return;
    }
    // A roof an eye stands level with or above is ground to it, read where it lies. Asked at
    // its open sides instead, the middle of the building somebody was standing on came out
    // unreached, and the fog stayed lying over their own feet.
    const top = tops ? tops[cell] : 0;
    if (top > 0 && top <= source.z) {
      if (reaches(cx, cy, top)) bits.set(cell);
      return;
    }
    // A block hanging over an eye is not in its way on the ground: the cell under an arch is
    // walked on, and asked about at the faces of the arch it stayed fogged over its own feet.
    const base = bases ? bases[cell] : 0;
    if (base > source.z) {
      if (reaches(cx, cy)) bits.set(cell);
      return;
    }
    if (wallFaceIsReached(options.grid, blocking, cell, cx, cy, reaches)) bits.set(cell);
  };

  forEachCandidate(source, options, widest, consider);
  return bits;
}

/**
 * Whether any face of a wall cell is reached.
 *
 * A wall is asked about at its faces, never at its middle: the middle of a wall is inside
 * itself, where its own edge stops every look. Which face is a matter of which side of it
 * stands open, not of which way the eye happens to lie - along a wall the eye lies the way
 * the wall runs, and a step that way lands in the next stone along, so a wall came out
 * cleared a cell at a time where it should have cleared the whole stretch a lamp lit.
 */
function wallFaceIsReached(
  grid: CellGrid,
  blocking: CellBits,
  cell: number,
  cx: number,
  cy: number,
  reaches: (x: number, y: number) => boolean
): boolean {
  let reached = false;
  forEachNeighbourCell(grid, cell, (neighbour) => {
    if (reached || blocking.get(neighbour)) return;
    const open = cellCenterOf(grid, neighbour);
    if (reaches(cx + (open.x - cx) * FACE_STEP, cy + (open.y - cy) * FACE_STEP)) reached = true;
  });
  return reached;
}

/**
 * The cells worth asking about, which is the ground a look could possibly land on.
 *
 * A range set on the piece bounds every one of them, so a short-sighted piece pays for its
 * own few cells however much of the board is lit.
 */
function forEachCandidate(
  source: SceneVisionSource,
  options: VisibleCellsOptions,
  widest: number,
  visit: (cell: number, cx: number, cy: number) => void
): void {
  const { scene, grid } = options;
  const reach = source.rangePx > 0 ? source.rangePx * widest : Infinity;
  const withinReach = (minX: number, minY: number, maxX: number, maxY: number): void =>
    forEachCellInBox(
      grid,
      Math.max(minX, source.x - reach),
      Math.max(minY, source.y - reach),
      Math.min(maxX, source.x + reach),
      Math.min(maxY, source.y + reach),
      visit
    );

  if (!scene.darknessEnabled) {
    if (Number.isFinite(reach)) withinReach(-Infinity, -Infinity, Infinity, Infinity);
    else forEachCell(grid, visit);
    return;
  }

  // Ground a lamp reaches is worth asking about however far off it is: the range on the piece
  // says how far it sees with nothing to see by, not how far a lamp carries.
  if (scene.globalIllumination > 0) {
    forEachCell(grid, visit);
    return;
  }

  // On the floor, and again on whatever the eye has climbed onto: a lamp carried up there has
  // spent most of its reach by the time it comes back down to the ground.
  const raised = source.z > EYE_HEIGHT_CELLS * scene.gridSize;
  const planes = raised ? [0, source.z] : [0];
  for (const light of scene.lights) {
    for (const plane of planes) {
      const pool = lightFloorPool(light, plane);
      if (!pool) continue;
      forEachCellInBox(
        grid,
        pool.cx - pool.dimPx,
        pool.cy - pool.dimPx,
        pool.cx + pool.dimPx,
        pool.cy + pool.dimPx,
        visit
      );
    }
  }

  if (seesInDark(source.type) && source.rangePx > 0) {
    withinReach(-Infinity, -Infinity, Infinity, Infinity);
  }
}
