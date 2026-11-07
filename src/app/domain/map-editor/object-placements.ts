import { parseCellKey } from '@axe/domain/tabletop/cell-key';
import type { CellGrid } from '@axe/domain/tabletop/fog/cell-grid';
import {
  DEFAULT_FUNCTION_SPEC,
  type ObjectPaintSpec,
  type TerrainBlock,
  type TerrainPaintSpec,
} from '@axe/domain/tabletop/function-paint';
import { cellCentre } from '@axe/domain/tabletop/map-grid';
import { paintedBlockFootprintOf } from '@axe/domain/tabletop/painted-block-footprint';
import { placeableModelOf } from '@axe/domain/tabletop/placeable-models';
import { TerrainViewState } from '@axe/domain/tabletop/terrain';

/** Where one 3D object stands: its box's corner in table px, as wide and deep and tall as it is in cells, and its turn. */
export interface ObjectPlacement {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  readonly rotate: number;
}

/** How far a scattered object may stand off the middle of its cell, as a share of the cell either way. */
const SCATTER_SLIP = 0.25;

/**
 * A stream of numbers from 0 up to 1 for one cell of one brush, the same each time it is asked
 * for, so that the same cells painted with the same brush set the same things out the same way.
 */
function cellRandom(seed: number, col: number, row: number): () => number {
  let state =
    (Math.imul(seed ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(col + 1, 0x27d4eb2f) ^ Math.imul(row + 1, 0x165667b1)) >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function rounded(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

/**
 * How wide, deep and tall one object stands for a brush, at a size: a bundled model in its own
 * proportions, and one held in the room as a square of the size, as tall as the brush says.
 */
function objectBox(spec: ObjectPaintSpec, size: number): { width: number; depth: number; height: number } {
  const bundled = placeableModelOf(spec.model);
  if (!bundled) return { width: size, depth: size, height: spec.height };
  const across = Math.max(bundled.made.wide, bundled.made.deep);
  return {
    width: (size * bundled.made.wide) / across,
    depth: (size * bundled.made.deep) / across,
    height: (size * bundled.made.tall) / across,
  };
}

/**
 * Where a brush sets its objects out over the cells it painted, cell by cell along the rows.
 *
 * Set out one to a cell, each stands in the middle of its cell at the brush's size and turn.
 * Scattered, each cell takes one at the brush's density, a little off the middle, a little larger
 * or smaller, and turned any way where the brush says so. A cell is read the same way each time,
 * whatever else was painted, so painting more cells leaves those already set out where they were.
 */
export function objectPlacementsOf(cells: readonly string[], spec: ObjectPaintSpec, grid: CellGrid): ObjectPlacement[] {
  const placed: ObjectPlacement[] = [];
  const parsed = cells
    .map((key) => parseCellKey(key))
    .filter((cell): cell is { col: number; row: number } => cell !== null)
    .sort((a, b) => a.row - b.row || a.col - b.col);
  for (const { col, row } of parsed) {
    if (col < 0 || row < 0 || col >= grid.cols || row >= grid.rows) continue;
    const random = cellRandom(spec.seed, col, row);
    const scattered = spec.arrangement === 'scatter';
    if (scattered && random() >= spec.density) continue;
    const slipX = scattered ? (random() * 2 - 1) * SCATTER_SLIP : 0;
    const slipY = scattered ? (random() * 2 - 1) * SCATTER_SLIP : 0;
    const size = scattered ? spec.size * (1 + (random() * 2 - 1) * spec.sizeJitter) : spec.size;
    const turn = scattered && spec.turnRandom ? Math.floor(random() * 360) : spec.turn;
    const box = objectBox(spec, size);
    const middle = cellCentre({ x: col, y: row }, grid);
    const centreX = middle.x + slipX * grid.sizePx;
    const centreY = middle.y + slipY * grid.sizePx;
    placed.push({
      x: rounded(centreX - (box.width * grid.sizePx) / 2, 2),
      y: rounded(centreY - (box.depth * grid.sizePx) / 2, 2),
      width: rounded(box.width, 3),
      depth: rounded(box.depth, 3),
      height: rounded(box.height, 3),
      rotate: turn,
    });
  }
  return placed;
}

/**
 * The terrain a brush's object is laid on the table as: a box as tall as it stands, drawn as the
 * model in place of its faces, which have nothing on them, and locked, as a generated field's trees
 * are, so that a press meant for a piece among them is not taken for one of them. One that stands in
 * the way is walked round rather than climbed onto, and hides what is behind it where the brush says
 * so; one walked over is a floor a piece steps up onto, as a field's crops are, which hides nothing.
 */
function objectTerrainSpec(
  spec: ObjectPaintSpec,
  placed: ObjectPlacement,
  model: string
): Omit<TerrainPaintSpec, 'placement'> {
  const stands = spec.blocksMove;
  const { placement: _placement, ...look } = DEFAULT_FUNCTION_SPEC.terrain;
  return {
    ...look,
    name: spec.name,
    height: placed.height,
    mode: stands ? TerrainViewState.ALL : TerrainViewState.FLOOR,
    blocksSight: stands && spec.blocksSight,
    blocksLight: stands && spec.blocksSight,
    blocksClimb: stands,
    locked: true,
    model,
    paintedObject: true,
  };
}

/**
 * The blocks a brush's objects are laid on the table as, each where it stands and known by the
 * cells it stands over as a block read back off the table is, so that laying the same painting
 * again finds them already there. An object standing off the board is left out, and a brush whose
 * model is not held anywhere lays none.
 */
export function objectBlocksOf(
  cells: readonly string[],
  spec: ObjectPaintSpec,
  grid: CellGrid,
  model: string
): TerrainBlock[] {
  if (model.length < 1) return [];
  const blocks: TerrainBlock[] = [];
  for (const placed of objectPlacementsOf(cells, spec, grid)) {
    const stood = paintedBlockFootprintOf(
      { location: { x: placed.x, y: placed.y }, rotate: placed.rotate },
      placed.width,
      placed.depth,
      grid
    );
    if (!stood) continue;
    blocks.push({ ...stood.rect, spec: { ...objectTerrainSpec(spec, placed, model), placement: stood.placement } });
  }
  return blocks;
}
