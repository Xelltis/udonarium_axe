/**
 * How far ahead of the board the things lying on the floor are drawn, where they lie in its plane and
 * would otherwise flicker against it and against each other: the board itself not at all, then the
 * pictures a table lays over its board, then the faces of the blocks, so a block made as high as
 * nothing is drawn over the floor it stands on, then the grid and what is laid over a face, and last
 * the canvases laid on the floor, as where a piece may move, which show over all of them.
 *
 * A pull ahead is told in the depth's own steps, and in steps of how steeply the face is seen. The
 * pictures over the board are laid on the board's own shape and need no more than one step; the
 * faces of the blocks are other shapes, told apart from the floor by the slant as well.
 */
export const LAYERS_OVER_BOARD = { polygonOffset: true, polygonOffsetFactor: 0, polygonOffsetUnits: -1 } as const;

/** The faces of the blocks, drawn ahead of the board and what is laid over it; see {@link LAYERS_OVER_BOARD}. */
export const FACES_OVER_FLOOR = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 } as const;

/** The grid, and a picture laid over a face, drawn ahead of the faces of the blocks; see {@link LAYERS_OVER_BOARD}. */
export const LAID_OVER_FACES = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 } as const;

/** The canvases laid on the floor, drawn ahead of all the rest of it; see {@link LAYERS_OVER_BOARD}. */
export const CANVASES_OVER_ALL = { polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -8 } as const;
