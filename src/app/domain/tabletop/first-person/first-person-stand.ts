/** How large a piece's picture stands, in table pixels. */
export interface PieceStand {
  readonly widthPx: number;
  readonly heightPx: number;
}

/** What decides how large a piece's picture stands. */
export interface PieceStandInput {
  /** The piece's size, in cells. */
  readonly sizeCells: number;
  /** The table's cell size, in pixels. */
  readonly gridSize: number;
  /** The picture's width over its height, once it has loaded. */
  readonly aspect?: number;
  /** A height the picture was set to apart from its ground, in pixels, where one was. */
  readonly specifiedHeightPx?: number;
}

/**
 * How large a piece's picture stands, as the table draws it: as wide as the ground under it and as
 * tall as the picture's own proportions make it. A picture given a height of its own stands that
 * tall, and as wide as that makes it. Until the picture's proportions are known, it stands as tall
 * as it is wide, or as wide as its ground under a height of its own.
 */
export function pieceStandPx(input: PieceStandInput): PieceStand {
  const ground = Math.max(0, input.sizeCells) * input.gridSize;
  const aspect = input.aspect !== undefined && input.aspect > 0 ? input.aspect : undefined;
  if (input.specifiedHeightPx !== undefined) {
    const heightPx = Math.max(0, input.specifiedHeightPx);
    return { widthPx: aspect ? heightPx * aspect : ground, heightPx };
  }
  return { widthPx: ground, heightPx: aspect ? ground / aspect : ground };
}
