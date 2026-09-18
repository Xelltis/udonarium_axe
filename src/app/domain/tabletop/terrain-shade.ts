import { SlopeDirection } from '@axe/domain/tabletop/terrain-slope';

/** The four upright sides of a square block. */
export type BlockSide = 'north' | 'south' | 'west' | 'east';

/** Readings laid out over a face row by row, one to a cell. */
export interface ShadeGrid {
  readonly brightness: readonly number[];
  readonly cols: number;
  readonly rows: number;
}

/** How much of the light each face of a block keeps when the block shades its own surfaces. */
const FACE_SHADE: Readonly<Record<BlockSide | 'bottom', number>> = {
  north: 0.3,
  south: 1,
  west: 0.5,
  east: 0.8,
  bottom: 0.25,
};

/**
 * How much of the light a face of a square block keeps for the way it is turned.
 *
 * A block that shades its own surfaces is lit from the south: the south face keeps all of it and
 * the underside, which nothing lights, the least. One that does not keeps all of it everywhere.
 */
export function faceShadeOf(face: BlockSide | 'bottom', surfaceShading: boolean): number {
  return surfaceShading ? FACE_SHADE[face] : 1;
}

/** How much of the light a top leaning each way keeps, from the north round to the west. */
const SLOPE_SHADE: readonly number[] = [0.4, 0.9, 1, 0.6];

/**
 * How much of the light a leaning top keeps for the way it runs down, with the same light.
 *
 * The four ways a square block can lean are what a slope has always been shaded by; a hex
 * block leans between them, and is shaded between them in turn.
 */
export function slopeShadeOf(azimuth: number, surfaceShading: boolean): number {
  if (!surfaceShading) return 1;
  const quarter = Math.PI / 2;
  const turn = ((azimuth % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
  const step = Math.floor(turn / quarter);
  const along = turn / quarter - step;
  const from = SLOPE_SHADE[step % SLOPE_SHADE.length];
  const to = SLOPE_SHADE[(step + 1) % SLOPE_SHADE.length];
  return from + (to - from) * along;
}

/** How much of the light the top of a block keeps for the way it leans, with the same light. */
export function topShadeOf(slope: SlopeDirection, surfaceShading: boolean): number {
  if (!surfaceShading || slope === SlopeDirection.NONE) return 1;
  return slopeShadeOf(LEANS[slope] ?? 0, surfaceShading);
}

/** Which way each of the four directions an older room holds runs down. */
const LEANS: Record<number, number> = {
  [SlopeDirection.TOP]: 0,
  [SlopeDirection.RIGHT]: Math.PI / 2,
  [SlopeDirection.BOTTOM]: Math.PI,
  [SlopeDirection.LEFT]: (3 * Math.PI) / 2,
};

/** How much of the light a wall of a hex block keeps for the way the edge it stands on runs. */
export function hexWallShadeOf(edgeAngle: number, surfaceShading: boolean): number {
  return surfaceShading
    ? Math.max(0.3, Math.min(1.0, 0.65 - 0.35 * Math.cos(edgeAngle) + 0.15 * Math.sin(edgeAngle)))
    : 1.0;
}

/**
 * The cells along one side of a block, as indices into its readings, from the end the side is
 * drawn from: the west one first along the north and south sides, the south one first along the
 * west and east sides.
 */
export function sideCellIndexes(cols: number, rows: number, side: BlockSide): number[] {
  switch (side) {
    case 'north':
      return Array.from({ length: cols }, (_, col) => col);
    case 'south':
      return Array.from({ length: cols }, (_, col) => (rows - 1) * cols + col);
    case 'west':
      return Array.from({ length: rows }, (_, i) => (rows - 1 - i) * cols);
    default:
      return Array.from({ length: rows }, (_, i) => (rows - 1 - i) * cols + cols - 1);
  }
}

function single(brightness: number): ShadeGrid {
  return { brightness: [brightness], cols: 1, rows: 1 };
}

function scaled(readings: ShadeGrid, shade: number): ShadeGrid {
  return {
    brightness: readings.brightness.map((brightness) => shade * brightness),
    cols: readings.cols,
    rows: readings.rows,
  };
}

/** The light that falls on the top of a block, read only as far as the top needs it. */
export interface TopLight {
  /** The top's cells, read at the height the top stands at; null where there is no light to read. */
  roof(): ShadeGrid | null;
  /** The floor's cells under the block; null where there is no light to read. */
  floor(): ShadeGrid | null;
  /** One reading for the whole top, at the height it stands at. */
  top(): number;
  /** One reading for the whole block, on the floor. */
  whole(): number;
}

/**
 * How brightly the top of a block is lit, a reading to the cell where it can be read so.
 *
 * The camera looks down on a table, so the top is the face most seen, and one figure for the
 * whole of it lights the far end of a wall whose near end alone stands in a torch's reach. A top
 * standing above the floor is a surface of its own, lit by whatever is up there with it rather
 * than by what reaches the ground below.
 *
 * @param raised whether the top stands above the floor.
 * @param byCell whether the top may be shaded a cell at a time; a hex top or a slope is shaded whole.
 * @param shade how much of the light the top keeps for the way it leans, from {@link topShadeOf}.
 */
export function topShadeGrid(raised: boolean, byCell: boolean, shade: number, light: TopLight): ShadeGrid {
  if (raised) {
    const roof = byCell ? light.roof() : null;
    return roof ? scaled(roof, shade) : single(shade * light.top());
  }
  const floor = byCell ? light.floor() : null;
  return floor ? scaled(floor, shade) : single(shade * light.whole());
}

/**
 * How brightly one upright side of a block is lit along its length, a reading to the cell, from
 * the end it is drawn from.
 *
 * @param shade how much of the light the side keeps for the way it is turned, from {@link faceShadeOf}.
 * @param cells the block's cells; null where there is no light to read, and the side takes the
 *   table's own light instead.
 */
export function sideShadeLine(
  shade: number,
  side: BlockSide,
  cells: ShadeGrid | null,
  ambient: () => number
): ShadeGrid {
  if (!cells) return single(shade * ambient());
  const along = sideCellIndexes(cells.cols, cells.rows, side).map((i) => shade * cells.brightness[i]);
  return { brightness: along, cols: along.length, rows: 1 };
}
