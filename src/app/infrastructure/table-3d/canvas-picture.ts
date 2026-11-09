import type { Texture } from 'three/webgpu';

/**
 * The longest side of a picture sent to the graphics card, in pixels: the largest WebGPU promises on
 * any card. A picture sent any larger is refused there, and the frame it is in is drawn with nothing.
 */
export const LONGEST_PICTURE_PX = 8192;

/** The names a picture keeps, among its own data, the canvas it is drawn from and what it last sent of it. */
const SOURCE = 'canvasSource';
const COPY = 'canvasCopy';
const TAKEN_SIZE = 'takenFromSize';

/** The canvas a picture is drawn from, as {@link retakeCanvasPicture} was last given it. */
export function canvasOfPicture(picture: Texture): HTMLCanvasElement {
  return (picture.userData[SOURCE] as HTMLCanvasElement | undefined) ?? (picture.image as HTMLCanvasElement);
}

/**
 * Has a picture drawn from a canvas taken again from the canvas as it is drawn now. A canvas longer
 * than the card takes, as the page draws the grid of a board of a great many large cells, is sent as
 * a copy brought down to the longest side the card takes, which the picture stretches over the same
 * box. The card holds a picture at the size it was first sent at and copies what is sent again into
 * it, so a picture to be sent at another size, as for a table made wider, is first let go of on the
 * card, to be made there afresh.
 */
export function retakeCanvasPicture(picture: Texture, canvas: HTMLCanvasElement = canvasOfPicture(picture)): void {
  picture.userData[SOURCE] = canvas;
  const sent = sentOf(picture, canvas);
  const size = `${sent.width}x${sent.height}`;
  const taken = picture.userData[TAKEN_SIZE] as string | undefined;
  if (taken !== undefined && taken !== size) picture.dispose();
  picture.userData[TAKEN_SIZE] = size;
  picture.image = sent;
  picture.needsUpdate = true;
}

/** The canvas itself where the card takes it whole, or a copy of it brought down to the longest side it takes. */
function sentOf(picture: Texture, canvas: HTMLCanvasElement): HTMLCanvasElement {
  const scale = Math.min(1, LONGEST_PICTURE_PX / Math.max(1, canvas.width, canvas.height));
  if (scale === 1) return canvas;
  const copy = (picture.userData[COPY] as HTMLCanvasElement | undefined) ?? document.createElement('canvas');
  picture.userData[COPY] = copy;
  copy.width = Math.min(LONGEST_PICTURE_PX, Math.max(1, Math.round(canvas.width * scale)));
  copy.height = Math.min(LONGEST_PICTURE_PX, Math.max(1, Math.round(canvas.height * scale)));
  copy.getContext('2d')?.drawImage(canvas, 0, 0, copy.width, copy.height);
  return copy;
}
