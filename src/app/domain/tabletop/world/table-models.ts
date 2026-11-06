import type { PieceModel } from '@axe/domain/tabletop/piece-model';

/**
 * A piece or a block drawn as a 3D model: the model, from where its bytes are read, stood with its
 * foot at a point of the table (x to the east, y to the south and z up, in table pixels), fitted
 * inside a box so wide across and so tall, turned as the piece is turned and as far again as the
 * model is, and tipped over and lifted as the piece's picture is.
 */
export interface TableWorldModel {
  /** The identifier of the piece or block it is drawn for. */
  readonly owner: string;
  /** What kind of object that is, as its alias names it. */
  readonly kind: string;
  /** Where the model's bytes are read from: an object URL for bytes held here. */
  readonly url: string;
  readonly model: PieceModel;
  readonly foot: { readonly x: number; readonly y: number; readonly z: number };
  readonly footprintPx: number;
  /** How tall the box is that the model is fitted inside, in table pixels. */
  readonly heightPx: number;
  /**
   * How wide and deep a block's own box is, in table pixels, before it is turned: what a model made to
   * be stretched to its box, as a door or a stair is, fills. Left out for a piece.
   */
  readonly boxPx?: {
    readonly widthPx: number;
    readonly depthPx: number;
    /** How wide a cell of the table is: what a building's kit, made a cell to a piece, is repeated by. */
    readonly cellPx?: number;
  };
  /** How far the piece is turned, in degrees clockwise. */
  readonly rotateDeg: number;
  /** How far the piece is tipped over sideways, in degrees, as its picture is. */
  readonly rollDeg: number;
  /** How high over its foot, at its altitude, the piece is tipped over about, as its picture is, in table pixels. */
  readonly pivotPx: number;
  /** How high the piece floats over its foot, in table pixels. */
  readonly altitudePx: number;
  /** Whether the piece is being moved now, which plays its walk. */
  readonly walking: boolean;
  /**
   * For a door: whether it stands open, and where its opening has taken it from where it stands shut,
   * on the board, as its faces are taken. A model whose leaves swing on hinges of their own opens by
   * them instead.
   */
  readonly door?: TableWorldModelDoor;
}

/** Where an open door has gone from where it stands shut, on the board. */
export interface TableWorldModelDoor {
  readonly open: boolean;
  readonly shiftX: number;
  readonly shiftY: number;
  /** How far it has turned, in degrees clockwise. */
  readonly turnDeg: number;
  readonly liftPx: number;
}

/** How many times its width the box a character's model is fitted inside stands, as a picture of a figure does. */
const CHARACTER_MODEL_HEIGHT_CELLS = 2;

/**
 * The box a character's model is fitted inside: as wide as its cell and twice as tall, or as tall as
 * its picture is asked to be, and as wide as that is asked to be apart from it or else keeping the
 * box's own shape.
 */
export function characterModelBox(
  sizePx: number,
  pictureHeightPx: number | null,
  pictureWidthPx: number | null
): { readonly widthPx: number; readonly heightPx: number } {
  if (pictureHeightPx === null) return { widthPx: sizePx, heightPx: sizePx * CHARACTER_MODEL_HEIGHT_CELLS };
  return { widthPx: pictureWidthPx ?? pictureHeightPx / CHARACTER_MODEL_HEIGHT_CELLS, heightPx: pictureHeightPx };
}
