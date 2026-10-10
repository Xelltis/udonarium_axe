/** How the camera stands, as far as a backdrop cares. */
export interface BackdropCamera {
  /** The tilt, in degrees; 0 looks straight down. */
  readonly rotateX: number;
  /** The turn of the table, in degrees. */
  readonly rotateZ: number;
  /** How far the view has been moved, in pixels. */
  readonly positionX: number;
  readonly positionY: number;
}

/** How far a backdrop following the camera fully moves for each pixel the view is moved. */
export const BACKDROP_PAN_RATIO = 0.25;

/** How far, in pixels, a backdrop following the camera fully rises for each degree the view tilts. */
export const BACKDROP_TILT_PX_PER_DEGREE = 6;

/** The tilt a backdrop stands where it was put at, which is the tilt the view starts at. */
export const BACKDROP_REST_TILT_DEGREES = 50;

/** The furthest, in pixels, a backdrop following the camera fully is moved up or down. */
export const BACKDROP_MAX_RISE_PX = 400;

/**
 * How far a backdrop is moved for the way the camera stands, given how much it follows the
 * camera and how wide one picture of it is.
 *
 * Across, a whole turn of the table goes once round the picture, so a backdrop that follows fully
 * turns with the table like a horizon, and moving the view drags it a little the same way. The
 * result is brought back into one picture's width, as the picture is laid edge to edge and a move
 * of a whole picture looks like no move at all. Up and down, tilting the view and moving it raise
 * or lower the picture, held within a reach so it never leaves the screen.
 *
 * A backdrop that follows less is moved less, which is what makes it look further away.
 */
export function backdropOffset(
  camera: BackdropCamera,
  follow: number,
  pictureWidth: number
): { readonly x: number; readonly y: number } {
  const share = Number.isFinite(follow) ? Math.min(1, Math.max(0, follow)) : 0;
  if (share === 0) return { x: 0, y: 0 };

  const width = Number.isFinite(pictureWidth) && pictureWidth > 0 ? pictureWidth : 0;
  const turned = width > 0 ? -(finite(camera.rotateZ) / 360) * width : 0;
  const across = (turned + finite(camera.positionX) * BACKDROP_PAN_RATIO) * share;

  const tilted = (finite(camera.rotateX) - BACKDROP_REST_TILT_DEGREES) * BACKDROP_TILT_PX_PER_DEGREE;
  const reach = BACKDROP_MAX_RISE_PX * share;
  const down = Math.min(reach, Math.max(-reach, (tilted + finite(camera.positionY) * BACKDROP_PAN_RATIO) * share));

  return { x: width > 0 ? wrapIntoPicture(across, width) : 0, y: down };
}

/** A shift across brought into the one picture's width before the start, from minus the width up to nought. */
function wrapIntoPicture(shift: number, width: number): number {
  const wrapped = (((shift % width) + width) % width) - width;
  return Math.round(wrapped * 100) / 100;
}

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}
