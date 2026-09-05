import { cellNeighbors } from '@axe/features/map-editor/model/grid-cells';
import {
  cellKey,
  CellLayer,
  FillStyle,
  FreehandLayer,
  FreehandStroke,
  FunctionLayer,
  ImageItem,
  ImageLayer,
  MapLayer,
  MapScene,
  newId,
  parseCellKey,
  ShapeItem,
  ShapeLayer,
  StampItem,
  StampLayer,
  TextItem,
  TextLayer,
} from '@axe/features/map-editor/model/scene';

function fillStyleEquals(a: FillStyle | null, b: FillStyle | null): boolean {
  if (a === null && b === null) return true;
  if (a === null || b === null) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

export function inBounds(scene: MapScene, col: number, row: number): boolean {
  return col >= 0 && col < scene.cols && row >= 0 && row < scene.rows;
}

export function setCell(layer: CellLayer, col: number, row: number, fill: FillStyle): void {
  layer.cells[cellKey(col, row)] = fill;
}

export function eraseCell(layer: CellLayer, col: number, row: number): void {
  delete layer.cells[cellKey(col, row)];
}

export function getCell(layer: CellLayer, col: number, row: number): FillStyle | null {
  return layer.cells[cellKey(col, row)] ?? null;
}

/** Paints one cell for what it does. The key alone is the record; there is no fill to keep. */
export function setFunctionCell(layer: FunctionLayer, col: number, row: number): void {
  layer.cells[cellKey(col, row)] = true;
}

export function eraseFunctionCell(layer: FunctionLayer, col: number, row: number): void {
  delete layer.cells[cellKey(col, row)];
}

export function hasFunctionCell(layer: FunctionLayer, col: number, row: number): boolean {
  return layer.cells[cellKey(col, row)] === true;
}

export function floodFill(scene: MapScene, layer: CellLayer, col: number, row: number, fill: FillStyle): void {
  if (!inBounds(scene, col, row)) return;
  const startFill = getCell(layer, col, row);
  if (fillStyleEquals(startFill, fill)) return;

  const queue: [number, number][] = [[col, row]];
  const visited = new Set<string>();
  visited.add(cellKey(col, row));

  while (queue.length > 0) {
    const [c, r] = queue.shift()!;
    if (fillStyleEquals(getCell(layer, c, r), startFill)) {
      setCell(layer, c, r, fill);
    }
    const neighbors = cellNeighbors(scene.gridType, c, r);
    for (const [nc, nr] of neighbors) {
      const k = cellKey(nc, nr);
      if (!visited.has(k) && inBounds(scene, nc, nr) && fillStyleEquals(getCell(layer, nc, nr), startFill)) {
        visited.add(k);
        queue.push([nc, nr]);
      }
    }
  }
}

export function addLayer(scene: MapScene, layer: MapLayer): void {
  scene.layers.push(layer);
}

export function removeLayer(scene: MapScene, layerId: string): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx !== -1) scene.layers.splice(idx, 1);
}

export function findLayer(scene: MapScene, layerId: string): MapLayer | undefined {
  return scene.layers.find((l) => l.id === layerId);
}

export function moveLayer(scene: MapScene, layerId: string, delta: number): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const target = Math.max(0, Math.min(scene.layers.length - 1, idx + delta));
  if (target === idx) return;
  const [layer] = scene.layers.splice(idx, 1);
  scene.layers.splice(target, 0, layer);
}

export function reorderLayer(scene: MapScene, layerId: string, toIndex: number): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const clamped = Math.max(0, Math.min(scene.layers.length - 1, toIndex));
  if (clamped === idx) return;
  const [layer] = scene.layers.splice(idx, 1);
  scene.layers.splice(clamped, 0, layer);
}

export function addShape(layer: ShapeLayer, item: ShapeItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

export function updateShape(layer: ShapeLayer, id: string, patch: Partial<ShapeItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

export function removeShape(layer: ShapeLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

export function addStamp(layer: StampLayer, item: StampItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

export function updateStamp(layer: StampLayer, id: string, patch: Partial<StampItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

export function removeStamp(layer: StampLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

export function addImage(layer: ImageLayer, item: ImageItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

export function updateImage(layer: ImageLayer, id: string, patch: Partial<ImageItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

export function removeImage(layer: ImageLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

export function addStroke(layer: FreehandLayer, stroke: FreehandStroke): void {
  if (!stroke.id) stroke.id = newId();
  layer.strokes.push(stroke);
}

export function removeStroke(layer: FreehandLayer, id: string): void {
  const idx = layer.strokes.findIndex((s) => s.id === id);
  if (idx !== -1) layer.strokes.splice(idx, 1);
}

export function updateStroke(layer: FreehandLayer, id: string, patch: Partial<FreehandStroke>): void {
  const idx = layer.strokes.findIndex((s) => s.id === id);
  if (idx !== -1) layer.strokes[idx] = { ...layer.strokes[idx], ...patch, id };
}

export function eraseStrokeAtPoint(
  stroke: FreehandStroke,
  ex: number,
  ey: number,
  radius: number
): FreehandStroke[] | null {
  const pts = stroke.points;
  const runs: number[][] = [];
  let current: number[] = [];
  let erasedAny = false;
  for (let i = 0; i + 1 < pts.length; i += 2) {
    const within = Math.hypot(pts[i] - ex, pts[i + 1] - ey) <= radius;
    if (within) {
      erasedAny = true;
      if (current.length >= 4) runs.push(current);
      current = [];
    } else {
      current.push(pts[i], pts[i + 1]);
    }
  }
  if (current.length >= 4) runs.push(current);
  if (!erasedAny) return null;
  return runs.map((points) => ({ ...stroke, id: '', points }));
}

export function addText(layer: TextLayer, item: TextItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

export function updateText(layer: TextLayer, id: string, patch: Partial<TextItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

export function removeText(layer: TextLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

export function resizeScene(scene: MapScene, cols: number, rows: number): void {
  scene.cols = cols;
  scene.rows = rows;
  for (const layer of scene.layers) {
    if (layer.kind !== 'cell') continue;
    for (const key of Object.keys(layer.cells)) {
      const { col, row } = parseCellKey(key);
      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        delete layer.cells[key];
      }
    }
  }
}
