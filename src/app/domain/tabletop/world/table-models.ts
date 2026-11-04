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
  /** How far the piece is turned, in degrees clockwise. */
  readonly rotateDeg: number;
  /**
   * How far the piece is tipped over sideways, in degrees, about the middle of its box's width over
   * its foot, at its altitude: where its picture is tipped over about.
   */
  readonly rollDeg: number;
  /** How high the piece floats over its foot, in table pixels. */
  readonly altitudePx: number;
  /** Whether the piece is being moved now, which plays its walk. */
  readonly walking: boolean;
}
