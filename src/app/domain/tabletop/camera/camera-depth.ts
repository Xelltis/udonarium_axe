/** A point of the board's space: across the board, down it, and up off it, in table pixels. */
export interface BoardSpacePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/** How near and how far off a camera draws what is before it, in table pixels. */
export interface CameraDepth {
  readonly near: number;
  readonly far: number;
}

/** How much further than the board's furthest corner the camera draws. */
const FAR_MARGIN = 1.1;

/** What share of the way to the nearest point of the board the camera draws from, standing far off it. */
const NEAR_SHARE = 0.5;

/**
 * How near and how far off a camera standing at a point draws a board and what stands on it, up to
 * the height given: never nearer nor less far than the least given, and out past the board's
 * furthest corner, so a board taken in whole from far back is drawn whole. Standing further off the
 * board than the most given, it draws from half the way to the board's nearest point, though no
 * further off than that most, so a depth reaching that far is worked out finely enough to keep the
 * grid apart from the board under it. Nearer, it draws from the least given, as it always has.
 */
export function cameraDepthOver(
  eye: BoardSpacePoint,
  board: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  tallestPx: number,
  least: CameraDepth,
  mostNear: number
): CameraDepth {
  let furthest = 0;
  for (const x of [board.x, board.x + board.width]) {
    for (const y of [board.y, board.y + board.height]) {
      for (const z of [0, tallestPx]) furthest = Math.max(furthest, Math.hypot(eye.x - x, eye.y - y, eye.z - z));
    }
  }
  const nearestX = Math.min(Math.max(eye.x, board.x), board.x + board.width);
  const nearestY = Math.min(Math.max(eye.y, board.y), board.y + board.height);
  const nearest = Math.hypot(eye.x - nearestX, eye.y - nearestY, Math.max(0, eye.z - tallestPx));
  return {
    near: nearest > mostNear ? Math.max(least.near, Math.min(mostNear, nearest * NEAR_SHARE)) : least.near,
    far: Math.max(least.far, furthest * FAR_MARGIN),
  };
}
