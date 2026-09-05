import { GridType } from '@axe/domain/tabletop/game-table';
import { asFunctionRole, sanitizeFunctionSpec } from '@axe/features/map-editor/model/function-layer';
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
} from '@axe/features/map-editor/model/scene';
import { normalizeTextureId } from '@axe/features/map-editor/model/textures';

export function serializeScene(scene: MapScene): string {
  return JSON.stringify({ ...scene, version: MAP_SCENE_VERSION });
}

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isPositiveFiniteNumber(v: unknown): v is number {
  return isFiniteNumber(v) && (v as number) > 0;
}

const VALID_KINDS = new Set(['cell', 'shape', 'stamp', 'freehand', 'text', 'image', 'function']);

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

function sanitizeShapeItem(raw: unknown): ShapeItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  if (!VALID_SHAPE_KINDS.has(r['shape'] as ShapeItem['shape'])) return null;
  const item = { ...r } as unknown as ShapeItem;
  if (r['stroke'] && typeof r['stroke'] === 'object') {
    const rawStroke = r['stroke'] as Record<string, unknown>;
    const stroke = { ...rawStroke } as unknown as StrokeStyle;
    const dash = sanitizeDash(rawStroke['dash']);
    if (dash) stroke.dash = dash;
    else delete stroke.dash;
    if ('fill' in rawStroke) {
      stroke.fill = rawStroke['fill'] == null ? null : sanitizeFill(rawStroke['fill']);
    }
    item.stroke = stroke;
  }
  if ('shadow' in r) {
    item.shadow = r['shadow'] == null ? null : sanitizeShadow(r['shadow']);
  }
  return item;
}

function sanitizeImageItem(raw: unknown): ImageItem | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const item = { ...r } as unknown as ImageItem;
  if ('clipToCells' in r) item.clipToCells = r['clipToCells'] === true;
  if ('flipX' in r) item.flipX = r['flipX'] === true;
  if ('flipY' in r) item.flipY = r['flipY'] === true;
  item.crop = sanitizeCrop(r['crop']);
  if (!item.crop) delete item.crop;
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

function sanitizeLayer(raw: Record<string, unknown>): MapLayer {
  const base = {
    id: String(raw['id'] ?? ''),
    kind: raw['kind'] as MapLayer['kind'],
    name: String(raw['name'] ?? ''),
    visible: raw['visible'] !== false,
    locked: raw['locked'] === true,
    opacity: Math.max(0, Math.min(1, isFiniteNumber(raw['opacity']) ? (raw['opacity'] as number) : 1)),
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
    case 'function':
      return {
        ...base,
        kind: 'function',
        role: asFunctionRole(raw['role']),
        cells: sanitizeFunctionCells(raw['cells']),
        spec: sanitizeFunctionSpec(raw['spec']),
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
  };
}

function sanitizeGuides(raw: unknown): SceneGuideLine[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const kept = raw
    .filter((entry): entry is Record<string, unknown> => typeof entry === 'object' && entry !== null)
    .filter((entry) => (entry['axis'] === 'x' || entry['axis'] === 'y') && isFiniteNumber(entry['at']))
    .map((entry) => ({ id: String(entry['id'] ?? ''), axis: entry['axis'] as 'x' | 'y', at: entry['at'] as number }));
  return kept.length > 0 ? kept : undefined;
}
