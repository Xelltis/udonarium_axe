import { cellGradient, DEFAULT_SHADE_RGB, STRETCHED_TEXTURE, TextureLayout } from '@axe/ui/tabletop/shaded-background';

/** What is left of a face the fog covers end to end. */
export const HIDDEN_FACE: Readonly<Record<string, string>> = { display: 'none' };

/** How a block's picture is laid on its faces: a cell to a tile, or stretched over each face. */
export function terrainTextureLayout(tiled: boolean, gridSize: number): TextureLayout {
  if (!tiled) return STRETCHED_TEXTURE;
  const side = `${gridSize}px`;
  return { size: `${side} ${side}`, repeat: 'repeat' };
}

/**
 * What the fog leaves of a face, as a mask over it, from which of its cells the party has
 * reached, row by row; null when it leaves the whole face.
 *
 * A block standing in ground nobody has walked to is not there to be seen. Painted over in the
 * colour of the fog it would stand up out of the mist as a solid slab of it, and the shape of the
 * slab would tell the party the wall is there. Taken away instead, the face thins out across the
 * cell at the edge of what has been reached, the way the mist on the floor does, and the rest of
 * the block is simply gone.
 */
export function fogMaskOf(cleared: readonly boolean[], cols: number, rows: number): Record<string, string> | null {
  if (cleared.every((cell) => cell)) return null;
  // A face standing wholly in ground nobody has reached is not drawn at all. A mask made of
  // one reading cannot say this: a gradient with nothing kept anywhere is no gradient, and a
  // face left without a mask is a face shown whole.
  if (!cleared.some((cell) => cell)) return HIDDEN_FACE;
  const mask = cellGradient(
    cleared.map((cell) => (cell ? 1 : 0)),
    cols,
    rows,
    DEFAULT_SHADE_RGB
  );
  if (!mask) return null;
  return {
    'mask-image': mask.image,
    '-webkit-mask-image': mask.image,
    'mask-size': mask.size,
    '-webkit-mask-size': mask.size,
    'mask-position': mask.position,
    '-webkit-mask-position': mask.position,
    'mask-repeat': 'no-repeat',
    '-webkit-mask-repeat': 'no-repeat',
    'mask-composite': 'add',
    '-webkit-mask-composite': 'source-over',
  };
}
