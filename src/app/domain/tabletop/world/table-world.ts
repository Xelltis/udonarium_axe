import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import {
  hexCellCenter,
  hexCircumradius,
  hexCornerOffsets,
  hexSpacing,
  isFlatTopGrid,
} from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';

/** A point of the board, in table pixels. */
export interface TableWorldPoint {
  readonly x: number;
  readonly y: number;
}

/**
 * Where the board's picture is stretched and what of it shows, in table pixels. A square board
 * shows the whole box; a hex board reaches past its cells, and is cut to them.
 */
export interface TableWorldBoardShape {
  readonly box: { readonly x: number; readonly y: number; readonly width: number; readonly height: number };
  /** The six corners of each cell a hex board is cut to, or null for a board that shows its whole box. */
  readonly hexes: readonly (readonly TableWorldPoint[])[] | null;
}

/** The board of the table in view, as the scene lays it out, in table pixels. */
export interface TableWorldBoard {
  readonly widthPx: number;
  readonly depthPx: number;
  readonly gridSize: number;
  readonly gridType: GridType;
  readonly shape: TableWorldBoardShape;
  /** The picture laid over the board, or empty for none. */
  readonly pictureUrl: string;
  /** Whether the board is whitened a little, as it is while nothing is laid under it. */
  readonly veiled: boolean;
}

/**
 * What the table in view puts in front of the camera: everything a renderer draws, worked out from
 * the objects of the room and nothing else. A table with no board in view draws nothing.
 */
export interface TableWorld {
  readonly board: TableWorldBoard | null;
}

/** The scene with nothing in it. */
export const EMPTY_TABLE_WORLD: TableWorld = { board: null };

/** How much bigger than a cell each hex a board is cut to is, so the cut leaves no seam between cells. */
const HEX_CUT_OVERLAP_PX = 1;

/**
 * The scene of a table, or the empty scene where there is none in view. `pictureOf` says where the
 * picture an identifier names is to be read from, or nothing for one there is no picture for.
 */
export function tableWorldOf(
  table: GameTable | null | undefined,
  pictureOf: (identifier: string) => string = () => ''
): TableWorld {
  if (!table) return EMPTY_TABLE_WORLD;
  const gridSize = table.gridSize > 0 ? table.gridSize : 50;
  const laidUnder = table.backgroundLayers.some(
    (layer) => !layer.placedOver && !layer.placedBackdrop && pictureOf(layer.imageIdentifier) !== ''
  );
  return {
    board: {
      widthPx: table.width * gridSize,
      depthPx: table.height * gridSize,
      gridSize,
      gridType: table.gridType,
      shape: boardShapeOf(table.width, table.height, gridSize, table.gridType),
      pictureUrl: pictureOf(table.imageIdentifier),
      veiled: !laidUnder,
    },
  };
}

/** The box a board's picture is stretched over, and the hexes it is cut to where its cells are hexes. */
export function boardShapeOf(cols: number, rows: number, gridSize: number, gridType: GridType): TableWorldBoardShape {
  const geo = computeHexMaskGeometry(cols, rows, gridSize, gridType);
  if (!geo) return { box: { x: 0, y: 0, width: cols * gridSize, height: rows * gridSize }, hexes: null };
  const isFlatTop = isFlatTopGrid(gridType);
  const { colSpacing, rowSpacing } = hexSpacing(gridSize, isFlatTop);
  const corners = hexCornerOffsets(hexCircumradius(gridSize) + HEX_CUT_OVERLAP_PX, isFlatTop);
  const hexes: TableWorldPoint[][] = [];
  for (let col = 0; col < cols; col++) {
    for (let row = 0; row < rows; row++) {
      const middle = hexCellCenter(col, row, colSpacing, rowSpacing, isFlatTop);
      hexes.push(corners.map((corner) => ({ x: middle.x + corner.x, y: middle.y + corner.y })));
    }
  }
  return { box: { x: -geo.offsetX, y: -geo.offsetY, width: geo.pixelW, height: geo.pixelH }, hexes };
}
