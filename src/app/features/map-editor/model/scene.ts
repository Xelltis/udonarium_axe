import { GridType } from '@axe/domain/tabletop/game-table';
import { isHexGrid } from '@axe/domain/tabletop/hex-geometry';
import { computeHexMaskGeometry } from '@axe/domain/tabletop/hex-mask-geometry';
import {
  DEFAULT_FUNCTION_ROLE,
  DEFAULT_FUNCTION_SPEC,
  FunctionSpec,
  MapFunctionRole,
} from '@axe/features/map-editor/model/function-layer';

export const MAP_SCENE_VERSION = 1;

export const DEFAULT_SCENE_BACKGROUND = 'transparent';
export const DEFAULT_SCENE_GRID_COLOR = '#00000059';

export type LayerKind = 'cell' | 'shape' | 'stamp' | 'freehand' | 'text' | 'image' | 'function';

export type FillStyle =
  { type: 'solid'; color: string } | { type: 'texture'; textureId: string; scale: number; rotation: number };

export type StrokeDash = 'solid' | 'dashed' | 'dotted' | 'dashdot' | 'longdash';

export interface StrokeStyle {
  color: string;
  width: number;
  dash?: StrokeDash;
  fill?: FillStyle | null;
}

export interface ShapeShadow {
  color: string;
  blur: number;
  offsetX: number;
  offsetY: number;
}

export interface BaseLayer {
  id: string;
  kind: LayerKind;
  name: string;
  visible: boolean;
  locked: boolean;
  opacity: number;
  /** The bundle this layer is filed under, where it is filed under one at all. */
  group?: string;
}

export interface CellLayer extends BaseLayer {
  kind: 'cell';
  cells: Record<string, FillStyle>;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'polygon' | 'polyline' | 'curve' | 'closedCurve';

export interface ShapeItem {
  id: string;
  shape: ShapeKind;
  points: number[];
  fill: FillStyle | null;
  stroke: StrokeStyle | null;
  rotation: number;
  shadow?: ShapeShadow | null;
}

export interface ShapeLayer extends BaseLayer {
  kind: 'shape';
  items: ShapeItem[];
}

export interface StampItem {
  id: string;
  stampId: string;
  x: number;
  y: number;
  size: number;
  rotation: number;
  flipX: boolean;
  flipY: boolean;
  color: string | null;
}

export interface StampLayer extends BaseLayer {
  kind: 'stamp';
  items: StampItem[];
}

export interface FreehandStroke {
  id: string;
  points: number[];
  color: string;
  width: number;
}

export interface FreehandLayer extends BaseLayer {
  kind: 'freehand';
  strokes: FreehandStroke[];
}

export type TextAlign = 'left' | 'center' | 'right';

export interface TextItem {
  id: string;
  x: number;
  y: number;
  text: string;
  fontSize: number;
  color: string;
  bold: boolean;
  italic: boolean;
  align: TextAlign;
  /** A card behind the words, which is what makes a note a note rather than a caption. */
  background?: string;
  /** A line drawn round every letter, so pale words hold up over a busy picture. */
  outline?: TextOutline | null;
  shadow?: ShapeShadow | null;
  underline?: boolean;
  strike?: boolean;
}

export interface TextOutline {
  color: string;
  width: number;
}

export interface TextLayer extends BaseLayer {
  kind: 'text';
  items: TextItem[];
}

export interface ImageItem {
  id: string;
  imageIdentifier: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  opacity: number;
  flipX?: boolean;
  flipY?: boolean;
  crop?: { x: number; y: number; w: number; h: number };
  clipToCells?: boolean;
}

export interface ImageLayer extends BaseLayer {
  kind: 'image';
  items: ImageItem[];
}

/**
 * Cells painted for what they do rather than how they look.
 *
 * It carries no fill: the look comes from the role, and the layer never reaches the picture
 * the map is exported as.
 */
export interface FunctionLayer extends BaseLayer {
  kind: 'function';
  role: MapFunctionRole;
  cells: Record<string, true>;
  spec: FunctionSpec;
}

export type MapLayer = CellLayer | ShapeLayer | StampLayer | FreehandLayer | TextLayer | ImageLayer | FunctionLayer;

export interface MapScene {
  version: number;
  cols: number;
  rows: number;
  cellPx: number;
  gridType: GridType;
  background: string;
  gridColor: string;
  gridVisible: boolean;
  layers: MapLayer[];
  guides?: SceneGuideLine[];
}

/** A line laid across the scene to line things up against, kept with the scene it was laid on. */
export interface SceneGuideLine {
  id: string;
  axis: 'x' | 'y';
  at: number;
}

export function newId(): string {
  return crypto.randomUUID();
}

export function cellKey(col: number, row: number): string {
  return col + ',' + row;
}

export function parseCellKey(key: string): { col: number; row: number } {
  const comma = key.indexOf(',');
  return { col: Number(key.slice(0, comma)), row: Number(key.slice(comma + 1)) };
}

export function createScene(cols = 20, rows = 15, cellPx = 64, gridType: GridType = GridType.SQUARE): MapScene {
  return {
    version: MAP_SCENE_VERSION,
    cols,
    rows,
    cellPx,
    gridType,
    background: DEFAULT_SCENE_BACKGROUND,
    gridColor: DEFAULT_SCENE_GRID_COLOR,
    gridVisible: true,
    layers: [],
  };
}

export function createLayer(kind: LayerKind, name: string): MapLayer {
  const base: BaseLayer = { id: newId(), kind, name, visible: true, locked: false, opacity: 1 };
  switch (kind) {
    case 'cell':
      return { ...base, kind: 'cell', cells: {} };
    case 'function':
      return { ...base, kind: 'function', role: DEFAULT_FUNCTION_ROLE, cells: {}, spec: { ...DEFAULT_FUNCTION_SPEC } };
    case 'shape':
      return { ...base, kind: 'shape', items: [] };
    case 'stamp':
      return { ...base, kind: 'stamp', items: [] };
    case 'freehand':
      return { ...base, kind: 'freehand', strokes: [] };
    case 'text':
      return { ...base, kind: 'text', items: [] };
    case 'image':
      return { ...base, kind: 'image', items: [] };
  }
}

export function cloneScene(scene: MapScene): MapScene {
  return structuredClone(scene);
}

export function sceneWidthPx(scene: MapScene): number {
  if (isHexGrid(scene.gridType)) {
    const geo = computeHexMaskGeometry(scene.cols, scene.rows, scene.cellPx, scene.gridType);
    if (geo) return geo.pixelW;
  }
  return scene.cols * scene.cellPx;
}

export function sceneHeightPx(scene: MapScene): number {
  if (isHexGrid(scene.gridType)) {
    const geo = computeHexMaskGeometry(scene.cols, scene.rows, scene.cellPx, scene.gridType);
    if (geo) return geo.pixelH;
  }
  return scene.rows * scene.cellPx;
}
