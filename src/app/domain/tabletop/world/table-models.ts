import type { PieceModel } from '@axe/domain/tabletop/piece-model';

/**
 * A piece or a block drawn as a 3D model: the model, from where its bytes are read, stood with its
 * foot at a point of the table (x to the east, y to the south and z up, in table pixels), fitted to
 * a footprint so wide across, and turned as the piece is turned and as far again as the model is.
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
  /** How far the piece is turned, in degrees clockwise. */
  readonly rotateDeg: number;
  /** Whether the piece is being moved now, which plays its walk. */
  readonly walking: boolean;
}
