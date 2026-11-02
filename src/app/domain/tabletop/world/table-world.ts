import { firstPersonWorldOf } from '@axe/domain/tabletop/first-person/first-person-world';
import { GameTable, GridType } from '@axe/domain/tabletop/game-table';
import { FLAT_GROUND, groundLiftOfBlock, GroundSurface } from '@axe/domain/tabletop/ground/ground-surface';
import {
  hexCellCenter,
  hexCircumradius,
  hexCornerOffsets,
  hexSpacing,
  isFlatTopGrid,
} from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import { Terrain } from '@axe/domain/tabletop/terrain';
import { TerrainFogCover } from '@axe/domain/tabletop/terrain-cover';
import { blockFacesOf } from '@axe/domain/tabletop/world/block-faces';
import { GroundMesh, hexGroundMesh, squareGroundMesh } from '@axe/domain/tabletop/world/ground-mesh';
import { TableWorldCoin } from '@axe/domain/tabletop/world/table-coins';
import { TableWorldSprite } from '@axe/domain/tabletop/world/table-sprites';

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
  /** The board laid over the table's raised and sunk ground, or null where the ground is flat. */
  readonly ground: GroundMesh | null;
}

/**
 * An upright face standing on the floor between two points, from a height to a height, in table
 * pixels: a side of a block, or a wall of the table.
 */
export interface TableWorldWall {
  readonly id: string;
  readonly ax: number;
  readonly ay: number;
  readonly bx: number;
  readonly by: number;
  readonly basePx: number;
  readonly topPx: number;
  /**
   * How high the face's top stands along it, from its first point (0) to its second (1), for a side
   * under a slope; a face without one is `topPx` high all along.
   */
  readonly profile?: readonly { readonly at: number; readonly heightPx: number }[];
  /** The picture the face wears, or empty for none. */
  readonly pictureUrl: string;
  /** The side of one tile of the picture, or 0 where the picture is stretched over the face. */
  readonly tilePx: number;
  /** Whether the face is glass, as a block with no picture on any face is. */
  readonly glass: boolean;
  /**
   * How far across its picture the face's first and second points stand, for a face that is a part
   * of a wider one; a whole face runs across its picture from its first point.
   */
  readonly uFrom?: number;
  readonly uTo?: number;
}

/** A flat face lying at a height, facing up or down: the top or the underside of a block. */
export interface TableWorldCap {
  readonly id: string;
  readonly outline: readonly TableWorldPoint[];
  readonly zPx: number;
  /** How high each corner of the outline stands, for a piece of a slope; otherwise all stand at `zPx`. */
  readonly heights?: readonly number[];
  /** Where on its picture each corner of the outline stands, across and up; otherwise laid out on the board. */
  readonly uvs?: readonly TableWorldPoint[];
  /** Whether the table's grid is laid over the face, as it is over the top of a block that asks for it. */
  readonly gridded?: boolean;
  readonly facing: 'up' | 'down';
  readonly pictureUrl: string;
  readonly tilePx: number;
  readonly glass: boolean;
}

/**
 * What the table in view puts in front of the camera: everything a renderer draws, worked out from
 * the objects of the room and nothing else. A table with no board in view draws nothing.
 */
export interface TableWorld {
  readonly board: TableWorldBoard | null;
  readonly walls: readonly TableWorldWall[];
  readonly caps: readonly TableWorldCap[];
  /** The pictures and frames most pieces on the table are drawn with. */
  readonly sprites: readonly TableWorldSprite[];
  readonly coins: readonly TableWorldCoin[];
}

/** The scene with nothing in it. */
export const EMPTY_TABLE_WORLD: TableWorld = { board: null, walls: [], caps: [], sprites: [], coins: [] };

/** How much bigger than a cell each hex a board is cut to is, so the cut leaves no seam between cells. */
const HEX_CUT_OVERLAP_PX = 1;

/**
 * The scene of a table, or the empty scene where there is none in view, with the blocks given
 * standing on it and no pieces: the sprites the pieces are drawn with are worked out apart.
 * `pictureOf` says where the picture an identifier names is to be read from, or nothing for one
 * there is no picture for.
 *
 * Only what the seat may see is to be given: a block left out is not in the scene at all, and of a
 * block the fog lies over in part, `coverOf` says which of its cells the seat has reached.
 */
export function tableWorldOf(
  table: GameTable | null | undefined,
  pictureOf: (identifier: string) => string = () => '',
  terrains: readonly Terrain[] = [],
  coverOf: (terrain: Terrain) => TerrainFogCover | null = () => null,
  ground: GroundSurface = FLAT_GROUND
): TableWorld {
  if (!table) return EMPTY_TABLE_WORLD;
  const gridSize = table.gridSize > 0 ? table.gridSize : 50;
  const shape = boardShapeOf(table.width, table.height, gridSize, table.gridType);
  const laidUnder = table.backgroundLayers.some(
    (layer) => !layer.placedOver && !layer.placedBackdrop && pictureOf(layer.imageIdentifier) !== ''
  );
  return {
    board: {
      widthPx: table.width * gridSize,
      depthPx: table.height * gridSize,
      gridSize,
      gridType: table.gridType,
      shape,
      pictureUrl: pictureOf(table.imageIdentifier),
      veiled: !laidUnder,
      ground: ground.isFlat
        ? null
        : shape.hexes
          ? hexGroundMesh(shape.hexes, shape.box, ground, gridSize)
          : squareGroundMesh(shape.box, ground, gridSize),
    },
    ...facesOf(table, terrains, pictureOf, coverOf, ground),
    sprites: [],
    coins: [],
  };
}

/**
 * The faces of the blocks on the floor and of the table's own walls. A wall of the table is drawn
 * only with a picture, as the page draws it.
 */
function facesOf(
  table: GameTable,
  terrains: readonly Terrain[],
  pictureOf: (identifier: string) => string,
  coverOf: (terrain: Terrain) => TerrainFogCover | null,
  ground: GroundSurface
): Pick<TableWorld, 'walls' | 'caps'> {
  const gridSize = table.gridSize > 0 ? table.gridSize : 50;
  const blocks = blockFacesOf(terrains, gridSize, table.gridType, pictureOf, coverOf, (terrain) =>
    groundLiftOfBlock(ground, gridSize, terrain)
  );
  const tableWalls = firstPersonWorldOf(table, [])
    .walls.map((wall): TableWorldWall => ({
      id: wall.id,
      ax: wall.ax,
      ay: wall.ay,
      bx: wall.bx,
      by: wall.by,
      basePx: wall.basePx,
      topPx: wall.topPx,
      pictureUrl: wall.image ? pictureOf(wall.image) : '',
      tilePx: wall.tilePx,
      glass: wall.glass,
    }))
    .filter((wall) => wall.pictureUrl !== '');
  return { walls: [...blocks.walls, ...tableWalls], caps: blocks.caps };
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
