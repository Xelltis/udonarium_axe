import { ImageLayer, MapLayer, MapScene, sceneHeightPx, sceneWidthPx } from '@axe/features/map-editor/model/scene';
import { imageBox } from '@axe/features/tabletop/white-board/white-board-scene';

export interface LivePicture {
  id: string;
  imageIdentifier: string;
  left: number;
  top: number;
  width: number;
  height: number;
  transform: string;
  opacity: number;
}

/**
 * The pictures on a board that have to be hung rather than painted.
 *
 * What the board wears is one flat picture, and a flat picture does not move. A drawing that
 * moves is left out of it and hung over the top instead, in the place the paint would have
 * put it. One cropped or cut to the cells is not: the paint can do those and a hung picture
 * cannot, so it keeps its place in the picture and stands still.
 */
export function livePicturesOf(
  scene: MapScene | null,
  boardWidth: number,
  boardHeight: number,
  isAnimated: (imageIdentifier: string) => boolean
): LivePicture[] {
  if (!scene || boardWidth <= 0 || boardHeight <= 0) return [];

  const sceneWidth = sceneWidthPx(scene);
  const sceneHeight = sceneHeightPx(scene);
  if (sceneWidth <= 0 || sceneHeight <= 0) return [];

  // The board wears its picture at bg-contain, so what is hung over it is placed the same way.
  const scale = Math.min(boardWidth / sceneWidth, boardHeight / sceneHeight);
  const offsetX = (boardWidth - sceneWidth * scale) / 2;
  const offsetY = (boardHeight - sceneHeight * scale) / 2;

  const hangable = hangablePictureIds(scene, isAnimated);
  const hung: LivePicture[] = [];
  for (const layer of scene.layers) {
    if (layer.kind !== 'image' || !layer.visible) continue;
    for (const item of (layer as ImageLayer).items) {
      if (!hangable.has(item.id)) continue;
      const box = imageBox(item);
      hung.push({
        id: item.id,
        imageIdentifier: item.imageIdentifier,
        left: offsetX + box.x * scale,
        top: offsetY + box.y * scale,
        width: box.w * scale,
        height: box.h * scale,
        transform: transformOf(item.rotation, item.flipX, item.flipY),
        opacity: alphaOf(layer.opacity) * alphaOf(item.opacity),
      });
    }
  }
  return hung;
}

/**
 * Which drawings are hung over the board's picture rather than painted into it.
 *
 * The same reading serves the board and the editor that takes its picture, so that what is
 * hung is never also painted. A picture is hung when it moves, when the paint could not put
 * it where a hung one goes anyway, and when nothing is drawn over it: a hung picture sits
 * above the whole picture the board wears, and would otherwise cover the lines and words
 * somebody drew on top of it.
 */
export function hangablePictureIds(
  scene: MapScene | null,
  isAnimated: (imageIdentifier: string) => boolean
): Set<string> {
  const hangable = new Set<string>();
  if (!scene) return hangable;

  const topDrawn = topmostDrawnIndex(scene.layers);
  for (const [index, layer] of scene.layers.entries()) {
    if (layer.kind !== 'image' || !layer.visible || index < topDrawn) continue;
    for (const item of (layer as ImageLayer).items) {
      if (!item.imageIdentifier || !isAnimated(item.imageIdentifier)) continue;
      if (item.clipToCells) continue;
      if (item.crop && item.crop.w > 0 && item.crop.h > 0) continue;
      hangable.add(item.id);
    }
  }
  return hangable;
}

/** The highest layer anybody has actually drawn on; empty layers hide nothing. */
function topmostDrawnIndex(layers: readonly MapLayer[]): number {
  let top = 0;
  for (const [index, layer] of layers.entries()) {
    if (layer.visible && hasContent(layer)) top = index;
  }
  return top;
}

function hasContent(layer: MapLayer): boolean {
  switch (layer.kind) {
    case 'cell':
    case 'function':
      return Object.keys(layer.cells).length > 0;
    case 'freehand':
      return layer.strokes.length > 0;
    default:
      return layer.items.length > 0;
  }
}

function transformOf(rotation: number, flipX?: boolean, flipY?: boolean): string {
  const parts: string[] = [];
  if (Number.isFinite(rotation) && rotation !== 0) parts.push(`rotate(${rotation}deg)`);
  if (flipX || flipY) parts.push(`scale(${flipX ? -1 : 1}, ${flipY ? -1 : 1})`);
  return parts.join(' ');
}

function alphaOf(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}
