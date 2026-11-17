/**
 * How far ahead of the board the things lying on the floor are drawn, where they lie in its plane and
 * would otherwise flicker against it and against each other: the board itself not at all, then the
 * pictures a table lays over its board, then the faces of the blocks, so a block made as high as
 * nothing is drawn over the floor it stands on, then the faces of a block with no thickness, a sheet
 * stood against the face of another or laid on its top, then the grid and what is laid over a face,
 * a sheet's among them, and last the canvases laid on the floor, as where a piece may move, which
 * show over all of them.
 *
 * A pull ahead is told in the depth's own steps, and in steps of how steeply the face is seen. The
 * pictures over the board are laid on the board's own shape and need no more than one step; the
 * faces of the blocks are other shapes, told apart from the floor by the slant as well. Only a face
 * lying level in the floor's plane or on another level face is, as a sheet's flat face and the top
 * of a block sunk to the floor do; every other face of a block is pulled by the steps alone, as
 * {@link withoutSlant} gives its pull.
 */
export const LAYERS_OVER_BOARD = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 } as const;

/** How far ahead of what lies behind it in the same plane a material is drawn; see {@link LAYERS_OVER_BOARD}. */
export interface FloorPull {
  readonly polygonOffset: true;
  readonly polygonOffsetFactor: number;
  readonly polygonOffsetUnits: number;
}

/**
 * A pull ahead told in the depth's steps alone, for a face of a block lying neither in the floor's
 * plane nor on another level face. The faces lying in its own plane, as a sheet stood against a wall,
 * are pulled the same way, so the steps alone keep them in order; pulled by the slant as well, a face
 * seen more steeply than another it meets at an edge would be drawn over it there, though behind it.
 */
export function withoutSlant(pull: FloorPull): FloorPull {
  return { ...pull, polygonOffsetFactor: 0 };
}

/** The faces of the blocks, drawn ahead of the board and what is laid over it; see {@link LAYERS_OVER_BOARD}. */
export const FACES_OVER_FLOOR = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 } as const;

/**
 * The faces of a block with no thickness one way, drawn ahead of the face of another block they lie
 * against, which the hair they stand off it does not tell apart from far off; see {@link LAYERS_OVER_BOARD}.
 */
export const SHEETS_OVER_FACES = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -3 } as const;

/** The grid, and a picture laid over a face, drawn ahead of the faces of the blocks and of the sheets; see {@link LAYERS_OVER_BOARD}. */
export const LAID_OVER_FACES = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } as const;

/** The canvases laid on the floor, drawn ahead of all the rest of it; see {@link LAYERS_OVER_BOARD}. */
export const CANVASES_OVER_ALL = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 } as const;
