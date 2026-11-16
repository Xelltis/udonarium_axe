export type GridPosition = { gx: number; gy: number };
export type StrokeGridFunc = (w: number, h: number) => GridPosition;

export interface RangeRenderSetting {
  areaWidth: number;
  areaHeight: number;
  range: number;
  width: number;
  centerX: number;
  centerY: number;
  gridSize: number;
  type: string;
  gridColor: string;
  rangeColor: string;
  fanDegree: number;
  degree: number;
  offSetX: boolean;
  offSetY: boolean;
  fillOutLine: boolean;
  gridType: number;
  isDocking: boolean;
  /**
   * Where what is painted is noted, where given: the shape and each cell filled, as polygons in pixels
   * from the range's origin, for a press to take the range only where it is painted.
   */
  painted?: { x: number; y: number }[][];
}

/**
 * The corners of the polygon a range's cell canvas is cut to, clockwise, in pixels from the
 * range's origin.
 */
export type ClipArea = readonly { x: number; y: number }[];
