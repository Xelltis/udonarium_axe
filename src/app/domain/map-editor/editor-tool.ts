/**
 * The tools the editor offers, and the kinds of drawing each makes.
 *
 * It is **vocabulary** rather than screen state, so it belongs to the model, where both the renderer and the model can find it.
 */

export type EditorTool =
  | 'settings'
  | 'select'
  | 'cellPaint'
  | 'cellErase'
  | 'fill'
  | 'shape'
  | 'line'
  | 'polygon'
  | 'freehand'
  | 'text'
  | 'stamp'
  | 'image'
  | 'functionPaint'
  | 'functionErase';

export type LineKind = 'straight' | 'polyline' | 'curve' | 'closedCurve';

export type ShapeGeneratorKind =
  'rect' | 'ellipse' | 'triangle' | 'pentagon' | 'hexagon' | 'star5' | 'star6' | 'balloon';
