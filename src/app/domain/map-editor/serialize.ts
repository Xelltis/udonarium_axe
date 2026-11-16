import { clamp } from '@axe/core/util/clamp';
import { MAP_FUNCTION_ROLES, MapFunctionRole, sanitizeFunctionLayerLook } from '@axe/domain/map-editor/function-layer';
import {
  DEFAULT_SCENE_BACKGROUND,
  DEFAULT_SCENE_GRID_COLOR,
  FillStyle,
  ImageItem,
  MAP_SCENE_VERSION,
  MapLayer,
  MapScene,
  SceneGuideLine,
  ShapeItem,
  ShapeShadow,
  StrokeDash,
  StrokeStyle,
} from '@axe/domain/map-editor/scene';
import { normalizeTextureId } from '@axe/domain/map-editor/textures';
import { GridType } from '@axe/domain/tabletop/game-table';
import { decodeGroundHeights, decodeGroundPaint } from '@axe/domain/tabletop/ground/ground-chunk-data';

/**
 * The JSON text of a scene, stamped with the current scene version, as map files and whiteboards
 * store it.
 */
export function serializeScene(scene: MapScene): string {
  return JSON.stringify({ ...scene, version: MAP_SCENE_VERSION });
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return isFiniteNumber(v) && (v as number) > 0;
}

const VALID_KINDS = new Set(['cell', 'shape', 'stamp', 'freehand', 'text', 'image', 'function', 'relief']);

const VALID_DASHES = new Set<StrokeDash>(['solid', 'dashed', 'dotted', 'dashdot', 'longdash']);

const VALID_SHAPE_KINDS = new Set<ShapeItem['shape']>([
  'rect',
  'ellipse',
  'line',
  'polygon',
  'polyline',
  'curve',
  'closedCurve',
]);

function sanitizeDash(value: unknown): StrokeDash | undefined {
  return typeof value === 'string' && VALID_DASHES.has(value as StrokeDash) ? (value as StrokeDash) : undefined;
}

function sanitizeShadow(value: unknown): ShapeShadow | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  return {
    color: typeof v['color'] === 'string' ? v['color'] : '#000000',
    blur: isFiniteNumber(v['blur']) ? (v['blur'] as number) : 0,
    offsetX: isFiniteNumber(v['offsetX']) ? (v['offsetX'] as number) : 0,
    offsetY: isFiniteNumber(v['offsetY']) ? (v['offsetY'] as number) : 0,
  };
}

function sanitizeFill(value: unknown): FillStyle | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const v = value as Record<string, unknown>;
  if (v['type'] === 'solid') {
    return { type: 'solid', color: typeof v['color'] === 'string' ? v['color'] : '#000000' };
  }
  if (v['type'] === 'texture' && typeof v['textureId'] === 'string') {
    return {
      type: 'texture',
      textureId: normalizeTextureId(v['textureId']),
      scale: isFiniteNumber(v['scale']) ? (v['scale'] as number) : 1,
      rotation: isFiniteNumber(v['rotation']) ? (v['rotation'] as number) : 0,
    };
  }
  return null;
}

/** The numbers of a list of coordinates; a list with anything else in it, or no list, is empty. */
function sanitizePoints(value: unknown): number[] {
  return Array.isArray(value) && value.every(isFiniteNumber) ? (value as number[]) : [];
}

function sanitizeStroke(value: unknown): StrokeStyle | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  const stroke: StrokeStyle = {
    color: typeof v['color'] === 'string' ? v['color'] : '#000000',
    width: isFiniteNumber(v['width']) ? v['width'] : 1,
  };
  const dash = sanitizeDash(v['dash']);
  if (dash) stroke.dash = dash;
  if ('fill' in v) stroke.fill = v['fill'] == null ? null : sanitizeFill(v['fill']);
  return stroke;
}

function sanitizeShapeItem(raw: unknown): ShapeItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const shape = r['shape'] as ShapeItem['shape'];
  if (!VALID_SHAPE_KINDS.has(shape)) return null;
  const item: ShapeItem = {
    id: String(r['id'] ?? ''),
    shape,
    points: sanitizePoints(r['points']),
    fill: r['fill'] == null ? null : sanitizeFill(r['fill']),
    stroke: sanitizeStroke(r['stroke']),
    rotation: isFiniteNumber(r['rotation']) ? r['rotation'] : 0,
  };
  if ('shadow' in r) item.shadow = r['shadow'] == null ? null : sanitizeShadow(r['shadow']);
  return item;
}

function sanitizeImageItem(raw: unknown): ImageItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const number = (key: string, miss: number): number => (isFiniteNumber(r[key]) ? r[key] : miss);
  const item: ImageItem = {
    id: String(r['id'] ?? ''),
    imageIdentifier: typeof r['imageIdentifier'] === 'string' ? r['imageIdentifier'] : '',
    x: number('x', 0),
    y: number('y', 0),
    w: number('w', 0),
    h: number('h', 0),
    rotation: number('rotation', 0),
    opacity: number('opacity', 1),
  };
  if ('clipToCells' in r) item.clipToCells = r['clipToCells'] === true;
  if ('flipX' in r) item.flipX = r['flipX'] === true;
  if ('flipY' in r) item.flipY = r['flipY'] === true;
  const crop = sanitizeCrop(r['crop']);
  if (crop) item.crop = crop;
  return item;
}

function sanitizeCrop(raw: unknown): ImageItem['crop'] {
  if (typeof raw !== 'object' || raw === null) return undefined;
  const r = raw as Record<string, unknown>;
  const sides = ['x', 'y', 'w', 'h'].map((side) => r[side]);
  if (!sides.every((side) => typeof side === 'number' && Number.isFinite(side))) return undefined;
  const [x, y, w, h] = sides as number[];
  if (w <= 0 || h <= 0) return undefined;
  return { x, y, w, h };
}

const VALID_GRID_TYPES = new Set<number>([
  GridType.NONE,
  GridType.SQUARE,
  GridType.HEX_VERTICAL,
  GridType.HEX_HORIZONTAL,
]);

function sanitizeGridType(value: unknown): GridType {
  return typeof value === 'number' && VALID_GRID_TYPES.has(value) ? (value as GridType) : GridType.SQUARE;
}

function isValidLayer(layer: unknown): boolean {
  if (typeof layer !== 'object' || layer === null) return false;
  const l = layer as Record<string, unknown>;
  if (typeof l['id'] !== 'string') return false;
  if (!VALID_KINDS.has(l['kind'] as string)) return false;
  if (typeof l['name'] !== 'string') return false;
  return true;
}

/**
 * Whether a value has the outline of a scene: a numeric version, positive columns, rows and cell
 * size, and layers that each have an id, a known kind and a name.
 *
 * Only the outline is checked; the layers' contents are cleaned by `deserializeScene`.
 */
export function isMapScene(value: unknown): value is MapScene {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (!isFiniteNumber(v['version'])) return false;
  if (!isPositiveFiniteNumber(v['cols'])) return false;
  if (!isPositiveFiniteNumber(v['rows'])) return false;
  if (!isPositiveFiniteNumber(v['cellPx'])) return false;
  if (!Array.isArray(v['layers'])) return false;
  for (const layer of v['layers']) {
    if (!isValidLayer(layer)) return false;
  }
  return true;
}

/** A painted cell is remembered by its key alone, so whatever was written for it reads as painted. */
function sanitizeFunctionCells(value: unknown): Record<string, true> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const cells: Record<string, true> = {};
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (held) cells[key] = true;
  }
  return cells;
}

/**
 * The chunks of a relief layer that read as chunks: a place of two whole numbers, and text that
 * decodes as what the chunk keeps, its heights or its paint.
 */
function sanitizeReliefChunks(value: unknown, decodes: (text: string) => unknown): Record<string, string> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {};
  const chunks: Record<string, string> = {};
  for (const [key, held] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+,\d+$/.test(key) || typeof held !== 'string' || !decodes(held)) continue;
    chunks[key] = held;
  }
  return chunks;
}

function sanitizeLayer(raw: Record<string, unknown>): MapLayer {
  const base = {
    id: String(raw['id'] ?? ''),
    kind: raw['kind'] as MapLayer['kind'],
    name: String(raw['name'] ?? ''),
    visible: raw['visible'] !== false,
    locked: raw['locked'] === true,
    opacity: clamp(isFiniteNumber(raw['opacity']) ? (raw['opacity'] as number) : 1, 0, 1),
    group: typeof raw['group'] === 'string' && raw['group'] ? (raw['group'] as string) : undefined,
  };

  switch (raw['kind']) {
    case 'cell':
      return {
        ...base,
        kind: 'cell',
        cells: (typeof raw['cells'] === 'object' && raw['cells'] !== null && !Array.isArray(raw['cells'])
          ? raw['cells']
          : {}) as Record<string, never>,
      };
    case 'function': {
      const look = sanitizeFunctionLayerLook(raw['role'], raw['spec']);
      return {
        ...base,
        kind: 'function',
        role: look.role,
        cells: sanitizeFunctionCells(raw['cells']),
        spec: look.spec,
      };
    }
    case 'relief':
      return {
        ...base,
        kind: 'relief',
        chunks: sanitizeReliefChunks(raw['chunks'], decodeGroundHeights),
        paint: sanitizeReliefChunks(raw['paint'], decodeGroundPaint),
      };
    case 'shape':
      return {
        ...base,
        kind: 'shape',
        items: Array.isArray(raw['items'])
          ? (raw['items'].map(sanitizeShapeItem).filter((i): i is ShapeItem => i !== null) as ShapeItem[])
          : [],
      };
    case 'stamp':
      return { ...base, kind: 'stamp', items: Array.isArray(raw['items']) ? raw['items'] : [] };
    case 'freehand':
      return { ...base, kind: 'freehand', strokes: Array.isArray(raw['strokes']) ? raw['strokes'] : [] };
    case 'text':
      return { ...base, kind: 'text', items: Array.isArray(raw['items']) ? raw['items'] : [] };
    case 'image':
      return {
        ...base,
        kind: 'image',
        items: Array.isArray(raw['items'])
          ? (raw['items'].map(sanitizeImageItem).filter((i): i is ImageItem => i !== null) as ImageItem[])
          : [],
      };
    default:
      return { ...base, kind: 'cell', cells: {} };
  }
}

/**
 * Reads a scene from JSON text, cleaning it as it goes, or null when the text is not JSON or not a
 * scene.
 *
 * Layers of unknown kinds are dropped, missing settings fall back to their defaults, and shapes and
 * images that cannot be drawn are left out. The result always carries the current scene version.
 */
export function deserializeScene(json: string): MapScene | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const raw = parsed as Record<string, unknown>;

  if (!Array.isArray(raw['layers'])) return null;
  const rawLayers = (raw['layers'] as unknown[]).filter((l) => {
    if (typeof l !== 'object' || l === null) return false;
    return VALID_KINDS.has((l as Record<string, unknown>)['kind'] as string);
  });

  const filtered = { ...raw, layers: rawLayers };
  if (!isMapScene(filtered)) return null;

  return {
    version: MAP_SCENE_VERSION,
    cols: raw['cols'] as number,
    rows: raw['rows'] as number,
    cellPx: raw['cellPx'] as number,
    gridType: sanitizeGridType(raw['gridType']),
    background: typeof raw['background'] === 'string' ? raw['background'] : DEFAULT_SCENE_BACKGROUND,
    gridColor: typeof raw['gridColor'] === 'string' ? raw['gridColor'] : DEFAULT_SCENE_GRID_COLOR,
    gridVisible: raw['gridVisible'] !== false,
    layers: rawLayers.map((l) => sanitizeLayer(l as Record<string, unknown>)),
    guides: sanitizeGuides(raw['guides']),
    paintedRoles: sanitizePaintedRoles(raw['paintedRoles']),
    paintedRelief: raw['paintedRelief'] === true ? true : undefined,
  };
}

/**
 * The roles a saved scene had painted, keeping only the ones this version knows.
 *
 * Read back rather than worked out afresh from the layers: a scene is saved with its layers
 * deleted precisely when somebody meant to delete them, and the whole point of the list is to
 * outlive the layer.
 */
function sanitizePaintedRoles(raw: unknown): MapFunctionRole[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = [...new Set(raw.filter((role): role is MapFunctionRole => MAP_FUNCTION_ROLES.includes(role)))];
  return kept.length > 0 ? kept : undefined;
}

function sanitizeGuides(raw: unknown): SceneGuideLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .filter((entry) => (entry['axis'] === 'x' || entry['axis'] === 'y') && isFiniteNumber(entry['at']))
    .map((entry) => ({ id: String(entry['id'] ?? ''), axis: entry['axis'] as 'x' | 'y', at: entry['at'] as number }));
  return kept.length > 0 ? kept : undefined;
}
