import { CutIn } from '@axe/domain/media/cut-in';
import { CutInLayer, type CutInLayerKind } from '@axe/domain/media/cut-in-layer';
import { CutInScene } from '@axe/domain/media/cut-in-scene';
import type { DropSide } from '@axe/ui/dragging/row-reorder';
import { reorderRows } from '@axe/ui/dragging/row-reorder';

/** What the editor does to a scene. Each one leaves the model as the next commit will find it. */

/** The scene of a cut-in, making one the first time the editor is opened on it. */
export function ensureScene(cutIn: CutIn): CutInScene {
  const existing = cutIn.scene;
  if (existing) return existing;

  const scene = new CutInScene();
  scene.initialize();
  scene.cutInIdentifier = cutIn.identifier;
  return scene;
}

/** A layer laid on top of the others, sized to sit inside the cut-in. */
export function addLayer(
  scene: CutInScene,
  kind: CutInLayerKind,
  name: string,
  within: { width: number; height: number }
): CutInLayer {
  const layer = new CutInLayer();
  layer.initialize();
  layer.kind = kind;
  layer.name = name;
  layer.width = Math.max(8, Math.round(within.width * (kind === 'fill' ? 1 : 0.5)));
  layer.height = Math.max(8, Math.round(within.height * (kind === 'text' ? 0.2 : kind === 'fill' ? 0.25 : 0.5)));
  layer.x = Math.round((within.width - layer.width) / 2);
  layer.y = Math.round((within.height - layer.height) / 2);
  if (kind === 'text') layer.text = name;

  scene.appendChild(layer);
  return layer;
}

/** A copy of a layer, laid directly on top of the one it came from. */
export function duplicateLayer(scene: CutInScene, layer: CutInLayer): CutInLayer | null {
  if (!scene.layers.includes(layer)) return null;

  const copy = layer.clone();
  copy.name = nextCopyName(
    scene.layers.map((existing) => existing.name),
    layer.name
  );
  scene.appendChild(copy);
  return copy;
}

/** Destroys a layer of the scene, answering false when the layer is not one of the scene's own. */
export function removeLayer(scene: CutInScene, layer: CutInLayer): boolean {
  if (!scene.layers.includes(layer)) return false;
  layer.destroy();
  return true;
}

/** The order after a row has been dragged onto another, or none where nothing moved. */
export function reorderLayers(
  scene: CutInScene,
  held: CutInLayer,
  over: CutInLayer,
  side: DropSide | null
): CutInLayer[] | null {
  const order = reorderRows(scene.layers, held, over, side);
  if (!order) return null;

  for (const layer of order) scene.appendChild(layer);
  return order;
}

/**
 * A name for a copy, counting up past whatever is already taken.
 *
 * A name already ending in a number counts on from it rather than growing another.
 */
export function nextCopyName(taken: readonly string[], name: string): string {
  const stem = name.replace(/\s+\d+$/, '').trim();
  const base = stem.length > 0 ? stem : name;

  for (let count = 2; count < 1000; count++) {
    const candidate = `${base} ${count}`;
    if (!taken.includes(candidate)) return candidate;
  }
  return base;
}
