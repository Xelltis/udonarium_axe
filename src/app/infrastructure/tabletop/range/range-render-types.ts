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
}

export interface ClipAreaLine {
  clip01x: number;
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
  clip04x: number;
  clip04y: number;
}

export interface ClipAreaSquare {
  clip01x: number;
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
  clip04x: number;
  clip04y: number;
}

export interface ClipAreaTriangle {
  clip01x: number;
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
}

export interface ClipAreaPentagon {
  clip01x: number;
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
  clip04x: number;
  clip04y: number;
  clip05x: number;
  clip05y: number;
}

export interface ClipAreaHexagon {
  clip01x: number;
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
  clip04x: number;
  clip04y: number;
  clip05x: number;
  clip05y: number;
  clip06x: number;
  clip06y: number;
}

export interface ClipAreaCorn {
  clip01x: number; // the starting point at the base
  clip01y: number;
  clip02x: number;
  clip02y: number;
  clip03x: number;
  clip03y: number;
  clip04x: number;
  clip04y: number;
  clip05x: number; // the tip
  clip05y: number;
  clip06x: number; // where it turns back
  clip06y: number;
  clip07x: number;
  clip07y: number;
  clip08x: number;
  clip08y: number;
  clip09x: number;
  clip09y: number;
}
