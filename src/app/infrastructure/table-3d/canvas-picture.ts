import type { Texture } from 'three/webgpu';

/** The name a picture keeps, among its own data, the size of the canvas it was last taken from at. */
const TAKEN_SIZE = 'takenFromSize';

/**
 * Has a picture drawn from a canvas taken again from the canvas as it is drawn now. The graphics
 * card holds a picture at the size it was first taken at and copies a canvas drawn again into it, so
 * where the canvas has been made another size, as the page makes its grid for a table made wider,
 * the picture is first let go of on the card, to be made there afresh at the canvas's new size.
 */
export function retakeCanvasPicture(picture: Texture): void {
  const canvas = picture.image as HTMLCanvasElement;
  const size = `${canvas.width}x${canvas.height}`;
  const taken = picture.userData[TAKEN_SIZE] as string | undefined;
  if (taken !== undefined && taken !== size) picture.dispose();
  picture.userData[TAKEN_SIZE] = size;
  picture.needsUpdate = true;
}
