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

/** Whether a cell lies within the scene's columns and rows. */
export function inBounds(scene: MapScene, col: number, row: number): boolean {
  return col >= 0 && col < scene.cols && row >= 0 && row < scene.rows;
}

/** Paints one cell of a cell layer with a fill, replacing whatever was there. */
export function setCell(layer: CellLayer, col: number, row: number, fill: FillStyle): void {
  layer.cells[cellKey(col, row)] = fill;
}

/** Clears one cell of a cell layer. */
export function eraseCell(layer: CellLayer, col: number, row: number): void {
  delete layer.cells[cellKey(col, row)];
}

/** The fill painted on one cell of a cell layer, or null when the cell is unpainted. */
export function getCell(layer: CellLayer, col: number, row: number): FillStyle | null {
  return layer.cells[cellKey(col, row)] ?? null;
}

/** Paints one cell for what it does. The key alone is the record; there is no fill to keep. */
export function setFunctionCell(layer: FunctionLayer, col: number, row: number): void {
  layer.cells[cellKey(col, row)] = true;
}

/** Clears one cell of a function layer. */
export function eraseFunctionCell(layer: FunctionLayer, col: number, row: number): void {
  delete layer.cells[cellKey(col, row)];
}

/**
 * Paints the connected run of cells that match the starting cell's fill, as the bucket tool does.
 *
 * Cells join through shared edges on the scene's own grid, hex included, and the fill never leaves
 * the scene. An unpainted start spreads only over unpainted cells. Nothing happens outside the
 * scene or when the start already has this fill.
 */
export function floodFill(scene: MapScene, layer: CellLayer, col: number, row: number, fill: FillStyle): void {
  if (!inBounds(scene, col, row)) return;
  const startFill = getCell(layer, col, row);
  if (fillStyleEquals(startFill, fill)) return;

  // The fill being spread over is written out once and each cell weighed against that, rather
  // than both being written out again at every one of the four or six ways out of every cell.
  const startKey = JSON.stringify(startFill);
  const spreadsOver = (cell: FillStyle | null): boolean => cell === startFill || JSON.stringify(cell) === startKey;

  const cols = scene.cols;
  const queue = new Int32Array(cols * scene.rows);
  const visited = new Uint8Array(cols * scene.rows);
  let head = 0;
  let tail = 0;
  queue[tail++] = row * cols + col;
  visited[row * cols + col] = 1;

  while (head < tail) {
    const at = queue[head++];
    const c = at % cols;
    const r = (at - c) / cols;
    if (spreadsOver(getCell(layer, c, r))) {
      setCell(layer, c, r, fill);
    }
    const neighbors = cellNeighbors(scene.gridType, c, r);
    for (const [nc, nr] of neighbors) {
      if (!inBounds(scene, nc, nr)) continue;
      const nearby = nr * cols + nc;
      if (visited[nearby] || !spreadsOver(getCell(layer, nc, nr))) continue;
      visited[nearby] = 1;
      queue[tail++] = nearby;
    }
  }
}

/** Puts a layer on top of the others. */
export function addLayer(scene: MapScene, layer: MapLayer): void {
  scene.layers.push(layer);
}

/** Removes the layer with this id; nothing happens when there is none. */
export function removeLayer(scene: MapScene, layerId: string): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx !== -1) scene.layers.splice(idx, 1);
}

/** The layer with this id, or undefined when the scene has none. */
export function findLayer(scene: MapScene, layerId: string): MapLayer | undefined {
  return scene.layers.find((l) => l.id === layerId);
}

/**
 * Moves a layer `delta` places through the stack, a positive delta towards the top, stopping at
 * either end.
 */
export function moveLayer(scene: MapScene, layerId: string, delta: number): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const target = Math.max(0, Math.min(scene.layers.length - 1, idx + delta));
  if (target === idx) return;
  const [layer] = scene.layers.splice(idx, 1);
  scene.layers.splice(target, 0, layer);
}

/**
 * Moves a layer to a given place in the stack, clamped to the stack; nothing happens when there is
 * no such layer.
 */
export function reorderLayer(scene: MapScene, layerId: string, toIndex: number): void {
  const idx = scene.layers.findIndex((l) => l.id === layerId);
  if (idx === -1) return;
  const clamped = Math.max(0, Math.min(scene.layers.length - 1, toIndex));
  if (clamped === idx) return;
  const [layer] = scene.layers.splice(idx, 1);
  scene.layers.splice(clamped, 0, layer);
}

/** Adds a shape to a shape layer, giving it a fresh id when it arrives without one. */
export function addShape(layer: ShapeLayer, item: ShapeItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

/**
 * Merges changes into the shape with this id, which keeps its id; nothing happens when there is
 * none.
 */
export function updateShape(layer: ShapeLayer, id: string, patch: Partial<ShapeItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

/** Removes the shape with this id from the layer, when it is there. */
export function removeShape(layer: ShapeLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

/** Adds a stamp to a stamp layer, giving it a fresh id when it arrives without one. */
export function addStamp(layer: StampLayer, item: StampItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

/**
 * Merges changes into the stamp with this id, which keeps its id; nothing happens when there is
 * none.
 */
export function updateStamp(layer: StampLayer, id: string, patch: Partial<StampItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

/** Removes the stamp with this id from the layer, when it is there. */
export function removeStamp(layer: StampLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

/** Adds an image to an image layer, giving it a fresh id when it arrives without one. */
export function addImage(layer: ImageLayer, item: ImageItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

/**
 * Merges changes into the image with this id, which keeps its id; nothing happens when there is
 * none.
 */
export function updateImage(layer: ImageLayer, id: string, patch: Partial<ImageItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

/** Removes the image with this id from the layer, when it is there. */
export function removeImage(layer: ImageLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

/** Adds a freehand stroke to the layer, giving it a fresh id when it arrives without one. */
export function addStroke(layer: FreehandLayer, stroke: FreehandStroke): void {
  if (!stroke.id) stroke.id = newId();
  layer.strokes.push(stroke);
}

/** Removes the stroke with this id from the layer, when it is there. */
export function removeStroke(layer: FreehandLayer, id: string): void {
  const idx = layer.strokes.findIndex((s) => s.id === id);
  if (idx !== -1) layer.strokes.splice(idx, 1);
}

/**
 * Merges changes into the stroke with this id, which keeps its id; nothing happens when there is
 * none.
 */
export function updateStroke(layer: FreehandLayer, id: string, patch: Partial<FreehandStroke>): void {
  const idx = layer.strokes.findIndex((s) => s.id === id);
  if (idx !== -1) layer.strokes[idx] = { ...layer.strokes[idx], ...patch, id };
}

/**
 * Rubs a circle out of a freehand stroke and returns the pieces left on either side of it.
 *
 * Points inside the circle go, and a piece of fewer than two points is dropped with them. The
 * pieces keep the stroke's colour and width but have an empty id, for the caller to add in place of
 * the stroke. Null when the circle touches no point, so the stroke can be left as it is.
 */
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

/** Adds a text item to a text layer, giving it a fresh id when it arrives without one. */
export function addText(layer: TextLayer, item: TextItem): void {
  if (!item.id) item.id = newId();
  layer.items.push(item);
}

/**
 * Merges changes into the text item with this id, which keeps its id; nothing happens when there is
 * none.
 */
export function updateText(layer: TextLayer, id: string, patch: Partial<TextItem>): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items[idx] = { ...layer.items[idx], ...patch, id };
}

/** Removes the text item with this id from the layer, when it is there. */
export function removeText(layer: TextLayer, id: string): void {
  const idx = layer.items.findIndex((i) => i.id === id);
  if (idx !== -1) layer.items.splice(idx, 1);
}

/**
 * Changes the scene's size in cells and drops painted and function cells that fall outside it.
 *
 * Shapes, stamps, strokes, text and images keep their positions, even where those now lie off the
 * scene.
 */
export function resizeScene(scene: MapScene, cols: number, rows: number): void {
  scene.cols = cols;
  scene.rows = rows;
  for (const layer of scene.layers) {
    // Painted function cells are trimmed with the drawn ones. Left outside the scene they are
    // still built when it is set as the table, so a board made smaller would put walls
    // and cover off the edge of it: sent to every peer, stopping sight and light out there,
    // and nowhere to be seen in the editor that made them.
    if (layer.kind !== 'cell' && layer.kind !== 'function') continue;
    const cells: Record<string, unknown> = layer.cells;
    for (const key of Object.keys(cells)) {
      const { col, row } = parseCellKey(key);
      if (col < 0 || col >= cols || row < 0 || row >= rows) {
        delete cells[key];
      }
    }
  }
}
