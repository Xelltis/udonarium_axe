import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import { DEFAULT_FUNCTION_SPEC, MapFunctionRole } from '@axe/features/map-editor/model/function-layer';
import { createScene, FunctionLayer, ImageLayer, MapScene, newId } from '@axe/features/map-editor/model/scene';

export type { TableSnapshot };

export const IMPORTED_FLOOR_LAYER_NAME = 'floor';

function functionLayer(role: MapFunctionRole, name: string, cells: readonly string[]): FunctionLayer {
  const held: Record<string, true> = {};
  for (const key of cells) held[key] = true;
  return {
    id: newId(),
    kind: 'function',
    name,
    visible: true,
    locked: false,
    opacity: 1,
    role,
    cells: held,
    spec: { ...DEFAULT_FUNCTION_SPEC },
  };
}

/**
 * The scene a table comes into the editor as.
 *
 * The floor arrives as a picture rather than as the shapes that made it: it was baked into
 * one the moment it was laid on the table, and there is nothing to take back apart. It is
 * locked, so that painting over the map cannot drag the map itself about.
 *
 * Only what the editor painted comes back as cells. Anything a person placed by hand is left
 * on the table where it stands, out of the editor's reach and out of its way.
 */
export function sceneFromTable(table: TableSnapshot): MapScene {
  const scene = createScene(
    Math.max(1, Math.floor(table.cols)),
    Math.max(1, Math.floor(table.rows)),
    Math.max(1, Math.floor(table.cellPx)),
    table.gridType
  );

  const layers: MapScene['layers'] = [];
  if (table.floorImageIdentifier.length > 0) {
    const floor: ImageLayer = {
      id: newId(),
      kind: 'image',
      name: IMPORTED_FLOOR_LAYER_NAME,
      visible: true,
      locked: true,
      opacity: 1,
      items: [
        {
          id: newId(),
          imageIdentifier: table.floorImageIdentifier,
          x: 0,
          y: 0,
          w: scene.cols * scene.cellPx,
          h: scene.rows * scene.cellPx,
          rotation: 0,
          opacity: 1,
        },
      ],
    };
    layers.push(floor);
  }

  if (table.maskCells.length > 0) layers.push(functionLayer('mask', 'mask', table.maskCells));
  if (table.terrainCells.length > 0) layers.push(functionLayer('terrain', 'terrain', table.terrainCells));
  if (table.blockedCells.length > 0) layers.push(functionLayer('moveBlock', 'no entry', table.blockedCells));

  return { ...scene, layers };
}
