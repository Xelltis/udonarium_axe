import { ImageItem } from '@axe/domain/map-editor/scene';

/**
 * The gesture under way.
 *
 * It does not follow the tool names. A line is one thing or another by its kind, and the
 * eraser behaves differently against cells and against shapes.
 */
export type GestureKind =
  'none' | 'select' | 'paint' | 'vectorErase' | 'fill' | 'box' | 'path' | 'stamp' | 'image' | 'freehand' | 'text';

/**
 * One gesture, from press to release.
 *
 * The half-drawn line, the image corner being held, the last cell painted — none of it
 * outlives the release or reaches the map. Each tool uses a different handful, so the rest
 * stays empty.
 */
export class MapEditorGesture {
  /** The gesture decided at the press. Switching tools mid-drag does not change it. */
  kind: GestureKind = 'none';
  /** Whether a press is under way. A tool that finishes on the press, such as the stamp, never sets it. */
  dragging = false;
  /** Where the pointer was last, in map coordinates, for measuring against the next move. */
  lastMove: { x: number; y: number } | null = null;
  lastPointerScene: { x: number; y: number } | null = null;

  /** The shape being drawn: where it started and where the pointer is now. */
  draftStart: { x: number; y: number } | null = null;
  draftCurrent: { x: number; y: number } | null = null;
  /** The points placed so far for a polyline or polygon, x then y. */
  draftPoints: number[] = [];
  /** The freehand trail, in the same order. */
  freehandPoints: number[] = [];

  /** What painting and erasing remember so as not to cover the same cell twice. */
  lastPaintedCell: string | null = null;
  lastPaintPx: { x: number; y: number } | null = null;
  /** Whether the eraser is working on shapes rather than cells. */
  vectorErasing = false;
  lastErasePx: { x: number; y: number } | null = null;

  /** Where the pointer was last while dragging the view, in screen coordinates. */
  panLast: { x: number; y: number } | null = null;

  /** An image being stretched by a corner. The anchor is the opposite one. */
  imageResize: { item: ImageItem; anchorX: number; anchorY: number } | null = null;
  /** An anchor of a curve being dragged. */
  curveDrag: { index: number } | null = null;

  /** Where the selection is being carried, and whether it actually moved. */
  lastMoveStored: { x: number; y: number } | null = null;
  selectionMoved = false;
}
