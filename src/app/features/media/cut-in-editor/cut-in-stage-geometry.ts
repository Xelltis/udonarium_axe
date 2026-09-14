/**
 * Where the scene sits inside the room the editor gives it, and how a pointer on the
 * screen maps back onto the cut-in's own coordinates.
 *
 * Nothing here touches the DOM: measurements come in as numbers, so every answer can be
 * checked without a browser.
 */

export interface StageBox {
  width: number;
  height: number;
}

export interface LayerBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** How a layer is turned and grown, which is what the pointer has to be read through. */
export interface LayerTransform {
  rotationDeg: number;
  scaleX: number;
  scaleY: number;
  /** How far it is leaned over, in degrees. */
  skewXDeg: number;
  skewYDeg: number;
  /** Where it turns and grows around, as a fraction of its own box. */
  anchorX: number;
  anchorY: number;
}

export const UNTURNED: LayerTransform = {
  rotationDeg: 0,
  scaleX: 1,
  scaleY: 1,
  skewXDeg: 0,
  skewYDeg: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

export interface StageFit {
  /** How much the scene is shrunk to fit. */
  scale: number;
  /** Where the scene's own origin lands inside the room, in screen pixels. */
  offsetX: number;
  offsetY: number;
}

export const RESIZE_HANDLES = ['nw', 'ne', 'sw', 'se'] as const;
export type ResizeHandle = (typeof RESIZE_HANDLES)[number];

export const HANDLE_TOLERANCE_PX = 8;
export const MIN_LAYER_SIZE = 8;
/** How far above the box the grip that turns it sits, in screen pixels. */
export const ROTATE_HANDLE_REACH_PX = 22;

/** The scene shrunk to fit and centred, never grown past its own size. */
/**
 * How far the stage may be leaned into, past the scale that fits it in.
 *
 * Fitted into a panel a cut-in of twelve hundred pixels comes down to a third of itself,
 * at which a layer cannot be put down where it is meant to go. Leaning in past that is
 * what makes the work possible; leaning out below fitting only wastes the room.
 */
export const MIN_STAGE_ZOOM = 1;
export const MAX_STAGE_ZOOM = 8;
export const STAGE_ZOOM_STEP = 1.5;

/** Holds a stage zoom between fitting and eight times that; anything not a number goes back to fitting. */
export function clampStageZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return MIN_STAGE_ZOOM;
  return Math.min(MAX_STAGE_ZOOM, Math.max(MIN_STAGE_ZOOM, zoom));
}

/**
 * How the scene is drawn inside the room the editor gives it, at a zoom.
 *
 * Fitting shrinks the scene to the room but never grows it past its own size; the zoom then scales
 * that up, and the result is centred, running past the room's edges when leaned in. A scene or room
 * not yet measured gives a scale of 1 at the origin.
 */
export function stageFit(scene: StageBox, room: StageBox, zoom = 1): StageFit {
  if (scene.width < 1 || scene.height < 1 || room.width < 1 || room.height < 1) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }

  const fitted = Math.min(1, room.width / scene.width, room.height / scene.height);
  const scale = fitted * clampStageZoom(zoom);
  return {
    scale,
    offsetX: (room.width - scene.width * scale) / 2,
    offsetY: (room.height - scene.height * scale) / 2,
  };
}

/** A point on the screen, in the cut-in's own coordinates. */
export function stageToScene(px: number, py: number, fit: StageFit): { x: number; y: number } {
  return { x: (px - fit.offsetX) / fit.scale, y: (py - fit.offsetY) / fit.scale };
}

/** A point in the cut-in's own coordinates, on the screen. */
export function sceneToStage(x: number, y: number, fit: StageFit): { px: number; py: number } {
  return { px: x * fit.scale + fit.offsetX, py: y * fit.scale + fit.offsetY };
}

/** How far a drag on the screen carries in the cut-in's own coordinates. */
export function stageDeltaToScene(dx: number, dy: number, fit: StageFit): { x: number; y: number } {
  return { x: dx / fit.scale, y: dy / fit.scale };
}

/** What a layer turns and grows around, in the cut-in's own coordinates. */
export function pivotOf(box: LayerBox, transform: LayerTransform = UNTURNED): { x: number; y: number } {
  return { x: box.x + box.width * transform.anchorX, y: box.y + box.height * transform.anchorY };
}

/**
 * A point on the stage, read in the layer's own frame.
 *
 * Everything the editor grabs — the corners, the body, the grip that turns it — is
 * squared up with the box. Once the layer is turned or grown, the point has to be turned
 * and shrunk back the same way before any of that means anything.
 */
export function toLayerLocal(
  point: { x: number; y: number },
  box: LayerBox,
  transform: LayerTransform = UNTURNED
): { x: number; y: number } {
  const pivot = pivotOf(box, transform);
  const local = unturn({ x: point.x - pivot.x, y: point.y - pivot.y }, transform);
  return { x: pivot.x + local.x, y: pivot.y + local.y };
}

/** A point in the layer's own frame, put back where it is drawn on the stage. */
export function fromLayerLocal(
  point: { x: number; y: number },
  box: LayerBox,
  transform: LayerTransform = UNTURNED
): { x: number; y: number } {
  const pivot = pivotOf(box, transform);
  const leaned = skew({ x: point.x - pivot.x, y: point.y - pivot.y }, transform);
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = leaned.x * nonZero(transform.scaleX);
  const dy = leaned.y * nonZero(transform.scaleY);

  return { x: pivot.x + dx * cos - dy * sin, y: pivot.y + dx * sin + dy * cos };
}

/** Where the grip that turns a layer sits, in the layer's own frame. */
export function rotateGripAt(
  box: LayerBox,
  fit: StageFit,
  transform: LayerTransform = UNTURNED
): {
  x: number;
  y: number;
} {
  return { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_REACH_PX / drawnScale(fit, transform) };
}

/** A drag across the stage, read in the layer's own frame. */
export function toLayerLocalDelta(
  delta: { x: number; y: number },
  transform: LayerTransform = UNTURNED
): { x: number; y: number } {
  return unturn(delta, transform);
}

/**
 * A vector with the layer's turn, growth and lean taken back off it.
 *
 * The three are undone in the order the browser applied them, backwards: the lean last
 * on the way out is the lean first on the way back.
 */
function unturn(vector: { x: number; y: number }, transform: LayerTransform): { x: number; y: number } {
  const radians = (transform.rotationDeg * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);

  const turned = { x: vector.x * cos + vector.y * sin, y: -vector.x * sin + vector.y * cos };
  const grown = { x: turned.x / nonZero(transform.scaleX), y: turned.y / nonZero(transform.scaleY) };
  return unskew(grown, transform);
}

/** A vector straightened back up, undoing the lean a browser applies as skew(). */
function unskew(vector: { x: number; y: number }, transform: LayerTransform): { x: number; y: number } {
  const tanX = leanOf(transform.skewXDeg);
  const tanY = leanOf(transform.skewYDeg);
  if (tanX === 0 && tanY === 0) return vector;

  const determinant = 1 - tanX * tanY;
  if (Math.abs(determinant) < 0.0001) return vector;

  return {
    x: (vector.x - tanX * vector.y) / determinant,
    y: (vector.y - tanY * vector.x) / determinant,
  };
}

/** A vector leaned over the way the browser leans it. */
function skew(vector: { x: number; y: number }, transform: LayerTransform): { x: number; y: number } {
  const tanX = leanOf(transform.skewXDeg);
  const tanY = leanOf(transform.skewYDeg);
  if (tanX === 0 && tanY === 0) return vector;

  return { x: vector.x + tanX * vector.y, y: vector.y + tanY * vector.x };
}

/** A lean read as a slope, and nothing at all where the figure means nothing. */
function leanOf(degrees: number): number {
  if (!Number.isFinite(degrees) || degrees === 0) return 0;
  const held = Math.min(80, Math.max(-80, degrees));
  return Math.tan((held * Math.PI) / 180);
}

function nonZero(value: number): number {
  return Number.isFinite(value) && Math.abs(value) > 0.0001 ? value : 1;
}

/** How much bigger the layer is drawn than its box, for keeping a grip the same size on screen. */
export function drawnScale(fit: StageFit, transform: LayerTransform = UNTURNED): number {
  return Math.max(
    0.0001,
    fit.scale * Math.min(Math.abs(nonZero(transform.scaleX)), Math.abs(nonZero(transform.scaleY)))
  );
}

/** The corner a pointer has hold of, or none where it has hold of the layer itself. */
export function resizeHandleAt(
  point: { x: number; y: number },
  box: LayerBox,
  fit: StageFit,
  tolerancePx = HANDLE_TOLERANCE_PX,
  transform: LayerTransform = UNTURNED
): ResizeHandle | null {
  const reach = tolerancePx / drawnScale(fit, transform);
  const corners: Record<ResizeHandle, { x: number; y: number }> = {
    nw: { x: box.x, y: box.y },
    ne: { x: box.x + box.width, y: box.y },
    sw: { x: box.x, y: box.y + box.height },
    se: { x: box.x + box.width, y: box.y + box.height },
  };

  for (const handle of RESIZE_HANDLES) {
    const corner = corners[handle];
    if (Math.abs(point.x - corner.x) <= reach && Math.abs(point.y - corner.y) <= reach) return handle;
  }
  return null;
}

/** Whether a point lies on a layer. */
export function isInsideLayer(point: { x: number; y: number }, box: LayerBox): boolean {
  return point.x >= box.x && point.x <= box.x + box.width && point.y >= box.y && point.y <= box.y + box.height;
}

/**
 * The box after a corner has been dragged.
 *
 * The opposite corner stays where it is. Keeping the shape follows whichever side was
 * pulled further, so the corner tracks the pointer as closely as the shape allows.
 */
export function applyResize(box: LayerBox, handle: ResizeHandle, dx: number, dy: number, keepAspect = false): LayerBox {
  const west = handle === 'nw' || handle === 'sw';
  const north = handle === 'nw' || handle === 'ne';

  let width = Math.max(MIN_LAYER_SIZE, box.width + (west ? -dx : dx));
  let height = Math.max(MIN_LAYER_SIZE, box.height + (north ? -dy : dy));

  if (keepAspect && box.width > 0 && box.height > 0) {
    const ratio = box.width / box.height;
    if (width / height > ratio) height = width / ratio;
    else width = height * ratio;
    width = Math.max(MIN_LAYER_SIZE, width);
    height = Math.max(MIN_LAYER_SIZE, height);
  }

  return {
    x: west ? box.x + box.width - width : box.x,
    y: north ? box.y + box.height - height : box.y,
    width,
    height,
  };
}

/** Whether a point has hold of the grip that turns a layer, which sits above it. */
export function isOnRotateHandle(
  point: { x: number; y: number },
  box: LayerBox,
  fit: StageFit,
  tolerancePx = HANDLE_TOLERANCE_PX,
  transform: LayerTransform = UNTURNED
): boolean {
  const drawn = drawnScale(fit, transform);
  // The grip is given a wider grab than a corner, since it is the only way to turn a layer.
  const reach = (tolerancePx * 1.5) / drawn;
  const grip = { x: box.x + box.width / 2, y: box.y - ROTATE_HANDLE_REACH_PX / drawn };
  return Math.abs(point.x - grip.x) <= reach && Math.abs(point.y - grip.y) <= reach;
}

/**
 * The angle from the middle of a layer out to a point, in degrees.
 *
 * Zero points straight up, which is where the grip rests, so dragging it round reads as
 * turning the layer by the angle the pointer has travelled.
 */
export function angleFromCentre(
  point: { x: number; y: number },
  box: LayerBox,
  transform: LayerTransform = UNTURNED
): number {
  const pivot = pivotOf(box, transform);
  return (Math.atan2(point.x - pivot.x, -(point.y - pivot.y)) * 180) / Math.PI;
}

/** An angle brought into 0-360, and snapped to the nearest step when asked. */
export function normaliseAngle(degrees: number, stepDeg = 0): number {
  const wrapped = ((degrees % 360) + 360) % 360;
  if (stepDeg <= 0) return Math.round(wrapped * 10) / 10;
  return (Math.round(wrapped / stepDeg) * stepDeg) % 360;
}
