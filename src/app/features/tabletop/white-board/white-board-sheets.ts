import { GridType } from '@axe/domain/tabletop/game-table';
import {
  createLayer,
  createScene,
  FreehandLayer,
  ImageLayer,
  MapLayer,
  MapScene,
  ShapeLayer,
  TextLayer,
} from '@axe/features/map-editor/model/scene';
import { MarkRef } from '@axe/features/tabletop/white-board/white-board-geometry';

/**
 * The sheet a new mark goes on.
 *
 * The one the reader is working on, if it takes marks of this sort and is not locked; the
 * topmost that does otherwise; and a fresh one on top if none does. A board with sheets is
 * what lets the plan be drawn once and the arrows over it rubbed out and drawn again.
 */
export function layerFor(scene: MapScene, kind: MapLayer['kind'], activeId?: string | null): MapLayer {
  const active = scene.layers.find((layer) => layer.id === activeId);
  if (active && active.kind === kind && !active.locked) return active;

  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i];
    if (layer.kind === kind && !layer.locked) return layer;
  }

  const made = createLayer(kind, kind);
  scene.layers.push(made);
  return made;
}

/** The sheet a pen stroke goes on, chosen as `layerFor` chooses, adding one when none will take it. */
export function freehandLayer(scene: MapScene, activeId?: string | null): FreehandLayer {
  return layerFor(scene, 'freehand', activeId) as FreehandLayer;
}

/** The sheet a line, arrow or shape goes on, chosen as `layerFor` chooses, adding one when none will take it. */
export function shapeLayer(scene: MapScene, activeId?: string | null): ShapeLayer {
  return layerFor(scene, 'shape', activeId) as ShapeLayer;
}

/** The sheet written words go on, chosen as `layerFor` chooses, adding one when none will take it. */
export function textLayer(scene: MapScene, activeId?: string | null): TextLayer {
  return layerFor(scene, 'text', activeId) as TextLayer;
}

/** The sheet a picture goes on, chosen as `layerFor` chooses, adding one when none will take it. */
export function imageLayer(scene: MapScene, activeId?: string | null): ImageLayer {
  return layerFor(scene, 'image', activeId) as ImageLayer;
}

/**
 * Rules the board at a chosen spacing without changing how big the board is.
 *
 * How wide the sheet is comes out of how many cells it has and how big each one is, so ruling
 * it more finely has to buy back the size in cells or the sheet shrinks under the drawing.
 */
export function ruleBoard(scene: MapScene, widthPx: number, heightPx: number, spacing: number): void {
  scene.cellPx = spacing;
  scene.cols = Math.max(1, Math.round(widthPx / spacing));
  scene.rows = Math.max(1, Math.round(heightPx / spacing));
}

/** A board's own surface: no grid, and nothing painted under what is drawn on it. */
export function createBoardScene(cols: number, rows: number, cellPx: number): MapScene {
  const scene = createScene(cols, rows, cellPx, GridType.SQUARE);
  scene.gridVisible = false;
  scene.background = 'transparent';
  return scene;
}

/** A bundle of sheets, kept together so a whole part of the drawing can be hidden at once. */
export interface LayerGroup {
  name: string;
  layers: MapLayer[];
}

/**
 * The sheets as they are stacked, gathered into the bundles they are filed under.
 *
 * Sheets in one bundle are shown together wherever the topmost of them sits, so hiding the
 * bundle hides the whole of a drawing rather than one sheet of it at a time.
 */
export function groupLayers(scene: MapScene): LayerGroup[] {
  const groups: LayerGroup[] = [];
  const byName = new Map<string, LayerGroup>();

  for (let i = scene.layers.length - 1; i >= 0; i--) {
    const layer = scene.layers[i];
    const name = layer.group ?? '';
    if (!name) {
      groups.push({ name: '', layers: [layer] });
      continue;
    }
    const found = byName.get(name);
    if (found) {
      found.layers.push(layer);
      continue;
    }
    const made: LayerGroup = { name, layers: [layer] };
    byName.set(name, made);
    groups.push(made);
  }

  return groups;
}

/** The bundles that exist, so a sheet can be filed under one that is already there. */
export function groupNames(scene: MapScene): string[] {
  const names = new Set<string>();
  for (const layer of scene.layers) {
    if (layer.group) names.add(layer.group);
  }
  return [...names];
}

/** Files a sheet under a bundle by name; an empty name takes it out of any bundle. */
export function fileUnder(layer: MapLayer, group: string): void {
  layer.group = group.length > 0 ? group : undefined;
}

/** Renames a bundle, taking every sheet in it with the name. */
export function renameGroup(scene: MapScene, from: string, to: string): void {
  for (const layer of scene.layers) {
    if (layer.group === from) layer.group = to.length > 0 ? to : undefined;
  }
}

/** Shows or hides every sheet in a bundle together; the empty name means the sheets in no bundle. */
export function showGroup(scene: MapScene, name: string, visible: boolean): void {
  for (const layer of scene.layers) {
    if ((layer.group ?? '') === name) layer.visible = visible;
  }
}

/** The sheet a written mark lives on, which is not always the one being worked on. */
export function sheetHolding(scene: MapScene, ref: MarkRef): MapLayer | null {
  for (const layer of scene.layers) {
    if (layer.kind === 'text' && ref.kind === 'text' && layer.items.some((item) => item.id === ref.id)) return layer;
    if (layer.kind === 'shape' && ref.kind === 'shape' && layer.items.some((item) => item.id === ref.id)) return layer;
    if (layer.kind === 'image' && ref.kind === 'image' && layer.items.some((item) => item.id === ref.id)) return layer;
    if (layer.kind === 'freehand' && ref.kind === 'stroke' && layer.strokes.some((item) => item.id === ref.id)) {
      return layer;
    }
  }
  return null;
}

/** Everything on one sheet is swept off, leaving the sheet and everything under it. */
export function clearSheet(layer: MapLayer): void {
  if (layer.kind === 'freehand') layer.strokes = [];
  if (layer.kind === 'shape' || layer.kind === 'text' || layer.kind === 'image') layer.items = [];
  if (layer.kind === 'cell') layer.cells = {};
  if (layer.kind === 'stamp') layer.items = [];
}
