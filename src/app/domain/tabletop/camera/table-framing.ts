import { Matrix3D } from '@axe/core/transform/matrix-3d';
import {
  drawnScaleAt,
  pageOfTablePoint,
  type TableCameraView,
  type TableLayout,
  type TablePoint,
  tableSceneMatrix,
} from '@axe/domain/tabletop/camera/table-camera';

/** How far in from each edge of the box the camera looks through what is framed is kept, in pixels. */
export interface FrameInset {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

/** How far the camera may stand, as `positionZ`: the furthest back and the nearest. */
export interface FrameDepths {
  readonly furthest: number;
  readonly nearest: number;
}

/** How many times the depth is halved in the search for the nearest one that frames everything. */
const DEPTH_STEPS = 40;

/** How many times the depth is found and the view centred again, each settling what the other moved. */
const FRAMING_ROUNDS = 4;

/** How far the view is moved to see how far a move carries what is framed across the page. */
const PROBE_PX = 100;

/** Where points of the board are drawn on the page through a view: their box, or null if any lies behind the eye. */
function drawnBox(
  view: TableCameraView,
  layout: TableLayout,
  points: readonly TablePoint[],
  scene: Matrix3D
): { left: number; top: number; right: number; bottom: number } | null {
  tableSceneMatrix(view, layout, scene);
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;
  for (const point of points) {
    if (!view.orthographic && drawnScaleAt(scene, point.x, point.y, point.z) <= 0) return null;
    const at = pageOfTablePoint(scene, point.x, point.y, point.z);
    left = Math.min(left, at.x);
    top = Math.min(top, at.y);
    right = Math.max(right, at.x);
    bottom = Math.max(bottom, at.y);
  }
  return { left, top, right, bottom };
}

/**
 * The view that frames points of the board: facing the way `view` faces, brought as near as lets
 * every point be drawn inside the box the camera looks through, kept `inset` in from its edges, and
 * moved across so they stand in the middle of what is left. The depth stays between the two given;
 * at the furthest back, points that still do not fit are centred as they are. A box with no room
 * inside the inset, as one not laid out yet, leaves the view as it is.
 */
export function framingView(
  view: TableCameraView,
  layout: TableLayout,
  points: readonly TablePoint[],
  inset: FrameInset,
  depths: FrameDepths
): TableCameraView {
  const roomWidth = layout.width - inset.left - inset.right;
  const roomHeight = layout.height - inset.top - inset.bottom;
  if (points.length === 0 || roomWidth <= 0 || roomHeight <= 0) return view;
  const scene = new Matrix3D();
  const middleX = layout.left + inset.left + roomWidth / 2;
  const middleY = layout.top + inset.top + roomHeight / 2;
  const fits = (candidate: TableCameraView): boolean => {
    const box = drawnBox(candidate, layout, points, scene);
    return box !== null && box.right - box.left <= roomWidth && box.bottom - box.top <= roomHeight;
  };

  const nearestFitting = (candidate: TableCameraView): TableCameraView => {
    let far = depths.furthest;
    let near = depths.nearest;
    if (fits({ ...candidate, positionZ: near })) return { ...candidate, positionZ: near };
    for (let step = 0; step < DEPTH_STEPS; step++) {
      const middle = (far + near) / 2;
      if (fits({ ...candidate, positionZ: middle })) far = middle;
      else near = middle;
    }
    return { ...candidate, positionZ: far };
  };

  let framed = view;
  for (let round = 0; round < FRAMING_ROUNDS; round++) {
    framed = nearestFitting(framed);
    const box = drawnBox(framed, layout, points, scene);
    if (!box) break;
    const across = drawnBox({ ...framed, positionX: framed.positionX + PROBE_PX }, layout, points, scene);
    const down = drawnBox({ ...framed, positionY: framed.positionY + PROBE_PX }, layout, points, scene);
    if (!across || !down) break;
    const centreX = (box.left + box.right) / 2;
    const centreY = (box.top + box.bottom) / 2;
    const perPxX = ((across.left + across.right) / 2 - centreX) / PROBE_PX;
    const perPxY = ((down.top + down.bottom) / 2 - centreY) / PROBE_PX;
    framed = {
      ...framed,
      positionX: perPxX > 0 ? framed.positionX + (middleX - centreX) / perPxX : framed.positionX,
      positionY: perPxY > 0 ? framed.positionY + (middleY - centreY) / perPxY : framed.positionY,
    };
  }
  return nearestFitting(framed);
}
