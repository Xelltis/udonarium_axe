import { Matrix3D } from '@axe/core/transform/matrix-3d';
import type { IPoint3D } from '@axe/core/transform/transform';
import { TABLE_PERSPECTIVE_PX } from '@axe/domain/tabletop/physical-scale';

/**
 * Where the table's camera stands: how far the board is slid and pushed back, and how it is turned,
 * in the units the table's transform is written in (pixels and degrees).
 */
export interface TableCameraView {
  readonly positionX: number;
  readonly positionY: number;
  readonly positionZ: number;
  readonly rotateX: number;
  readonly rotateY: number;
  readonly rotateZ: number;
  /** Drawn without perspective, the push back standing in as a scale. */
  readonly orthographic: boolean;
  /**
   * How far in front of the box the camera looks through the eye stands, in pixels: the table's own
   * 3000 where none is given, and less for a camera that follows a piece about, which sees wider.
   */
  readonly perspectivePx?: number;
}

/** How far in front of the box the camera looks through a view's eye stands, in pixels. */
export function perspectiveOf(view: TableCameraView): number {
  return view.perspectivePx ?? TABLE_PERSPECTIVE_PX;
}

/** Where the table is laid out on the page and how big its board is, in CSS pixels. */
export interface TableLayout {
  /** The page position and size of the box the camera looks through. */
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
  /** The board, as wide and deep as its cells run. */
  readonly boardWidth: number;
  readonly boardHeight: number;
}

/** The camera the table opens with. */
export const DEFAULT_TABLE_CAMERA_VIEW: TableCameraView = {
  positionX: 100,
  positionY: 0,
  positionZ: 0,
  rotateX: 50,
  rotateY: 0,
  rotateZ: 10,
  orthographic: false,
};

/** A number as the transform writes it, to four places, so what is worked out is what is drawn. */
function written(value: number): number {
  return Number(value.toFixed(4));
}

/**
 * How far back the camera stands from the board, held short of the plane it would be standing on.
 * At the plane the divisor is nothing and the browser throws the whole transform out; past it the
 * board is drawn mirrored.
 */
export function cameraDepth(positionZ: number): number {
  return Math.max(TABLE_PERSPECTIVE_PX / 100, TABLE_PERSPECTIVE_PX - positionZ);
}

/** The scale an orthographic view draws the board at, to six places as the transform writes it. */
export function orthographicScale(positionZ: number): number {
  return Number((TABLE_PERSPECTIVE_PX / cameraDepth(positionZ)).toFixed(6));
}

/** The CSS transform the board is drawn with for a view. */
export function tableCameraTransform(view: TableCameraView): string {
  const scale = view.orthographic ? `scale(${orthographicScale(view.positionZ).toFixed(6)}) ` : '';
  return (
    `${scale}translateZ(${view.positionZ.toFixed(4)}px) translateY(${view.positionY.toFixed(4)}px) ` +
    `translateX(${view.positionX.toFixed(4)}px) rotateY(${view.rotateY.toFixed(4)}deg) ` +
    `rotateX(${view.rotateX.toFixed(4)}deg) rotateZ(${view.rotateZ.toFixed(4)}deg)`
  );
}

/** The view written as `x,y,z,rx,ry,rz,orthographic`, which the table puts on itself for tests to read. */
export function tableCameraAttribute(view: TableCameraView): string {
  return [
    view.positionX.toFixed(4),
    view.positionY.toFixed(4),
    view.positionZ.toFixed(4),
    view.rotateX.toFixed(4),
    view.rotateY.toFixed(4),
    view.rotateZ.toFixed(4),
    view.orthographic ? 1 : 0,
  ].join(',');
}

/**
 * Where the board's box sits in the box the camera looks through, before the camera moves it.
 *
 * The box is centred. A board wider than the screen is the exception: its side margins come to
 * nothing rather than going below it, so it starts at the left edge. Top and bottom have no such
 * floor. All three browser engines lay it out this way.
 */
export function boardOffset(layout: TableLayout): { x: number; y: number } {
  return {
    x: Math.max(0, (layout.width - layout.boardWidth) / 2),
    y: (layout.height - layout.boardHeight) / 2,
  };
}

const scratch = new Matrix3D();

function appendRows(out: Matrix3D, rows: readonly number[]): void {
  out.append(scratch.setData(rows as number[]));
}

/**
 * Appends the turn, push and scale of a view after the current transform, in the order the
 * browser applies the functions of the transform the board is drawn with.
 */
function appendView(out: Matrix3D, view: TableCameraView): void {
  const z = (written(view.rotateZ) * Math.PI) / 180;
  const x = (written(view.rotateX) * Math.PI) / 180;
  const y = (written(view.rotateY) * Math.PI) / 180;
  appendRows(out, [Math.cos(z), Math.sin(z), 0, 0, -Math.sin(z), Math.cos(z), 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  appendRows(out, [1, 0, 0, 0, 0, Math.cos(x), Math.sin(x), 0, 0, -Math.sin(x), Math.cos(x), 0, 0, 0, 0, 1]);
  appendRows(out, [Math.cos(y), 0, -Math.sin(y), 0, 0, 1, 0, 0, Math.sin(y), 0, Math.cos(y), 0, 0, 0, 0, 1]);
  out.appendPosition(written(view.positionX), written(view.positionY), written(view.positionZ));
  if (view.orthographic) {
    const s = orthographicScale(view.positionZ);
    appendRows(out, [s, 0, 0, 0, 0, s, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  }
}

/**
 * The matrix that takes a point of the board into the space the eye looks through: in pixels from
 * the middle of the box the camera looks through, x to the right, y down the page and z out of it
 * towards the eye. A perspective view sees this space from `TABLE_PERSPECTIVE_PX` out along z; an
 * orthographic one has its scale in it already.
 *
 * The board turns about its middle, which stands where the board's box sits in the box the camera
 * looks through.
 */
export function tableEyeMatrix(view: TableCameraView, layout: TableLayout, out: Matrix3D = new Matrix3D()): Matrix3D {
  const middleX = layout.boardWidth / 2;
  const middleY = layout.boardHeight / 2;
  const offset = boardOffset(layout);
  out.identity();
  out.appendPosition(-middleX, -middleY, 0);
  appendView(out, view);
  out.appendPosition(middleX + offset.x - layout.width / 2, middleY + offset.y - layout.height / 2, 0);
  return out;
}

/**
 * The matrix that takes a point of the board onto the page, through the camera and the perspective
 * the table is drawn in. A point's place on the page is its x and y over its w.
 *
 * The board is seen from in front of the middle of the box the camera looks through, 3000 pixels
 * back (`TABLE_PERSPECTIVE_PX`) unless the view says otherwise.
 */
export function tableSceneMatrix(view: TableCameraView, layout: TableLayout, out: Matrix3D = new Matrix3D()): Matrix3D {
  tableEyeMatrix(view, layout, out);
  if (!view.orthographic) out.appendPerspective(perspectiveOf(view));
  out.appendPosition(layout.left + layout.width / 2, layout.top + layout.height / 2, 0);
  return out;
}

/** A matrix's sixteen numbers, a column at a time, as a graphics library reads them in. */
export function matrixColumns(matrix: Matrix3D): number[] {
  const m = matrix;
  return [
    m.m11,
    m.m12,
    m.m13,
    m.m14,
    m.m21,
    m.m22,
    m.m23,
    m.m24,
    m.m31,
    m.m32,
    m.m33,
    m.m34,
    m.m41,
    m.m42,
    m.m43,
    m.m44,
  ];
}

/** Where a point of the board shows on the page, through a matrix from `tableSceneMatrix`. */
export function pageOfTablePoint(scene: Matrix3D, x: number, y: number, z: number): IPoint3D {
  return scene.project({ x, y, z, w: 1 });
}

/**
 * How large a thing at a point of the board is drawn, against how large it would be drawn at the
 * depth of the page itself: the perspective draws a thing the smaller the further off it stands. An
 * orthographic view draws everything at one size, and so answers one everywhere.
 */
export function drawnScaleAt(scene: Matrix3D, x: number, y: number, z: number): number {
  const w = x * scene.m14 + y * scene.m24 + z * scene.m34 + scene.m44;
  return w > 0 ? 1 / w : 0;
}

/** A point of the board's space: x and y across the board, z up off it, all in table pixels. */
export interface TablePoint {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

/**
 * The line of sight through a point of the page, in the board's space: everything on it is drawn
 * at that point. Points further along the direction lie further from the eye.
 */
export interface TableRay {
  readonly origin: TablePoint;
  /** A unit vector, pointing away from the eye. */
  readonly direction: TablePoint;
}

/** A point given in the page's own depth, carried back through the inverse scene matrix. */
function intoBoard(inverseScene: Matrix3D, pageX: number, pageY: number, depth: number): TablePoint {
  const m = inverseScene;
  const x = pageX * m.m11 + pageY * m.m21 + depth * m.m31 + m.m41;
  const y = pageX * m.m12 + pageY * m.m22 + depth * m.m32 + m.m42;
  const z = pageX * m.m13 + pageY * m.m23 + depth * m.m33 + m.m43;
  const w = pageX * m.m14 + pageY * m.m24 + depth * m.m34 + m.m44;
  return { x: x / w, y: y / w, z: z / w };
}

/**
 * The line of sight through a point of the page, through the inverse of a matrix from
 * `tableSceneMatrix`.
 *
 * The page keeps a depth of its own through the matrix, which grows towards the eye; two depths
 * at the same page point give two points of the board's space on the one line of sight.
 */
export function tableRayOfPage(inverseScene: Matrix3D, pageX: number, pageY: number): TableRay {
  const near = intoBoard(inverseScene, pageX, pageY, 0);
  const far = intoBoard(inverseScene, pageX, pageY, -1000);
  const dx = far.x - near.x;
  const dy = far.y - near.y;
  const dz = far.z - near.z;
  const length = Math.hypot(dx, dy, dz);
  return { origin: near, direction: { x: dx / length, y: dy / length, z: dz / length } };
}

/**
 * Where a point of the page lands on the board's own plane, through the inverse of a matrix from
 * `tableSceneMatrix`. The answer's z is the depth the point had before it was carried to the plane,
 * as `Transform.globalToLocal` gives it.
 */
export function tablePointOfPage(inverseScene: Matrix3D, pageX: number, pageY: number): IPoint3D {
  return inverseScene.unproject({ x: pageX, y: pageY });
}
