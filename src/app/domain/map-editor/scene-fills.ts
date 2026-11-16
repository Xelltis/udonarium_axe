import { FillStyle, MapScene } from '@axe/domain/map-editor/scene';

/**
 * Visits every fill a scene paints with: the fill of each cell of a cell layer, and the fill and
 * the stroke's fill of each shape, where it has them. A hidden layer's fills count as the others'.
 */
export function forEachSceneFill(scene: MapScene, visit: (fill: FillStyle) => void): void {
  for (const layer of scene.layers) {
    if (layer.kind === 'cell') {
      for (const fill of Object.values(layer.cells)) if (fill) visit(fill);
    } else if (layer.kind === 'shape') {
      for (const item of layer.items) {
        if (item.fill) visit(item.fill);
        if (item.stroke?.fill) visit(item.stroke.fill);
      }
    }
  }
}
