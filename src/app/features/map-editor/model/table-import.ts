import { CellRect, rectCells } from '@axe/domain/tabletop/cell-rectangles';
import { TableSnapshot } from '@axe/domain/tabletop/table-snapshot';
import {
  DEFAULT_FUNCTION_SPEC,
  FunctionSpec,
  lookKey,
  MapFunctionRole,
} from '@axe/features/map-editor/model/function-layer';
import {
  createScene,
  FunctionLayer,
  ImageLayer,
  MapScene,
  newId,
  sceneHeightPx,
  sceneWidthPx,
} from '@axe/features/map-editor/model/scene';

export type { TableSnapshot };

export const IMPORTED_FLOOR_LAYER_NAME = 'floor';

function functionLayer(
  role: MapFunctionRole,
  name: string,
  cells: readonly string[],
  spec: FunctionSpec = DEFAULT_FUNCTION_SPEC
): FunctionLayer {
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
    spec: { ...spec },
  };
}

/**
 * The blocks gathered into one layer per look.
 *
 * Two walls of different stone are two layers. Poured into one they would come back out
 * wearing whichever look happened to be read first, and half the table would change its
 * face the next time the painting was laid.
 */
function layersByLook<T extends CellRect & { spec: unknown }>(
  blocks: readonly T[],
  role: MapFunctionRole,
  name: string,
  specOf: (block: T) => FunctionSpec
): FunctionLayer[] {
  const grouped = new Map<string, { spec: FunctionSpec; cells: string[] }>();
  for (const block of blocks) {
    const key = lookKey(block.spec);
    const held = grouped.get(key) ?? { spec: specOf(block), cells: [] };
    held.cells.push(...rectCells(block));
    grouped.set(key, held);
  }
  return [...grouped.values()].map((held, index) =>
    functionLayer(role, grouped.size > 1 ? `${name} ${index + 1}` : name, held.cells, held.spec)
  );
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

  // A picture is placed by its middle rather than its corner, so a floor put at the origin
  // would hang off the top left with only a quarter of it over the map.
  const width = sceneWidthPx(scene);
  const height = sceneHeightPx(scene);

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
          x: width / 2,
          y: height / 2,
          w: width,
          h: height,
          rotation: 0,
          opacity: 1,
        },
      ],
    };
    layers.push(floor);
  }

  layers.push(
    ...layersByLook(table.maskBlocks, 'mask', 'mask', (block) => ({ ...DEFAULT_FUNCTION_SPEC, mask: block.spec }))
  );
  layers.push(
    ...layersByLook(table.terrainBlocks, 'terrain', 'terrain', (block) => ({
      ...DEFAULT_FUNCTION_SPEC,
      terrain: block.spec,
    }))
  );
  if (table.blockedCells.length > 0) layers.push(functionLayer('moveBlock', 'no entry', table.blockedCells));

  return { ...scene, layers };
}
